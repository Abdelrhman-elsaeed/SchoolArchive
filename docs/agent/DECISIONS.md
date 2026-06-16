# DECISIONS.md - Architectural Decisions Log

This document records the primary architectural decisions, flow policies, and design selections for the **الأرشيف المدرسي العربي** (Arabic School Archive) project.

---

## 1. Tenancy Model: Cost-Aware Logical Multi-Tenancy (Approved)

### Decision
The system utilizes a single shared application deployment, a shared n8n cluster, a shared Azure SQL Database, and a shared Azure Blob Storage container. Complete logical data isolation is enforced at the database layer (via query filters) and the storage layer (via directory paths). 

### Alternatives Considered & Rejected in v1
1. **Dedicated Deployment per School**
   - *Description*: Running separate server containers and endpoints for each school tenant.
   - *Rejection Rationale*: Rejected due to high operational and hosting costs. Managing hundreds of independent server endpoints is inefficient for an early stage MVP.
2. **Dedicated DB per School**
   - *Description*: Provisioning a distinct physical SQL database instance for each school.
   - *Rejection Rationale*: Rejected due to pricing constraints (Azure SQL Database minimum compute fees per database make this financially unviable for budget school subscriptions) and the extreme overhead of migrating schemas across separate databases during updates.
3. **Dedicated n8n Instance per School**
   - *Description*: Running and configuring a unique n8n deployment for each school.
   - *Rejection Rationale*: Provisioning individual n8n environments creates excessive memory/compute demands and makes central updates to classification flows slow and complex.

### Approved v1 Economics
- A shared infrastructure model with logical isolation is selected for v1. It ensures the lowest possible baseline hosting cost and simple, centralized maintenance, while relying on strict programmatic tenancy boundaries to ensure data security.

---

## 2. File Upload Flow: n8n First, Database Last (Approved)

### Decision
To guarantee consistency without distributed transactions, every file uploaded MUST follow a strict sequential order in the backend:
1. **Validate**: Perform MIME-type, size, and extension validation.
2. **Call n8n Webhook**: Send the single file payload to n8n first.
3. **Upload to Blob Storage**: If n8n succeeds, upload the original file to private Azure Blob Storage.
4. **Save Metadata to DB**: If Blob upload succeeds, write the record to Azure SQL DB.

```
[Client] --> [Backend Validate] --> [n8n Webhook] --> [Azure Blob Storage] --> [Azure SQL DB]
                                    (Step 1)           (Step 2)                (Step 3 - Final)
```

### Flow Policies
- **No Database Row if n8n Fails**: If n8n returns an error or fails to respond, the file is immediately rejected. No record is saved in SQL, and no file is uploaded to Azure Blob.
- **No Database Row if Blob Upload Fails**: If Blob Storage returns a failure, the SQL transaction is never executed. 
- **No Automatic Retry**: In this phase, if a step fails, the system immediately returns a failure code for that file. There is no queue-based retry mechanism.
- **Database Stores Metadata Only**: No binary file content or base64 streams will ever be stored in Azure SQL Database. DB only stores tracking schemas, classification properties returned from n8n, file sizes, timestamps, and Blob Storage URIs.

---

## 3. Storage Architecture: Private-Only Azure Blob (Approved)

### Decision
All school archives are stored in a single Azure Blob Storage container with private access configurations.
- **Path Convention**: `schools/{schoolId}/archive/{yyyy}/{MM}/{guid}_{safeFileName}`
- **No Public URLs**: Blobs are private. Files can only be retrieved by authenticated users with a generated Shared Access Signature (SAS) token that expires after 5-15 minutes.

---

## 4. Multi-File Orchestration: Partial Success Model (Approved)

### Decision
Since n8n webhook only accepts one file per HTTP request, the backend application layer must orchestrate multi-file uploads by looping through input files sequentially.
- **Granular Response**: The API response must report status for every file individually. A failure in file #2 does not rollback the successful upload of file #1.
- **Filename Preservation**: The response must contain the original filename for every file, enabling the frontend to highlight errors next to specific documents.

---

## 5. Subscription Lock Behavior (Approved)

### Decision
Subscriptions are validated on every request server-side.
- If a subscription has expired and passed the 7-day grace period:
  - File uploads are blocked (returns `402 Payment Required`).
  - Search queries and archive browsing are blocked.
  - Protected page operations are locked.
- The UI will display a clean "Renewal Required" lock screen, but the enforcement is strictly server-side.

---

## 6. Deferred Features
- **Auto-Retry Queues**: Deferred. Failures are handled synchronously by reporting them to the client.
- **Automated Payment Gateway**: Deferred. Subscriptions will be updated manually or via an admin dashboard in the initial release.
- **Direct School-to-School File Transfers**: Deferred.

---

## 7. Phase 1 Design Decisions

The following decisions are locked by the Phase 1 design artifacts. They refine the Phase 0 baseline and must be honored by Phase 2+ implementation.

### D-07: Frontend Upload Transport
- **Decision**: The React frontend posts files to the backend using `multipart/form-data` with a single form field named `files` that may contain one or more file parts. The frontend also sends a `schoolId`-less request and relies entirely on the authenticated principal — the server derives the school context.
- **Rationale**: Carrying `schoolId` from the client invites impersonation. The server must be the only source of `school_id`.
- **Rejected**: Query string `schoolId` parameter, body JSON wrapper with `schoolId`.

### D-08: Upload Endpoint Envelope
- **Decision**: Single endpoint `POST /api/v1/archive/upload` handles both single and multi-file uploads. The response is always HTTP `200 OK` with a body that contains a per-file `results` array (multi-status semantics). The top-level `failedFiles` counter tells the client whether any item failed; per-file `status` is the source of truth.
- **Rationale**: Returning `400`/`500` for partial failures breaks the partial-success contract. Returning `207 Multi-Status` is not used by typical browser `fetch` clients — embedding multi-status semantics inside `200` is more portable and aligns with the established `MULTI_FILE_UPLOAD.md` example.
- **Rejected**: HTTP `207 Multi-Status`, HTTP `400` for any failure.

### D-09: Backend-to-n8n Transport
- **Decision**: Backend forwards exactly one file per HTTP request to the n8n webhook using `multipart/form-data` with the form field name `file`. The backend adds two non-file fields: `schoolId` (UUID string) and `documentId` (UUID string, server-generated UUID used as a correlation id for that file's orchestration cycle).
- **Rationale**: `schoolId` is propagated so n8n can apply any school-scoped classification rules. `documentId` is propagated so n8n logs and any future async callback can refer to a stable identifier even though the DB row is written last.
- **Rejected**: Sending multiple files in one request, omitting `documentId` (forces n8n to invent one and breaks traceability).

### D-10: Per-File Status Taxonomy
- **Decision**: Each per-file result exposes exactly one of four values in its `status` field:
  - `Pending` — file accepted by controller, orchestration not yet started (reserved for future streaming UX; not produced in v1 unless explicitly emitted).
  - `Success` — all four orchestration steps completed and DB row was written.
  - `Rejected` — failed at the validation step (extension / size / MIME). Steps 2, 3, 4 were never executed.
  - `Failed` — passed validation but failed at n8n, Blob, or DB step.
- **Rationale**: A two-state outcome (`Success` vs. error) is ambiguous about which step failed and confuses UI error mapping. Splitting `Rejected` (validation) from `Failed` (runtime) lets the UI distinguish "your file is the wrong type" from "our classification service is down".
- **Rejected**: Boolean `success` flag, single `errorCode` enum.

### D-11: DB Row Primary Key
- **Decision**: The archive row primary key is `documentId` of type `UNIQUEIDENTIFIER` (UUID v4) generated server-side in the backend before any external call. It is **not** an `IDENTITY` integer.
- **Rationale**: A UUID PK (a) prevents cross-school enumeration of archived records by inspecting sequential IDs, (b) lets the backend use the same id as a Blob name suffix and an n8n correlation id without translation, (c) removes the need for a round-trip to the DB to learn the new id. The same `documentId` is allocated **before** the n8n call so it can be propagated as a correlation id.
- **Rejected**: `INT IDENTITY` PK, GUID generated by n8n, GUID generated by DB `NEWID()` default.

### D-12: Blob Object Name Format
- **Decision**: All archived files are stored under object names of the form:
  `schools/{schoolId}/archive/{yyyy}/{MM}/{documentId}_{safeFileName}`
  where:
  - `schoolId` is the authenticated tenant's UUID.
  - `{yyyy}/{MM}` is the UTC year/month of the upload's server-side processing time.
  - `documentId` is the same UUID allocated in D-11.
  - `safeFileName` is the original filename, sanitized: spaces replaced with `_`, all non-`[A-Za-z0-9._-]` characters percent-encoded or stripped, max length 100 chars, then truncated to a max 120-char total suffix length.
- **Rationale**: The leading `schools/{schoolId}/` is the storage-layer tenant boundary; `documentId` uniqueness guarantees no collisions; the time prefix aids lifecycle management (cool/archive tier routing) and manual ops debugging.
- **Rejected**: Flat container with random GUIDs only (loses tenant scoping at the storage layer), user-supplied filenames as object names (security risk, encoding hazards).

### D-13: Three Enforcement Points for School Isolation
- **Decision**: School isolation is enforced at three distinct, layered points; bypassing any one is a critical security incident:
  1. **Authentication/Authorization boundary**: Auth middleware resolves the authenticated principal and exposes `schoolId` via a request-scoped context (e.g., `ICurrentSchoolContext`). Controllers must never accept `schoolId` from the request body or query.
  2. **EF Core Global Query Filters**: Every tenant-scoped entity (e.g., `Archive`, `Category`, `Tag`, `AuditLog`) registers a global query filter `WHERE school_id = @currentSchoolId` parameterized at query time. No raw SQL or manual `Where` clause may bypass this.
  3. **Blob path construction**: The storage service is the only component that builds Blob object names, and it always prefixes `schools/{schoolId}/`. A unit test must assert that the storage service rejects any caller attempting to write outside this prefix.
- **Rationale**: A single layer is insufficient — query filters can be bypassed with raw SQL, controller code can be careless, and storage code can drift. Layered enforcement means at least one boundary catches a misconfiguration.
- **Rejected**: Isolation at DB only, isolation at controller only, isolation at storage only.

### D-14: Subscription Check Placement (Future Phase 6)
- **Decision**: Subscription enforcement is not implemented in Phase 1, but its exact pipeline placement is locked now to avoid retrofitting:
  - **Order of middlewares** (outermost to innermost): Exception handling → Request logging → Authentication → **`SubscriptionGuardMiddleware`** → Authorization → Controller binding.
  - `SubscriptionGuardMiddleware` reads the `schoolId` from the authenticated principal, loads the subscription row (cached per-request), and short-circuits with `402 Payment Required` if status is `Expired` past grace, `Suspended`, or `Canceled`.
  - The middleware applies to **all** `/api/v1/**` routes by default; specific opt-out routes (e.g., the subscription renewal admin endpoint) are listed in an allowlist attribute.
  - The check executes **before** the upload controller binds, so no file stream is read from the request body when the school is locked.
- **Rationale**: Reading a 20 MB file before rejecting an expired school wastes bandwidth and threads. Placing the check after auth but before model binding is the only correct position.
- **Rejected**: Subscription check inside controllers (too late, repeated code), inside the upload service (still too late, file already bound), inside the frontend (zero-trust violation).

### D-15: DocumentId Allocation Point
- **Decision**: The `documentId` is allocated by the backend inside the per-file orchestration loop, **immediately before** the n8n call. It is reused as the DB primary key, the Blob object name suffix, and the n8n correlation id.
- **Rationale**: If a transient DB failure occurs on insert, the controller can safely retry the insert using the same id (the row was never written). If the orchestration restarts mid-batch, the next attempt uses a fresh id, so the previous half-orphan is detectable (it has no row) and a future ops job can sweep the Blob object by listing `schools/{schoolId}/archive/...` and cross-referencing the DB.
- **Rejected**: Allocating `documentId` after Blob upload (loses correlation id for n8n), allocating it on a successful DB insert (too late, cannot pre-allocate Blob name).
