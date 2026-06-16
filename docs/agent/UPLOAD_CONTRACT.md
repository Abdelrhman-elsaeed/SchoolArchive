# UPLOAD_CONTRACT.md - End-to-End Upload Orchestration Contract

This document is the single source of truth for the upload orchestration behavior in the **الأرشيف المدرسي العربي** (Arabic School Archive) system. It is design-only and implementation-ready: it specifies the single-file flow, the multi-file loop, the documentId lifecycle, and the request/response shape, but contains no controller, service, or migration code.

This contract supersedes or refines earlier notes in `DATA_FLOW.md`, `MULTI_FILE_UPLOAD.md`, and `DECISIONS.md`. Where this document conflicts with an earlier document, this document wins for Phase 2+ implementation.

---

## 1. Actors and Trust Boundaries

```
┌──────────────┐        ┌──────────────────┐        ┌────────────┐        ┌──────────────┐        ┌──────────────┐
│   Browser    │ HTTPS  │ ASP.NET Core API │ HTTPS  │   n8n      │ HTTPS  │ Azure Blob   │  SQL   │ Azure SQL DB │
│  (React)     │───────▶│   (Backend)      │───────▶│ Webhook    │        │  Storage     │◀──────▶│              │
└──────────────┘        └──────────────────┘        └────────────┘        └──────────────┘        └──────────────┘
       │  untrusted         │   trusted boundary     │   semi-trusted       │  trusted        │  trusted
       │  (no schoolId)     │   (schoolId from       │   (no DB access,     │  (private       │  (EF Core
       │  no classification │    auth principal)     │    no Blob access)   │   container)    │   global
       │  no blob knowledge │                        │                      │                 │   query filters)
```

- **Browser** is untrusted. It only knows file names, sizes, and content.
- **ASP.NET Core API** is the only trusted orchestrator. It owns `schoolId` (from auth), `documentId` (allocated), and the canonical error state machine.
- **n8n** is treated as semi-trusted external service. It receives a single file and returns a classification payload. It does not have DB or Blob credentials.
- **Azure Blob** is a private container. No anonymous reads. SAS tokens only.
- **Azure SQL** is filtered by `school_id` via EF Core Global Query Filters.

---

## 2. Document ID Lifecycle

The `documentId` is a server-generated UUID v4 created in the **backend** for every file in every upload batch. The allocation point is locked by `DECISIONS.md` D-15: **after Step 1 (validation) passes, before Step 2 (n8n call) for that file**. A file that fails validation never has a `documentId` allocated, and its `documentId` field in the response is `null`.

When allocated, the `documentId` serves three purposes:

1. **Correlation id** sent to n8n (so n8n logs and any future async callbacks refer to a stable identifier).
2. **Blob object name suffix** in the storage path.
3. **Primary key** of the `Archives` table row written last.

```
For each file in the batch (after validation passes):
   documentId = NewGuid()             // server-side
   documentId  ──> sent to n8n        // correlation
   documentId  ──> appended to Blob name
   documentId  ──> used as PK on insert
```

If a transient failure occurs at any step after allocation, the orchestration for that file aborts and the `documentId` is **discarded** for this attempt. A retry of the entire upload (a separate user action) generates fresh `documentId`s. The same `documentId` is never reused for a retry within the same request.

---

## 3. Per-File Orchestration Flow (Single File = Single Iteration)

This is the canonical state machine for one file. It is identical whether the batch contains 1 file or 50 files; multi-file is just sequential iteration of this state machine.

```
                          ┌──────────────────────────────────────────┐
                          │  Start (file received by controller)    │
                          └────────────────┬─────────────────────────┘
                                           │
                                           ▼
                ┌──────────────────────────────────────────────────────┐
                │ Step 1: VALIDATE                                    │
                │   - extension allowlist                             │
                │   - size <= 20 MB (configurable)                    │
                │   - MIME magic bytes check (server-side)            │
                │   - filename sanitization (length, charset)         │
                └────────────────┬─────────────────────────────────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
              FAIL│                             │PASS
                  ▼                             ▼
        ┌──────────────────┐        ┌──────────────────────────────────┐
        │ status=Rejected  │        │ Step 2: CALL n8n                 │
        │ abort; emit      │        │   multipart/form-data            │
        │ per-file result  │        │   fields:                        │
        │ reason in Arabic │        │     - file (the binary)          │
        └──────────────────┘        │     - schoolId (UUID)            │
                                    │     - documentId (UUID)          │
                                    │   HTTP timeout: 15s              │
                                    └────────────────┬─────────────────┘
                                                     │
                                      ┌──────────────┴──────────────┐
                                      │                             │
                                  FAIL│                             │PASS (2xx)
                                      ▼                             ▼
                            ┌──────────────────┐        ┌──────────────────────────────────┐
                            │ status=Failed    │        │ Step 3: UPLOAD ORIGINAL FILE     │
                            │ reasonCode=      │        │   Blob object name:              │
                            │   N8N_FAILED     │        │     schools/{schoolId}/          │
                            │ abort; do NOT    │        │       archive/{yyyy}/{MM}/       │
                            │ upload to Blob   │        │       {documentId}_{safeName}    │
                            │ do NOT write DB  │        │   Content-Type: original MIME    │
                            └──────────────────┘        │   Overwrite: false (block-level  │
                                                         │     no — create-only)            │
                                                         └────────────────┬─────────────────┘
                                                                          │
                                                       ┌──────────────────┴──────────────┐
                                                       │                                 │
                                                   FAIL│                                 │PASS (2xx)
                                                       ▼                                 ▼
                                             ┌──────────────────┐            ┌──────────────────────────────┐
                                             │ status=Failed    │            │ Step 4: SAVE DB ROW          │
                                             │ reasonCode=      │            │   Insert one row in          │
                                             │   BLOB_FAILED    │            │     [Archives]               │
                                             │ abort; do NOT    │            │   Use server-side            │
                                             │ write DB row     │            │     transaction (default     │
                                             │ (Blob object     │            │     READ COMMITTED)          │
                                             │  should be        │            └────────────────┬─────────────┘
                                             │  deleted by       │                             │
                                             │  ops job; not     │              ┌──────────────┴──────────────┐
                                             │  in v1 scope)     │              │                             │
                                             └──────────────────┘          FAIL│                             │PASS
                                                                            ▼                             ▼
                                                                  ┌──────────────────┐        ┌──────────────────┐
                                                                  │ status=Failed    │        │ status=Success   │
                                                                  │ reasonCode=      │        │ documentId       │
                                                                  │   DB_FAILED      │        │ category         │
                                                                  │ (orphan Blob     │        │ blobUri          │
                                                                  │  present;        │        │ sizeBytes        │
                                                                  │  not cleaned in  │        │ originalName     │
                                                                  │  v1)             │        │ mimeType         │
                                                                  └──────────────────┘        └──────────────────┘
```

**Hard invariants:**
- The DB write is the **last** action for any file. A row exists **iff** all four steps succeeded for that file.
- Failure at any step aborts immediately for that file. Subsequent files in the batch are unaffected.
- No automatic retry. No compensating delete in v1.

---

## 4. Multi-File Application-Layer Loop

The backend's `POST /api/v1/archive/upload` endpoint receives a `multipart/form-data` request with one or more `files` parts. The controller:

1. Authenticates the user and resolves `schoolId` from the principal. **Refuses** the request if not authenticated (HTTP `401`) or if the principal has no `schoolId` claim (HTTP `403`).
2. Reads the `IFormFileCollection`. If empty → HTTP `400` with code `EMPTY_BATCH`.
3. Iterates files **sequentially** (not in parallel), awaiting each iteration. For each file:
   1. Runs the state machine in Section 3.
      - Inside the state machine, the `documentId` is allocated by the backend **after Step 1 (validation) passes and before Step 2 (n8n call)** — per `DECISIONS.md` D-15.
      - A file that fails validation produces a `Rejected` result with `documentId = null`.
   2. Appends a per-file result to the in-memory result list (one entry per iteration).
   3. On any unhandled exception, captures it as `Failed` with reasonCode `INTERNAL_ERROR` and **continues** to the next file (does not abort the batch).
4. After the loop, returns the unified response (Section 6).

**Why sequential:**
- Avoids saturating n8n with concurrent calls.
- Avoids saturating the Blob client SDK with concurrent uploads per request.
- Matches the design constraint "n8n accepts one file only".
- Preserves the order of files in the response (frontend can match by index if filename normalization is uncertain).

**Why not parallel with a semaphore:**
- Phase 1 design constraint is "sequential". Concurrency controls are deferred to a future phase if metrics justify them.

---

## 5. Frontend Upload Request Contract

| Property | Value |
|:---|:---|
| Method | `POST` |
| Path | `/api/v1/archive/upload` |
| Content-Type | `multipart/form-data; boundary=<generated>` |
| Form fields | `files` (one or more file parts) |
| Auth header | `Authorization: Bearer <jwt>` (carries schoolId claim server-side) |
| Max body size | 25 MB total (slightly above 20 MB per-file cap to accommodate multipart overhead) |
| Optional header | `X-Request-Id: <uuid>` (client-generated correlation id; logged but not required) |

**Frontend rules:**
- The frontend **must not** send a `schoolId` field. The server derives it.
- The frontend **must not** retry on its own; it waits for the response and shows per-file statuses.
- The frontend may include a single `files` field with multiple parts, or a single part. Behavior is identical server-side.
- Original filenames are preserved exactly in the request; the server sanitizes only for storage key construction.

**Example request (curl, illustrative):**
```bash
curl -X POST https://api.example.com/api/v1/archive/upload \
  -H "Authorization: Bearer <jwt>" \
  -F "files=@report1.pdf" \
  -F "files=@grades.xlsx" \
  -F "files=@photo.png"
```

---

## 6. Backend Upload Response Contract

### 6.1 Top-Level Envelope

The response is HTTP `200 OK` with `Content-Type: application/json; charset=utf-8`. The body is always:

```json
{
  "requestId": "9c1f6d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  "totalFiles": 3,
  "successfulFiles": 2,
  "failedFiles": 1,
  "results": [ /* PerFileResult objects, one per submitted file, in input order */ ]
}
```

| Field | Type | Description |
|:---|:---|:---|
| `requestId` | UUID string | Server-generated correlation id for the whole batch (echoed from `X-Request-Id` if supplied, else generated) |
| `totalFiles` | int | Count of files submitted |
| `successfulFiles` | int | Count of `results` entries with `status == "Success"` |
| `failedFiles` | int | Count of `results` entries with `status` in {`Rejected`, `Failed`} |
| `results` | array | Per-file result objects (Section 6.2), one per submitted file, in submission order |

### 6.2 Per-File Result Object

```json
{
  "originalName": "تقرير_الغياب_2026.pdf",
  "status": "Success",
  "reasonCode": null,
  "message": "تم أرشفة الملف بنجاح وتصنيفه كـ 'تقرير إداري'",
  "documentId": "4a3b1d2e-07d7-4729-996b-66b002e885d9",
  "category": "تقرير إداري",
  "sizeBytes": 184234,
  "mimeType": "application/pdf",
  "blobUri": "schools/11111111-1111-1111-1111-111111111111/archive/2026/06/4a3b1d2e-07d7-4729-996b-66b002e885d9_تقرير_الغياب_2026.pdf"
}
```

| Field | Type | Always present? | Description |
|:---|:---|:---|:---|
| `originalName` | string | Yes | The exact original filename as received from the client. **Never sanitized, never truncated, never re-encoded.** |
| `status` | enum string | Yes | One of: `Success`, `Rejected`, `Failed`. (See `FAILURE_HANDLING.md`.) |
| `reasonCode` | enum string \| null | Yes (null on Success) | Machine-readable failure code. Null on Success. |
| `message` | string | Yes | Human-readable Arabic message. |
| `documentId` | UUID string \| null | Yes (null on Rejected) | The allocated documentId, echoed on Success or on `Failed` (Failed-after-Step-1 cases) so the frontend can correlate. |
| `category` | string \| null | Yes (null unless n8n returned one and step 4 succeeded) | n8n classification label. |
| `sizeBytes` | int \| null | Yes (null on Rejected-before-size-read) | Byte size of the original file. |
| `mimeType` | string \| null | Yes (null on Rejected-before-MIME-read) | Verified MIME type. |
| `blobUri` | string \| null | Yes (null unless Blob step succeeded) | The full Blob object name. **Not** a public URL. |

### 6.3 HTTP Status Codes

| HTTP code | When |
|:---|:---|
| `200 OK` | Any batch (even with all files failed) — body always has multi-status structure |
| `400 Bad Request` | Request body malformed; no `files` field; total body size > 25 MB |
| `401 Unauthorized` | Missing/invalid JWT |
| `403 Forbidden` | Authenticated but principal has no `schoolId` claim |
| `402 Payment Required` | Reserved for Phase 6: subscription expired past grace. **Out of scope for Phase 1, but documented for client compatibility.** |
| `413 Payload Too Large` | Per-file size > 20 MB; rejected before any processing |
| `500 Internal Server Error` | Unhandled server fault (logged with `requestId`) |

**Important:** A batch where some files succeed and some fail returns `200 OK` with the multi-status body. The per-file `status` field is authoritative for UI logic.

### 6.4 Original Filename Preservation

The `originalName` field is preserved end-to-end:
- Frontend submits the original filename via `multipart/form-data` Content-Disposition.
- Backend extracts the filename via `IFormFile.FileName`.
- Backend stores the **original** in the DB `original_name` column (separate from the `blob_object_name` which holds the sanitized form).
- Backend returns the **original** in the response.

**Sanitization is applied only to construct the Blob object name; it never touches the value returned to the client or stored in `original_name`.**

---

## 7. Backend-to-n8n Contract

See `API_CONTRACTS.md` § 3 for full request/response schema. The relevant invariants are repeated here for clarity:

- Backend posts to a single configured n8n webhook URL with a 15-second HTTP timeout.
- Body is `multipart/form-data` with three fields:
  - `file` (binary)
  - `schoolId` (UUID string, non-file)
  - `documentId` (UUID string, non-file)
- n8n returns `200 OK` with a JSON body containing at minimum `category` (string). Anything else in the body is ignored for v1.
- n8n returning non-2xx, timing out, or returning malformed JSON is treated as a failure for that file; status `Failed`, reasonCode `N8N_FAILED`.
- n8n is stateless w.r.t. the upload; the backend does not rely on n8n to remember anything.

---

## 8. Failure Boundaries and Result Contracts

See `FAILURE_HANDLING.md` for the full matrix. The summary:

| Step | Failure outcome | Status | reasonCode | Blob written? | DB row written? |
|:---|:---|:---|:---|:---:|:---:|
| 1. Validate | Reject | `Rejected` | `EXTENSION_NOT_ALLOWED` / `SIZE_EXCEEDED` / `MIME_MISMATCH` / `FILENAME_INVALID` | No | No |
| 2. n8n call | Abort | `Failed` | `N8N_TIMEOUT` / `N8N_HTTP_ERROR` / `N8N_INVALID_RESPONSE` | No | No |
| 3. Blob upload | Abort | `Failed` | `BLOB_FAILED` (orphan Blob possible) | Yes (orphan) | No |
| 4. DB write | Abort | `Failed` | `DB_FAILED` (orphan Blob present) | Yes | No |

**Orphan Blob policy in v1:** orphaned Blob objects are not auto-cleaned. They are detectable because no DB row references their `documentId`. A future admin sweep job is a deferred feature.

---

## 9. School Isolation Enforcement Points (in the Upload Pipeline)

Each upload request passes through these isolation gates in order:

1. **Authentication middleware** → resolves `schoolId` from JWT claim `school_id` (or equivalent). Sets `HttpContext.Items["SchoolId"]` and the scoped `ICurrentSchoolContext`.
2. **Subscription guard middleware** (Phase 6, deferred but placement locked) → reads `schoolId` from `HttpContext.Items`, looks up subscription status, short-circuits with `402` if locked.
3. **Authorization** → role check (e.g., requires `archive.write` permission).
4. **Controller extract** → reads `schoolId` from `ICurrentSchoolContext`, **never** from request body or query. Assigns to a server-side variable used throughout the orchestration.
5. **Storage service** → builds Blob object name as `schools/{schoolId}/...` and refuses to write outside that prefix.
6. **DB write** → inserts row with `school_id` column equal to the controller-resolved `schoolId`. The EF Core entity's global query filter ensures future reads are scoped to the same school.

If any step is skipped, isolation is broken. Phase 5 will add unit tests asserting each gate cannot be bypassed.

---

## 10. Subscription Check Placement (Locked for Phase 6)

Although not implemented in Phase 1, the exact middleware pipeline order is fixed now:

```
[ExceptionHandler] → [RequestLogging] → [Authentication] → [SubscriptionGuard] → [Authorization] → [MVC Controller]
```

- `SubscriptionGuard` runs **after** authentication (so it can read `schoolId`) and **before** the controller (so no multipart body is bound for a locked school).
- The guard caches the subscription state per request (no DB round-trip per endpoint call).
- The guard returns `402 Payment Required` with body `{ "code": "SUBSCRIPTION_EXPIRED", "graceExpired": true, "renewalPath": "/admin/renew" }`.
- Routes that must bypass the guard (e.g., the renewal admin endpoint) are decorated with `[AllowAnonymousSubscription]` and listed in an allowlist.

This placement is documented now to prevent retrofit churn in Phase 6.

---

## 11. Out-of-Scope for Phase 1

The following are explicitly NOT part of this design and will be addressed in later phases:

- Magic-bytes MIME verification (Phase 5)
- Malware scanning hook (Phase 5)
- Rate limiting (Phase 5)
- Audit log writes (Phase 5)
- Caching of subscription state across requests (Phase 6)
- Resumable uploads / chunking (deferred)
- Auto-retry / dead-letter queue (deferred)
- Bulk upload via signed URL from browser direct to Blob (deferred)

---

## 12. Test Contract (Design-Level)

Phase 2+ tests must assert these properties; Phase 1 only documents them:

- A 1-file batch with all valid inputs produces 1 `Success` result, 1 DB row, 1 Blob object.
- A 3-file batch with mixed results produces 3 per-file results whose `status` values match the orchestrated outcomes.
- A file failing validation produces `Rejected` and never invokes n8n or Blob.
- A file failing n8n produces `Failed` with `reasonCode ∈ {N8N_TIMEOUT, N8N_HTTP_ERROR, N8N_INVALID_RESPONSE}` and never invokes Blob.
- A file failing Blob produces `Failed` with `reasonCode = BLOB_FAILED` and never writes a DB row.
- A file failing DB write produces `Failed` with `reasonCode = DB_FAILED` (Blob orphan is acknowledged).
- `originalName` in the response exactly matches the filename sent in the request.
- The Blob object name begins with `schools/{authenticatedSchoolId}/` for every file.
- The DB row's `school_id` equals the authenticated `schoolId`.
- A request with no `files` field returns HTTP `400` with `code = EMPTY_BATCH`.
- A request with a `schoolId` body field is ignored server-side (logged as a warning, not used).
