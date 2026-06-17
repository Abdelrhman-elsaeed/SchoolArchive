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

---

## 8. Phase 3 Notes (Appended, Non-Retroactive)

Phase 3 implements the multi-file loop on top of the locked Phase 1 design. **No locked decision in §1–§7 was modified.** The following notes record *how* Phase 1 decisions compose into the multi-file flow. They are observation, not ratification.

### 3-N1: Multi-File Composition of D-07/D-08/D-09/D-15
- D-07 (transport `files` form field) and D-08 (multi-status envelope inside `200 OK`) compose without modification: the controller binds `[FromForm] IFormFileCollection? files` and returns `Ok(BatchUploadResponse)`.
- D-09 (n8n single-file transport) is preserved per iteration: each file inside the batch becomes one HTTP request to the n8n webhook. The app layer, not n8n, is the multi-file surface.
- D-15 (`documentId` allocation point) is preserved per iteration: each file allocates its own `documentId` immediately before its n8n call, not once per batch.
- The single-file `file` form-field path is intentionally kept as a backward-compat branch; it is **not** a deprecated alias. Both forms are supported in v1.

### 3-N2: Per-File Status Emission
- Per D-10, the four-value taxonomy is `Success`, `Rejected`, `Failed`, `Pending`. The Phase 3 orchestrator emits only the first three. `Pending` remains reserved for a future streaming-UX phase and is **not** produced by any v1 code path. This is consistent with the Phase 1 wording ("reserved for future streaming UX; not produced in v1 unless explicitly emitted").

### 3-N3: `MaxBatchSizeBytes` Surface
- `Upload:MaxBatchSizeBytes` is enforced at the controller, *before* the orchestrator runs, as the sum of `files[i].Length`. This is a request-body-level cap, distinct from the per-file `Upload:MaxFileSizeBytes` enforced by the validator inside the loop. The two limits serve different purposes (request-level vs. file-level) and both are honored in the same request.

### 3-N4: Loop Defense-in-Depth
- The orchestrator's per-file `try/catch` around `UploadAsync` records any unhandled exception as `Failed/INTERNAL_ERROR` and continues with the next file. This is a defense-in-depth measure: the validator, n8n client, blob service, and repository all surface typed failures that map to known `reasonCode` values. The catch handles the unexpected case only and is itself covered by the xUnit suite (`UnhandledException_RecordedAsInternalError_Continues`).

### 3-N5: Non-Goals Confirmed
- No concurrent / parallel processing. The loop is strictly sequential (`foreach` + `await`).
- No retry mechanism. A failed file is reported once; the caller must resubmit.
- No cross-batch transaction. Successful files stay successful, failed files stay failed; no rollback of either side.

---

## 9. Phase 3 Approval (2026-06-17)

Phase 3 was **APPROVED** by the user on 2026-06-17. The decision log records the approval event for the audit trail. **No locked decision in §1–§7 or in §8 was modified, removed, or reinterpreted as part of this approval.** The approval is a confirmation that the implemented multi-file loop honors the locked Phase 1 contracts (D-07, D-08, D-09, D-10, D-15) as composed in `DECISIONS.md` §8 (3-N1..3-N5).

- **Final test result at sign-off**: 41/41 xUnit tests green.
- **Approved scope**: multi-file upload via the `files` form field, sequential processing, partial-success envelope, `MaxBatchSizeBytes` batch-level enforcement, single-file backward compatibility. All as implemented and documented in `PROGRESS.md` §3 and `TESTING.md` §2.5–§2.6.
- **Phase 4 dependencies satisfied**: yes. Phase 4 (Archive Browsing, Search & Retrieval) is now ACTIVE per `ROADMAP.md`.

---

## 9b. Phase 4 Approval (2026-06-17)

Phase 4 was **APPROVED** by the user on 2026-06-17. The decision log records the approval event for the audit trail. **No locked decision in §1–§7, §8, or §9 was modified, removed, or reinterpreted as part of this approval.** The approval is a confirmation that the implemented browse / search / download endpoints honor the locked Phase 1 contracts (D-11, D-12, D-13) as composed in `DECISIONS.md` §10 (4-N1..4-N6).

- **Final test result at sign-off**: 58/58 xUnit tests green (41 pre-Phase-4 + 17 new Phase 4 tests).
- **Approved scope**: `GET /archives` (list + search + filters + pagination), `GET /archives/{id}` (get-by-id), `GET /archives/{id}/download` (short-lived `Read`-only SAS, 5–15 min), `GET /archives/{id}/content` (dev-only stream), all enforcing server-side `schoolId` filtering. All as implemented and documented in `PROGRESS.md` §4 and `TESTING.md` §2.7–§2.8.
- **Phase 5 dependencies satisfied**: yes. Phase 5 (Security Hardening) is now ACTIVE per `ROADMAP.md`.

---

## 10. Phase 4 Notes (Appended, Non-Retroactive)

Phase 4 implements archive browsing, search, and retrieval on top of the locked Phase 1 design. **No locked decision in §1–§7 or in §8/§9 was modified.** The notes below record *how* the locked decisions compose into the read path. They are observation, not ratification.

### 4-N1: Composition of D-11 / D-12 / D-13 on the Read Path
- **D-11** (UUID v4 PK) is preserved: the browse controller's `GetById` and `Download` use the `documentId` as the row lookup key, exactly as Phase 2/3 writes it.
- **D-12** (blob object name with tenant prefix) is preserved: the SAS generator refuses to build a SAS for any `blobObjectName` that does not start with `schools/{authenticatedSchoolId}/`. This is a defense-in-depth check on top of the repository filter.
- **D-13** (three enforcement points for school isolation) is preserved and extended:
  - **(a)** Auth boundary: the controller reads `school_id` from the principal via the same `TryGetSchoolId` helper used by the upload controller.
  - **(b)** EF Core / repository filter: every `IArchiveReadRepository` method takes `schoolId` as the first parameter and throws on `Guid.Empty`. The interface exposes no method that fetches by `documentId` alone.
  - **(c)** Blob path construction: the SAS generator and the dev-only `BlobDownloadService` both re-check the `schools/{schoolId}/` prefix before issuing a SAS or opening a stream.

### 4-N2: Cross-Tenant Response Shape
- A request for another school's `documentId` returns `404 Not Found` with body `{ "code": "ARCHIVE_NOT_FOUND" }`. The response body is intentionally identical to a non-existent id, so the endpoint does not leak existence.
- The decision to use `404` over `403` for cross-tenant reads is a Phase 4 implementation choice, not a modification of any Phase 1 decision. It is consistent with the Phase 1 wording for D-13 (no enumeration).

### 4-N3: SAS Lifetime
- The `BlobSasBuilder` is built with `BlobSasPermissions.Read` only, a `StartsOn` of `nowUtc - 1 minute` (clock skew tolerance), and an `ExpiresOn` of `nowUtc + SasTtlMinutes` where `SasTtlMinutes` is clamped to the `[5, 15]` minute range.
- The clamp is implemented in `BlobSasGenerator.TtlMinutes` and bounded by `BlobOptions.SasTtlMinutesMin` / `SasTtlMinutesMax`. The default is `10` minutes.
- This honors the Phase 1 `STORAGE_CONTRACT.md` / DECISIONS §3 "Shared Access Signature that expires after 5-15 minutes" wording. The hard cap of 15 minutes is a server-side guard, not a client-side one — a malicious caller cannot ask for a longer TTL.

### 4-N4: Local-Dev Content Streaming
- The `GET /archives/{id}/content` route is a **dev-only** parity abstraction. It is registered only when both `ASPNETCORE_ENVIRONMENT=Development` **and** `LocalDev:DownloadStreamEnabled=true`. The auth and tenant checks run **before** the blob stream is opened.
- The route is **not** a production path. Production traffic uses the SAS URL from `GET /archives/{id}/download`. The dev route exists so the manual-QA script in `MANUAL_QA.md` can pull a file down without building a separate `az storage blob generate-sas` helper.

### 4-N5: Pagination Semantics
- The `page` query parameter is 1-indexed (default 1). The `pageSize` parameter defaults to 20 and is capped at 100. The repository orders results by `UploadedAtUtc` descending, so the most recently uploaded rows come first.
- Pagination is server-side only. There is no client-side hint; the response is bounded to the requested page.

### 4-N6: Non-Goals Confirmed
- No full-text search. The `originalNameContains` filter is a SQL `LIKE '%needle%'`. Arabic full-text search is deferred to Phase 5+.
- No SAS revocation. Once issued, a SAS is valid until its `ExpiresOn` (max 15 minutes).
- No bulk-export, no admin download, no streaming range requests on the dev `content` route.
- No EF Core migration was added. The `Archives` table from Phase 2/2.5/3 is reused as-is.

---

## 11. Phase 5 Notes (Appended, Non-Retroactive)

Phase 5 hardens the existing upload / browse / retrieval system. **No locked decision in §1–§7, §8, §9, §9b, or §10 was modified.** The notes below record *how* the locked decisions compose with the new defense layers. They are observation, not ratification.

### 5-N1: Magic-bytes Validation as a Composition of the Allowlist
- The Phase 1 allowlist (D-10) named four values for the per-file status taxonomy. Phase 5 adds two new `Rejected` reason codes (`MAGIC_BYTES_MISMATCH`, `MAGIC_BYTES_UNREADABLE`) inside the same envelope. No taxonomy value was renamed, removed, or re-ordered.
- The magic-bytes check runs **after** the existing extension and MIME checks. The order is: filename → extension → size → MIME → magic bytes. Each layer is allowed to short-circuit with a precise `reasonCode`. A `.pdf` with PDF bytes and `application/pdf` MIME passes all four; the same `.pdf` with PNG bytes is rejected at the magic-bytes step with `MAGIC_BYTES_MISMATCH`.
- The validator reuses the same `MemoryStream` that the n8n step uses — no extra disk I/O. After validation the stream `Position` is reset to `0` so the n8n step is unchanged.

### 5-N2: Rate Limiting Placement
- The `RateLimitMiddleware` is inserted **after** `UseAuthentication`/`UseAuthorization` and **before** `MapControllers`. The order matters: a missing/invalid `school_id` returns 401/403 first; an over-cap tenant returns 429 only after the principal is established. The `/health` endpoint is exempt.
- The rate-limit bucket is **per-tenant** (keyed on the `school_id` claim). If the claim is missing, the key falls back to the remote IP. This is documented in `LOCAL_RUN.md` and is intentionally a per-process in-memory store. A multi-instance deployment would need a shared store (deferred).

### 5-N3: Audit Log Surface
- `IAuditLog.Record(AuditEvent)` is the single audit API. Every emit goes through `LogScrubber` so the structured log line never contains secrets, JWTs, raw SAS query strings, or `Authorization` headers. This is a defense-in-depth measure on top of `appsettings.json` — even if a future caller forgets to scrub a value, the scrubber has a second chance.
- The audit log is **non-blocking** and writes to a dedicated `ILogger` category (`ArabicSchoolArchive.Api.Services.AuditLog`). A future phase can swap the in-memory logger for a persistent table without changing any call site.

### 5-N4: CORS Hardening as a Composition of "No Implicit Trust"
- CORS is **off by default**. An empty `Cors:AllowedOrigins` array means the CORS middleware is not registered at all — the API behaves as if there were no CORS surface, which is the safe default.
- A wildcard `*` in `Cors:AllowedOrigins` is rejected at startup with `InvalidOperationException`. The startup check is intentional: a misconfigured prod deploy should fail loud, not silently default to wildcard.
- This composition is consistent with the Phase 1 "Three Enforcement Points" model (D-13): the tenant boundary is enforced explicitly at the CORS layer (allowed origins), the auth layer (JWT or dev-bypass), and the data layer (`schoolId` filters).

### 5-N5: Blob / SAS Safety Reaffirmation
- The SAS generator is built with `BlobSasPermissions.Read` only. There is no write, no delete, no add, no create. A SAS issued by the API cannot modify the container.
- The TTL is clamped to `[5, 15]` minutes by `BlobSasGenerator.TtlMinutes` and bounded by `BlobOptions.SasTtlMinutesMin` / `SasTtlMinutesMax`. A misconfigured `Blob:SasTtlMinutes=1000` value is silently capped at 15.
- The tenant-prefix guard and the path-traversal guard (`..`, `\`, `\0` segments) run **before** the SAS builder is invoked. A caller cannot trick the generator into building a SAS for an arbitrary object name.

### 5-N6: Non-Goals Confirmed
- No persistent audit table. The audit log is a structured `ILogger` channel.
- No distributed rate limiter. The in-process token bucket is per-process.
- No magic-bytes inspection for Office macro content. The ZIP signature check covers the OOXML container; macro streams inside `.docm`/`.xlsm` are not parsed in v1.
- No CORS preflight in non-Development environments unless explicitly configured.
- No changes to the upload orchestrator's exception flow, to the SAS TTL range, or to the tenant-prefix format.
- No EF Core migration was added. The `Archives` table from Phase 2/2.5/3/4 is reused as-is.

---

## 12. Phase 5 Approval (2026-06-17)

Phase 5 was **APPROVED** by the user on 2026-06-17. The decision log records the approval event for the audit trail. **No locked decision in §1–§7, §8, §9, §9b, §10, or §11 was modified, removed, or reinterpreted as part of this approval.** The approval is a confirmation that the Phase 5 hardening (magic-bytes validation, rate limiting, audit logging, CORS allowlist, secret scrubbing) honors the locked Phase 1–4 contracts (D-07..D-15) as composed in `DECISIONS.md` §11 (5-N1..5-N6).

- **Final test result at sign-off**: 83/83 xUnit tests green (58 pre-Phase-5 + 25 new Phase 5 tests).
- **Approved scope**: magic-bytes cross-check, per-tenant rate limiting (in-process token bucket), audit log on every audited event (with `LogScrubber` defense-in-depth), explicit CORS allowlist (wildcard rejected at startup), and the path-traversal guard on the SAS generator. All as implemented and documented in `PROGRESS.md` §5 and `TESTING.md` §2.9–§2.12.
- **Phase 6 dependencies satisfied**: yes. Phase 6 (Subscription Enforcement) is now ACTIVE per `ROADMAP.md`.

---

## 13. Phase 6 Notes (Appended, Non-Retroactive)

Phase 6 implements server-side subscription enforcement on top of the locked Phase 1–5 design. **No locked decision in §1–§7, §8, §9, §9b, §10, §11, or §12 was modified.** The notes below record *how* the locked decisions compose with the new enforcement layer. They are observation, not ratification.

### 6-N1: Implementation of D-14 (Subscription Check Placement)
- D-14 specified the pipeline order: `Exception handling → Request logging → Authentication → SubscriptionGuardMiddleware → Authorization → Controller binding`. The actual ASP.NET Core ordering used is `UseAuthentication` → `UseAuthorization` → `UseMiddleware<SubscriptionGuardMiddleware>()` → `UseMiddleware<RateLimitMiddleware>()` → `MapControllers`. This honors the D-14 invariant that the subscription check runs **after** the principal is established and **before** the controller binds, so no file stream is read and no DB / Blob round-trip is wasted on a blocked tenant.
- The middleware is the only consumer of `ISubscriptionStore`. The store is **not** injected into the controllers, so the controllers remain unaware of subscription semantics. This keeps the upload / browse / retrieval contracts unchanged (D-07, D-08, D-09, D-10, D-11, D-12, D-13).

### 6-N2: Tenant Boundary Honored (Composition with D-13)
- The middleware reads the `school_id` claim exactly the same way the controllers do (`User.FindFirstValue("school_id") ?? User.FindFirstValue("schoolId")`). The dev-bypass scheme emits the same claim (per D-15 / Phase 2.5), so a Development tenant whose `school_id` is mapped to `Suspended` is still blocked — the dev-bypass is honored, but the guard still runs. The `TenantStateResolvedBySchoolId_NotUserId` test pins this.
- The subscription state is keyed on the tenant id, not the user id. Two users of the same `Suspended` school are both rejected. Two users of the same `Active` school are both allowed. This is a server-side invariant; the client cannot bypass it.

### 6-N3: HTTP Status Code Convention
- `Expired` returns `402 Payment Required` with body `{ "code": "SUBSCRIPTION_EXPIRED", "state": "Expired", "schoolId": "..." }`. This is consistent with `SUBSCRIPTIONS.md` §4 and `SECURITY.md` §3.
- `Suspended` returns `403 Forbidden` with body `{ "code": "SUBSCRIPTION_SUSPENDED", "state": "Suspended", "schoolId": "..." }`. This is consistent with the "policy violation" framing in `SUBSCRIPTIONS.md` §1.
- An additional `X-Subscription-State` response header is set so a client (e.g. the Phase 7 React UI) can react to a locked state without parsing the body. This is **additive** to the contract and does not change the status code semantics.

### 6-N4: Config-Driven Store, Real DB Later
- The `ISubscriptionStore` interface is a single method. The v1 implementation (`ConfigSubscriptionStore`) reads from `Subscriptions:Schools[]` in `appsettings.json` / `appsettings.Development.json`. A future phase can ship a `DatabaseSubscriptionStore` (e.g. a `Subscriptions` SQL table) without changing the middleware or the controllers.
- The default fallback for an unknown `school_id` is `Active`. This is a deliberate safe-default: a misconfigured production deploy with an empty `Subscriptions:Schools[]` will not lock out every tenant. The behavior is pinned by the `UnknownSchool_FallsBackToActive_AndCanBrowse` test.

### 6-N5: Grace-Period Mechanics
- An `Active` entry with an `ExpiresAtUtc` in the past is auto-promoted to `GracePeriod` if the current UTC time is at or before the configured `GraceUntilUtc` (or, if `GraceUntilUtc` is absent, `ExpiresAtUtc + Subscriptions:DefaultGracePeriodDays`). If both checks fail, the entry is demoted to `Expired`.
- The default grace period is `7` days, matching the Phase 0 assumption in `PROGRESS.md` and `SECURITY.md` §3 ("Subscription expiration grace period default: 7 days (configurable)").

### 6-N6: Non-Goals Confirmed
- No payment gateway integration. Manual / admin renewal only.
- No frontend renewal UI. The `X-Subscription-State` header and the JSON body expose the state; the React UI is Phase 7.
- No admin subscription management endpoint. The store is config-driven in v1.
- No `Canceled` enum value. The `SubscriptionState` enum is `Active / GracePeriod / Expired / Suspended` only. `Canceled` from `SUBSCRIPTIONS.md` §1 is a future-phase add.
- No rewrite of upload, browse, retrieval, security, auth, Docker, or dev-bypass code paths. The middleware is **additive** — the only edits to existing files are DI registrations in `Program.cs` and a defensive `Subscriptions:Enabled=false` flip in three test factories.
- No EF Core migration. The store is config-driven; a real `Subscriptions` table is deferred to a future phase.
- No skipping of subscription checks on download / retrieval. The middleware matches `GET /archives/{id}/download` and `GET /archives/{id}/content` in addition to the upload and browse routes.

---

## 14. Phase 6 Approval (2026-06-17)

Phase 6 was **APPROVED** by the user on 2026-06-17. The decision log records the approval event for the audit trail. **No locked decision in §1–§7, §8, §9, §9b, §10, §11, §12, or §13 was modified, removed, or reinterpreted as part of this approval.** The approval is a confirmation that the Phase 6 subscription enforcement (middleware + config-driven store + 4-state model) honors the locked Phase 1–5 contracts (D-07..D-15) as composed in `DECISIONS.md` §13 (6-N1..6-N6).

- **Final test result at sign-off**: 110/110 xUnit tests green (83 pre-Phase-6 + 27 new Phase 6 tests).
- **Approved scope**: `SubscriptionGuardMiddleware` placed after auth and before controllers, returning `402 SUBSCRIPTION_EXPIRED` for `Expired` tenants and `403 SUBSCRIPTION_SUSPENDED` for `Suspended` tenants. `Active` and `GracePeriod` tenants are allowed. `ISubscriptionStore` is a single-method interface with a config-driven v1 implementation. `X-Subscription-State` response header is set on blocked requests. `/health` is exempt. All as implemented and documented in `PROGRESS.md` §6 and `TESTING.md` §2.13–§2.14.
- **Phase 7 dependencies satisfied**: yes. Phase 7 (Gulf-School UI/UX Polish) is now ACTIVE per `ROADMAP.md`.

---

## 15. Phase 7 Notes (Appended, Non-Retroactive)

Phase 7 ships the first user-facing frontend for the Arabic School Archive. **No locked decision in §1–§7, §8, §9, §9b, §10, §11, §12, §13, or §14 was modified.** The notes below record *how* the locked backend contracts compose with the new UI layer. They are observation, not ratification.

### 7-N1: Strictly Additive UI; Backend Untouched
- Phase 7 creates a new project at `src/ArabicSchoolArchive.Web/`. **No file under `src/ArabicSchoolArchive.Api/` was modified, and no file under `src/ArabicSchoolArchive.Tests/` was modified.** The git diff for the Phase 7 work is entirely inside the new `src/ArabicSchoolArchive.Web/` directory (plus the docs in this file).
- The frontend talks to the locked Phase 1–6 endpoints:
  - `POST /api/v1/archive/upload` (D-07 / D-08) for the multi-file upload page.
  - `GET /api/v1/archive/archives` (Phase 4) for the browse / search page.
  - `GET /api/v1/archive/archives/{documentId}` and `GET /api/v1/archive/archives/{documentId}/download` (Phase 4) for the details / download action.
  - The 402 / 403 / `state` subscription error envelope (Phase 6, 6-N3) for the subscription-blocked placeholder.

### 7-N2: RTL-First Without a UI Kit
- The page is rendered with `<html lang="ar" dir="rtl">` in `index.html` and uses logical CSS properties (`padding-inline-start`, `border-inline-end`) where layout depends on direction. No RTL-specific JS libraries are pulled in.
- The Gulf-school feel comes from typography (Arabic-first font stack with `Tajawal` / `Cairo` / `Noto Naskh Arabic` fallbacks), a calm palette (off-white background, deep `#0f4c75` primary, gold accent), and a conservative component set (no shadows beyond `0 1px 3px`, no animations beyond a 700 ms spinner). No flags, no emblems, no imagery.

### 7-N3: Dev-Bypass Honored Without Forcing a New Auth Surface
- The frontend's `DevBypassContext` mirrors the backend's `DevBypassAuthHandler` (D-15, Phase 2.5): when `enabled = true`, every request gets `X-Dev-School-Id` and `X-Dev-User-Id` headers. The four well-known dev school ids from `appsettings.Development.json` are exposed as one-click presets in the `DevSettingsPanel`. The `schoolId` / `userId` text inputs are `dir="ltr"` because UUIDs are left-to-right tokens.
- The frontend does **not** add a new auth scheme. Production / staging use the same JWT scheme the backend already validates.

### 7-N4: Subscription Errors Map to a Single Source of Truth
- The subscription-blocked placeholder is rendered **only** when the backend returns 402 (`SUBSCRIPTION_EXPIRED`) or 403 (`SUBSCRIPTION_SUSPENDED`). The placeholder reads the `state` field from the response body to pick its copy. This keeps the UI consistent with the Phase 6 middleware without duplicating the state model on the client.
- The `GracePeriod` placeholder is reachable via the `#/blocked/grace` hash route for manual QA, but a real "we are in grace" banner on the protected routes is deferred (Phase 7 is read-only on the subscription state and does not introduce a `GET /me/subscription` endpoint).

### 7-N5: No Payment, No Renewal, No Admin Subscription UI
- The blocked pages explicitly call out "تواصل مع إدارة المدرسة" (contact the school administration) and never mention a checkout, a card form, or a renewal button. This honors the Phase 6 / Phase 7 hard prohibitions and `SUBSCRIPTIONS.md` §5.

### 7-N6: Non-Goals Confirmed
- No component-level test framework (Vitest, RTL, etc.) was added. 7 unit tests on the `ApiClient` cover the error-mapping contract the UI consumes; manual QA covers the rest.
- No i18n library was added. The UI copy is hard-coded Arabic in every page / component. A future phase can introduce a translation pipeline if English support is required.
- No CSS framework. The single `global.css` is hand-authored. No `styled-components`, no Emotion, no Tailwind.
- No state library. The app uses `useState` and `useEffect` only. A future phase can introduce a state library if cross-page client-side state is required.
- No backend changes; no test changes; no migration; no production-deploy script.
- No changes to the upload envelope, the SAS TTL, the rate limit, the audit log, or the subscription guard. The Phase 1–6 contracts are byte-for-byte unchanged.

---

## 16. Phase 7.5 — "Modernization" Override (Appended, Replaces the Phase 7 Non-Goals in §15-7-N6)

The Phase 7 goals in §15 are preserved. The "non-goals" subset in §15-7-N6 (no CSS framework, no state library, plain `global.css`, plain `useState`/`useEffect` only) is **superseded** by the two decisions below. All Phase 1–6 locked decisions (D-07..D-15) and the Phase 1–6 contracts remain untouched.

### D-17: Phase 7.5 Frontend Modernization
- **Decision**: The `src/ArabicSchoolArchive.Web/` frontend adopts a modern, dependency-aware stack to eliminate the lag and prototype-like UX of the original "plain CSS + `useState`/`useEffect` only" shell:
  - **Tailwind CSS** (utility-first, RTL-aware via `dir="rtl"`, logical properties) for styling.
  - **Shadcn/ui** components (or hand-authored Tailwind components of the same shape) for UI elements. No MUI, no Ant Design, no Material.
  - **TanStack Query (React Query) v5** for state management and caching. Every API call is wrapped in `useQuery` / `useMutation` via custom hooks (e.g. `useArchives`, `useUploadArchive`). Loading, error, pagination, and debouncing are handled by the library.
  - **Lucide React** for icons.
- **Rationale**: Plain CSS and basic `useState`/`useEffect` chains caused massive re-rendering lag and a poor prototype-like UX. Typing in the search box could freeze the UI, and every screen had to hand-roll its own loading/error state. Tailwind CSS gives robust RTL styling without a heavy custom stylesheet, and TanStack Query handles API caching, debouncing, and pagination efficiently without UI blocking.
- **Rejected**: keeping the original "plain CSS + local state only" shell; introducing Redux/Zustand (overkill for a single-app admin tool); introducing a CSS-in-JS runtime (extra cost for zero benefit on top of Tailwind).
- **Scope of change**: the diff is entirely inside `src/ArabicSchoolArchive.Web/`. The backend (`src/ArabicSchoolArchive.Api/`) and the test project (`src/ArabicSchoolArchive.Tests/`) are **not** modified. **No** new API contract is introduced. The frontend continues to consume the exact same endpoints as before.
- **Compatibility**: the locked Phase 1–6 contracts (D-07..D-15), the upload envelope, the SAS TTL, the rate limit, the audit log, and the subscription guard are byte-for-byte unchanged.

### D-18: Initial EF Core Migration
- **Decision**: The `src/ArabicSchoolArchive.Api/` project now ships its first EF Core migration at `src/ArabicSchoolArchive.Api/Data/Migrations/InitialArchiveSchema.{cs,Designer.cs,Snapshot.cs}`. The migration is generated with `dotnet ef migrations add InitialArchiveSchema -o Data/Migrations` and applied manually via `dotnet ef database update` (see `LOCAL_RUN.md` §4.1).
- **Rationale**: The database was previously running in InMemory / no-migration mode (`UseInMemoryDatabase("ArchiveDb")` when `ConnectionStrings:AzureSql` is empty; no `Database.Migrate()` call; no migration files). This was acceptable for Phase 2/2.5/3/4/5/6 hermetic testing, but it is not enterprise-grade for Azure SQL. The first migration stabilizes the schema, makes the project reproducible across environments, and removes the manual DDL workaround documented in the previous `LOCAL_RUN.md` §3.2.
- **`Program.cs` constraint**: `Database.Migrate()` is **not** invoked at runtime. Migrations are an explicit, manual operator step. This honors the Phase 0 "no implicit side effects at startup" invariant and matches enterprise deploy practice (migrations are a separate, observable step in the CD pipeline).
- **Test impact**: none. The xUnit suite uses `UseInMemoryDatabase` and the migration is not required for tests to pass. The migration files live alongside the API code but are not loaded by the test process. **All 110 existing xUnit tests continue to pass without modification.**
- **Configuration**: the API keeps the two-mode selection (Azure SQL or InMemory). When `ConnectionStrings:AzureSql` is set, the operator must run `dotnet ef database update` against the target database before the first request, exactly as documented in the updated `LOCAL_RUN.md` §4.1.
- **Rejected**: auto-`Migrate()` on startup (hidden side effect, no clear deploy boundary); continuing with the manual DDL workaround (drift risk; manual SQL cannot track the EF Core model); database-first tooling (the project is code-first by Phase 2).

### D-19: Local Development mandates Real SQL Server
- **Decision**: Local development permanently deprecates the `InMemory` database provider fallback for manual QA and local runs. The local environment stack now includes a containerized Microsoft SQL Server instance running via Docker Compose (`sqlserver` service).
- **Rationale**: The InMemory database fallback masked real-world database constraints, column length limits, and transaction behaviors. Local dev now relies on a containerized MSSQL Server to mirror production accurately.
- **Scope of change**: Update `src/docker-compose.local.yml` to spin up a local SQL Server container (`sqlserver`) alongside the `api` and `azurite` containers. Update `src/.env.example` to document the canonical compose connection string `CONNECTIONSTRINGS__AZURESQL`. Update `src/ArabicSchoolArchive.Api/appsettings.Development.json` to default native `dotnet run` users to connect to `localhost,1433`. Update documentation in `docs/agent/DECISIONS.md`, `docs/agent/LOCAL_RUN.md`, and `docs/agent/PROGRESS.md`.
- **Prohibitions**: No changes to C# business logic or the xUnit test suite (which remains isolated on its own `UseInMemoryDatabase` context to keep tests fast and green).


