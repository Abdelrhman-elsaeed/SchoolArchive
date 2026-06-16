# FAILURE_HANDLING.md - Failure Boundaries and Result Contracts

This document specifies how the upload pipeline detects, classifies, contains, and reports failures for the **الأرشيف المدرسي العربي** (Arabic School Archive) system. It is design-only and contains no try/catch code, no exception filter expressions, and no logging framework configuration. Phase 2+ implementation will instantiate these contracts.

This document complements `UPLOAD_CONTRACT.md`, `API_CONTRACTS.md`, and `STORAGE_CONTRACT.md`. Where the contracts describe success paths, this document describes the failure paths.

---

## 1. Design Principles

The failure model is built on five principles, all of which derive from `DECISIONS.md` § 2 and `DATA_FLOW.md` § 2:

1. **Fail fast, fail per-file.** A failure in file 2 does not abort file 3. The backend iterates sequentially and isolates each file's failure.
2. **The DB write is the last action.** A row exists if and only if all preceding steps succeeded for that file. No compensating writes.
3. **No automatic retry in v1.** The user is informed; the user decides whether to resubmit.
4. **Every failure has a machine-readable `reasonCode` and a human-readable `message`.** Clients and ops dashboards use both.
5. **Orphans are visible, not hidden.** A Blob object without a DB row is a known residue, not a bug to mask.

---

## 2. Failure Surfaces

The upload pipeline has exactly four failure surfaces, one per orchestration step. Each surface has a closed set of detectable failure modes and a single `reasonCode` per mode.

### 2.1 Step 1: Validation Failures (`status = Rejected`)

| Detected condition | reasonCode | message (Arabic) | Notes |
|:---|:---|:---|:---|
| File extension not in allowlist (`.pdf, .docx, .xlsx, .png, .jpg, .jpeg`) | `EXTENSION_NOT_ALLOWED` | `نوع الملف غير مدعوم (<ext>). الأنواع المسموحة: PDF, DOCX, XLSX, PNG, JPG, JPEG` | The `<ext>` placeholder is the actual extension in upper case |
| File size > configured cap (default 20 MB) | `SIZE_EXCEEDED` | `حجم الملف يتجاوز الحد المسموح (<limitMB> ميجابايت)` | Detected from `IFormFile.Length` before reading bytes |
| Magic bytes do not match the expected MIME for the extension | `MIME_MISMATCH` | `محتوى الملف لا يتطابق مع نوعه المعلن. يبدو أن الملف تالف أو امتداده غير صحيح` | Phase 1 design only; Phase 5 will harden the magic bytes check |
| Filename empty, NUL byte present, or length > 512 | `FILENAME_INVALID` | `اسم الملف غير صالح. يرجى إعادة تسمية الملف والمحاولة مجدداً` | Also raised if `Content-Disposition` is missing the filename parameter |

**Side effects on validation failure:**
- No `documentId` is allocated (the value is `null` in the response).
- n8n is **not** called.
- Blob is **not** called.
- DB is **not** written.
- The file stream is disposed.

**Order of checks within Step 1 (in evaluation order):**
1. Filename validity (cheapest, may short-circuit before any stream read).
2. Extension allowlist.
3. File size (from `Content-Length` and `IFormFile.Length`).
4. MIME magic bytes (read first 4 KB of the stream; close stream and reopen if needed).

If multiple checks fail, the **first** failure detected is reported (avoid stacking multiple error reasons for a single file).

### 2.2 Step 2: n8n Call Failures (`status = Failed`)

| Detected condition | reasonCode | message (Arabic) | Notes |
|:---|:---|:---|:---|
| n8n call exceeded 15-second timeout | `N8N_TIMEOUT` | `استغرق تصنيف الملف وقتاً طويلاً. يرجى المحاولة لاحقاً` | The HttpClient's `Timeout` triggers this |
| n8n returned HTTP 4xx or 5xx | `N8N_HTTP_ERROR` | `فشل تحميل الملف: خدمة التصنيف رفضت الملف (<status>)` | `<status>` is the numeric code (e.g., 502) |
| Network error (DNS, TCP, TLS handshake) | `N8N_HTTP_ERROR` | `تعذر الوصول إلى خدمة التصنيف. يرجى التحقق من الاتصال والمحاولة لاحقاً` | Same code as HTTP error but different message |
| n8n returned 2xx but body is not valid JSON | `N8N_INVALID_RESPONSE` | `استجابة غير صالحة من خدمة التصنيف. يرجى المحاولة لاحقاً` | |
| n8n returned 2xx with valid JSON but missing `category` field | `N8N_INVALID_RESPONSE` | `استجابة غير مكتملة من خدمة التصنيف` | |

**Side effects on n8n failure:**
- The `documentId` allocated before the n8n call is **discarded** for this attempt (a future retry will allocate a new one).
- Blob is **not** called.
- DB is **not** written.
- No retry is attempted. The user must resubmit.

### 2.3 Step 3: Blob Upload Failures (`status = Failed`)

| Detected condition | reasonCode | message (Arabic) | Notes |
|:---|:---|:---|:---|
| Azure Blob returned non-2xx | `BLOB_FAILED` | `فشل حفظ الملف في وحدة التخزين. يرجى المحاولة لاحقاً` | |
| Upload exceeded 30-second timeout | `BLOB_FAILED` | `استغرق حفظ الملف وقتاً طويلاً. يرجى المحاولة لاحقاً` | |
| Network error (DNS, TCP, TLS) | `BLOB_FAILED` | `تعذر الوصول إلى وحدة التخزين. يرجى التحاولة لاحقاً` | |
| 401/403 from Blob | `BLOB_FAILED` | `فشل حفظ الملف في وحدة التخزين (إذن مرفوض)` | Indicates a configuration fault, surfaced with code only |

**Side effects on Blob failure (the orphan case):**
- The Blob object **may or may not** exist (depends on where the failure occurred). A partial block blob may be present.
- The `documentId` is **discarded** for this attempt.
- DB is **not** written.
- A structured log entry is emitted with `documentId`, `schoolId`, `objectName`, and the Blob error.
- No automatic cleanup. A future orphan-sweep job is responsible for this (see `STORAGE_CONTRACT.md` § 3.2).

**Why no automatic delete of the partial Blob:**
- Phase 1 design is "fail fast, surface the failure, no compensating writes." A delete attempt adds a second failure mode and may itself fail. Better to log + orphan-sweep later.

### 2.4 Step 4: DB Write Failures (`status = Failed`)

| Detected condition | reasonCode | message (Arabic) | Notes |
|:---|:---|:---|:---|
| EF Core throws `DbUpdateException` (e.g., constraint violation, deadlock) | `DB_FAILED` | `فشل حفظ بيانات الملف. يرجى المحاولة لاحقاً` | The exception is caught and translated |
| Connection timeout to Azure SQL | `DB_FAILED` | `تعذر الوصول إلى قاعدة البيانات. يرجى المحاولة لاحقاً` | |
| Unhandled exception in the repository | `DB_FAILED` | `حدث خطأ غير متوقع أثناء حفظ بيانات الملف` | Logged with stack trace; user sees generic message |

**Side effects on DB failure (the orphan case):**
- The Blob object **exists** (Step 3 succeeded). The DB row **does not**. This is an orphan.
- The `documentId` is **discarded** for this attempt.
- A structured log entry is emitted with `documentId`, `schoolId`, `objectName`, and the SQL error.
- No automatic cleanup.

**Why the DB write can fail after the Blob write succeeded:**
- A network blip between Blob and SQL.
- A unique constraint violation (impossible by design but defensively handled).
- A deadlock or transient Azure SQL error.

In all cases, the user is informed. Orphan-sweep is a future concern.

### 2.5 Unhandled Exceptions in the Orchestration Loop

| Detected condition | reasonCode | message (Arabic) | Notes |
|:---|:---|:---|:---|
| Any unhandled exception in the per-file orchestration (e.g., null reference, OOM) | `INTERNAL_ERROR` | `حدث خطأ غير متوقع أثناء معالجة الملف` | Logged with full stack trace and `requestId` |

**Side effect:**
- The exception is caught at the loop boundary (not propagated out of the loop).
- The file's result is appended with `status = Failed`, `reasonCode = INTERNAL_ERROR`.
- The next file in the batch is processed normally.
- A structured log entry includes the exception details, `requestId`, `documentId` (if allocated), `schoolId`.

This is the "do not abort the batch" guarantee.

---

## 3. Closed `reasonCode` Set

The `reasonCode` field has a closed set of values. The complete enumeration is:

```
EXTENSION_NOT_ALLOWED
SIZE_EXCEEDED
MIME_MISMATCH
FILENAME_INVALID
N8N_TIMEOUT
N8N_HTTP_ERROR
N8N_INVALID_RESPONSE
BLOB_FAILED
DB_FAILED
INTERNAL_ERROR
```

The frontend must handle unknown values gracefully (treat as `Failed` and display the raw code in a developer-only tooltip).

---

## 4. Per-Step State Machine (Failure-Aware)

```
                       (file received)
                              │
                              ▼
                ┌──────────────────────────┐
                │   Step 1: VALIDATE       │
                └────┬───────────────┬─────┘
                     │ fail          │ pass
                     ▼               ▼
              ┌──────────────┐  ┌──────────────────────────┐
              │ status=      │  │   Step 2: n8n CALL      │
              │  Rejected    │  └────┬───────────────┬─────┘
              │ (no further  │       │ fail          │ pass
              │  steps)      │       ▼               ▼
              │ emit result  │ ┌──────────────┐  ┌──────────────────────┐
              └──────────────┘ │ status=      │  │   Step 3: BLOB       │
                               │  Failed      │  └────┬─────────────┬───┘
                               │ N8N_*        │       │ fail        │ pass
                               │ (no Blob,    │       ▼             ▼
                               │  no DB)      │ ┌──────────────┐  ┌────────────────────┐
                               │ emit result  │ │ status=      │  │   Step 4: DB       │
                               └──────────────┘ │  Failed      │  └────┬───────────┬───┘
                                              │ BLOB_FAILED  │       │ fail      │ pass
                                              │ (orphan Blob │       ▼           ▼
                                              │  possible)   │ ┌──────────────┐ ┌────────────┐
                                              │ emit result  │ │ status=      │ │ status=    │
                                              └──────────────┘ │  Failed      │ │  Success   │
                                                             │ DB_FAILED    │ │ emit result│
                                                             │ (orphan Blob │ └────────────┘
                                                             │  present)    │
                                                             │ emit result  │
                                                             └──────────────┘
```

**Invariants enforced at every arrow:**
- A failure transition sets `status` to `Rejected` or `Failed` (never `Success`).
- A failure transition sets `reasonCode` to a closed-set value.
- A failure transition appends exactly one per-file result to the batch list.
- A failure transition does not call any further step (Blob, DB).
- A success transition advances to the next step without appending a result yet.
- The only path to `Success` is passing all four steps.

---

## 5. Partial Success Contract

The response is partial-success by design. The semantics are:

1. The HTTP status is `200 OK` regardless of per-file outcomes.
2. The body always contains a `results` array with one entry per submitted file, in submission order.
3. Each entry has an unambiguous `status`.
4. The top-level `successfulFiles` and `failedFiles` counters are derived from `results` and are always equal to `totalFiles` minus the other.
5. The client never needs to inspect HTTP status to learn whether any file succeeded.

### 5.1 Example: 3 Files, Mixed Outcome

| File | Step 1 | Step 2 | Step 3 | Step 4 | Final status | reasonCode |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| `report.pdf` | pass | pass | pass | pass | `Success` | `null` |
| `malware.exe` | fail (extension) | — | — | — | `Rejected` | `EXTENSION_NOT_ALLOWED` |
| `invoice.xlsx` | pass | fail (timeout) | — | — | `Failed` | `N8N_TIMEOUT` |

Server-side:
- 1 DB row inserted (`report.pdf`).
- 1 Blob object written (`report.pdf`).
- No Blob object for `malware.exe` (rejected at validation).
- No Blob object for `invoice.xlsx` (rejected at n8n).
- The response contains 3 results, in order, with the statuses above.

### 5.2 Example: All Files Failed

If every file in a batch fails for any reason:
- HTTP status is still `200 OK`.
- `totalFiles = N`, `successfulFiles = 0`, `failedFiles = N`.
- The response body is the same shape as the partial-success case.
- The frontend shows N red entries.

### 5.3 Example: All Files Succeeded

If every file in a batch succeeds:
- HTTP status is `200 OK`.
- `totalFiles = N`, `successfulFiles = N`, `failedFiles = 0`.
- The response body is the same shape.
- The frontend shows N green entries.

### 5.4 Why `200 OK` for All-Failed

The reasoning, restated from `UPLOAD_CONTRACT.md`:
- The HTTP request was understood and processed.
- The server's job was to attempt each file and report results; that is done.
- Per-file outcomes are reported in the body, not the status line.
- Browsers, `fetch`, axios, etc., all treat `200 OK` as "I got a response" — which is true.
- The frontend's UI logic must be driven by `results[].status`, not by HTTP code.

---

## 6. Logging Contract

Every failure emits a structured log entry. The exact log framework is a Phase 2+ choice; the contract is:

| Log level | When | Fields |
|:---|:---|:---|
| `Information` | Every successful file | `requestId`, `documentId`, `schoolId`, `originalName`, `sizeBytes`, `category`, `durationMs` |
| `Warning` | Every rejected file | `requestId`, `documentId` (null if pre-allocation), `schoolId`, `originalName`, `reasonCode`, `message` |
| `Warning` | n8n / Blob / DB failure | `requestId`, `documentId`, `schoolId`, `originalName`, `reasonCode`, `upstreamStatus` (if any), `upstreamError` (if any) |
| `Error` | `INTERNAL_ERROR` | `requestId`, `documentId`, `schoolId`, `originalName`, `exception` |
| `Information` | Batch complete | `requestId`, `schoolId`, `totalFiles`, `successfulFiles`, `failedFiles`, `totalDurationMs` |

Logs are emitted to the application's standard logging pipeline. They are **not** written to the database in v1 (no audit log table yet). Phase 5 will introduce a dedicated `AuditLogs` table.

---

## 7. What the Frontend Does With Failures

The frontend (Phase 3 UI) follows these rules:

1. Match the server's `results` to the local file list by `originalName`.
2. For each `Success`: show a green check; show the `category` next to the filename.
3. For each `Rejected`/`Failed`: show a red indicator; show the `message` in the UI; show the `reasonCode` in a small tooltip for power users.
4. The user may:
   - Remove failed files and resubmit the successful ones.
   - Resubmit everything (server allocates fresh `documentId`s).
5. The frontend **does not** auto-retry. It does not attempt to call n8n or Blob directly.

---

## 8. Boundary Conditions

### 8.1 Empty Batch

A request with zero `files` parts returns HTTP `400` with `code = EMPTY_BATCH`. No per-file `results` array is returned. The frontend must handle this before allowing the user to click "upload".

### 8.2 Single Oversized File

A request with a single file > 20 MB returns HTTP `413` with `code = FILE_TOO_LARGE`. The per-file result is not used at this level; the entire request is rejected. (Note: this is a request-level rejection because Kestrel/IIS rejects the multipart body before the controller sees it. Smaller oversized files detected after binding produce per-file `Rejected` results with `SIZE_EXCEEDED`.)

### 8.3 Total Body > 25 MB

The Kestrel limit (configurable; default 25 MB) returns HTTP `400` with `code = BODY_TOO_LARGE`. The controller is not invoked.

### 8.4 Malformed Multipart

Kestrel returns HTTP `400`. The controller is not invoked.

### 8.5 Subscription Locked (Phase 6, Future)

If the school's subscription is `Expired` past grace, `Suspended`, or `Canceled`:
- HTTP `402 Payment Required` is returned.
- `code = SUBSCRIPTION_EXPIRED` (or `SUBSCRIPTION_SUSPENDED` / `SUBSCRIPTION_CANCELED`).
- The per-file structure is **not** used; the entire request is rejected at middleware level.
- This is documented now for client compatibility (the frontend will eventually handle `402`).

### 8.6 Rate Limited (Phase 5, Future)

If the per-user rate limit is exceeded:
- HTTP `429 Too Many Requests`.
- `code = RATE_LIMITED`.
- `Retry-After` header indicates seconds to wait.

---

## 9. Out-of-Scope (Deferred)

- Compensating delete of partial Blob objects.
- Compensating delete of orphan DB rows (none can exist; this is for completeness).
- Dead-letter queue for failed files.
- Auto-retry with exponential backoff.
- Webhook callback to a per-school endpoint on failure.
- Email/SMS notification to the user.
- Audit log table writes for failures (Phase 5).
