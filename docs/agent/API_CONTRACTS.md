# API_CONTRACTS.md - API Contracts (Frontend → Backend, Backend → n8n)

This document specifies the HTTP contracts for the upload pipeline. It is design-only and contains no controller code, no n8n workflow JSON, and no DTO classes. Phase 2+ implementation will instantiate these contracts.

The document covers three contracts:
1. **Frontend → Backend** upload request and response.
2. **Backend → n8n** classification request and response.
3. **Backend → Blob Storage** operations (covered in detail in `STORAGE_CONTRACT.md`; summarized here for completeness).

The contracts are deliberately strict: optional fields, defaults, and error envelopes are all enumerated.

---

## 1. Frontend → Backend Upload Contract

### 1.1 Endpoint

| Property | Value |
|:---|:---|
| Method | `POST` |
| Path | `/api/v1/archive/upload` |
| Auth | `Authorization: Bearer <jwt>` (required) |
| Content-Type | `multipart/form-data; boundary=<auto>` |
| Max body | 25 MB total (multipart overhead included) |
| Rate limit | Phase 5 will add a per-user cap. Phase 1: not limited at the API. |

### 1.2 Request

**Form fields:**

| Field | Type | Required | Count | Description |
|:---|:---|:---:|:---:|:---|
| `files` | file part | Yes | 1..N | One or more file parts. Field name must be `files`. |

**Headers:**

| Header | Required | Description |
|:---|:---:|:---|
| `Authorization` | Yes | Bearer JWT. The `school_id` claim is required. |
| `X-Request-Id` | No | Client-generated correlation UUID. If present, echoed in the response. |

**The client must NOT send:**
- `schoolId` (in body or query) — server ignores any such field.
- `documentId` — server allocates.
- `category` — server fills from n8n.

### 1.3 Response (Success Envelope)

HTTP `200 OK`. `Content-Type: application/json; charset=utf-8`.

```json
{
  "requestId": "9c1f6d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  "totalFiles": 3,
  "successfulFiles": 2,
  "failedFiles": 1,
  "results": [
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
    },
    {
      "originalName": "كشف_الدرجات.xlsx",
      "status": "Success",
      "reasonCode": null,
      "message": "تم أرشفة الملف بنجاح وتصنيفه كـ 'كشف درجات الطلاب'",
      "documentId": "9f8e7d6c-5b4a-3c2b-1a09-87654321fedc",
      "category": "كشف درجات الطلاب",
      "sizeBytes": 92103,
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "blobUri": "schools/11111111-1111-1111-1111-111111111111/archive/2026/06/9f8e7d6c-5b4a-3c2b-1a09-87654321fedc_كشف_الدرجات.xlsx"
    },
    {
      "originalName": "برنامج_ملغوم.exe",
      "status": "Rejected",
      "reasonCode": "EXTENSION_NOT_ALLOWED",
      "message": "نوع الملف غير مدعوم (EXE). الأنواع المسموحة: PDF, DOCX, XLSX, PNG, JPG, JPEG",
      "documentId": null,
      "category": null,
      "sizeBytes": null,
      "mimeType": null,
      "blobUri": null
    }
  ]
}
```

### 1.4 Response Schema (Per-File Result)

| Field | JSON type | Cardinality | Source | Notes |
|:---|:---|:---:|:---|:---|
| `originalName` | string | 1 | Client `Content-Disposition` filename | Preserved verbatim |
| `status` | string enum | 1 | Server | `Success` \| `Rejected` \| `Failed` |
| `reasonCode` | string enum \| null | 0..1 | Server | Null on `Success`. See § 1.7. |
| `message` | string | 1 | Server | Arabic, human-readable |
| `documentId` | UUID string \| null | 0..1 | Server | Null on `Rejected` (validation fails before allocation) |
| `category` | string \| null | 0..1 | n8n | Null on `Rejected` or `Failed` (n8n not called or failed) |
| `sizeBytes` | integer \| null | 0..1 | Server | Null if validation failed before size read |
| `mimeType` | string \| null | 0..1 | Server | Null if validation failed before MIME read |
| `blobUri` | string \| null | 0..1 | Server | Null if Blob step did not succeed |

### 1.5 Top-Level Schema

| Field | JSON type | Description |
|:---|:---|:---|
| `requestId` | UUID string | Server-generated if `X-Request-Id` not supplied |
| `totalFiles` | integer | `results.length` |
| `successfulFiles` | integer | Count of `results` with `status == "Success"` |
| `failedFiles` | integer | Count of `results` with `status != "Success"` |
| `results` | array of per-file results | Same length and order as the request's `files` parts |

### 1.6 HTTP Status Codes

| HTTP | When | Body |
|:---:|:---|:---|
| `200 OK` | Any successful parse + auth, regardless of per-file outcomes | Multi-status envelope (§ 1.3) |
| `400 Bad Request` | No `files` field, or body > 25 MB, or `Content-Type` not `multipart/form-data` | `{ "code": "EMPTY_BATCH" }` or `{ "code": "BODY_TOO_LARGE" }` or `{ "code": "UNSUPPORTED_MEDIA_TYPE" }` |
| `401 Unauthorized` | Missing/invalid JWT | `{ "code": "UNAUTHENTICATED" }` |
| `403 Forbidden` | JWT valid but no `school_id` claim | `{ "code": "TENANT_MISSING" }` |
| `402 Payment Required` | Reserved for Phase 6. Not returned in Phase 2/3. | Reserved shape. |
| `413 Payload Too Large` | Any single file > 20 MB detected at parse time | `{ "code": "FILE_TOO_LARGE", "limitBytes": 20971520 }` |
| `429 Too Many Requests` | Reserved for Phase 5. | Reserved shape. |
| `500 Internal Server Error` | Unhandled server fault | `{ "code": "INTERNAL_ERROR", "requestId": "..." }` |

### 1.7 Per-File `reasonCode` Enumeration

| reasonCode | When | status |
|:---|:---|:---|
| `EXTENSION_NOT_ALLOWED` | File extension not in allowlist | `Rejected` |
| `SIZE_EXCEEDED` | File size > configured max (default 20 MB) | `Rejected` |
| `MIME_MISMATCH` | Magic bytes do not match expected MIME for the extension | `Rejected` |
| `FILENAME_INVALID` | Filename empty, too long (> 512), or contains NUL bytes | `Rejected` |
| `N8N_TIMEOUT` | n8n webhook call exceeded 15-second timeout | `Failed` |
| `N8N_HTTP_ERROR` | n8n returned 4xx or 5xx | `Failed` |
| `N8N_INVALID_RESPONSE` | n8n returned 200 but body is not valid JSON or missing `category` | `Failed` |
| `BLOB_FAILED` | Azure Blob upload returned non-success or threw | `Failed` |
| `DB_FAILED` | DB insert failed (constraint, connectivity, etc.) | `Failed` |
| `INTERNAL_ERROR` | Unhandled exception in the orchestration loop for that file | `Failed` |

This list is the closed set of `reasonCode` values for v1. New values require updating this document and `FAILURE_HANDLING.md`.

### 1.8 Per-File `message` Language and Style

- Language: Modern Standard Arabic (الفصحى المبسطة), formal, no colloquial.
- For `Success`: `تم أرشفة الملف بنجاح وتصنيفه كـ '<category>'`. If category is missing: `تم أرشفة الملف بنجاح` (no category claim).
- For `Rejected`/`Failed`: include the actionable next step. Example: `نوع الملف غير مدعوم (EXE). الأنواع المسموحة: PDF, DOCX, XLSX, PNG, JPG, JPEG`.
- Length: ≤ 256 characters. The frontend may truncate for display.
- Tone matches the rest of the system (see `UI_THEME.md` § 5).

### 1.9 Frontend Mapping Rules

The frontend maps server `results` to its local file list by matching `originalName`. Rules:

1. Match by exact string equality on `originalName`.
2. If two client files share the same `originalName` (a UX edge case), fall back to array index. The server preserves submission order.
3. The frontend renders each result with one of three visual states:
   - `Success` → green check + show `category`.
   - `Rejected` → red ✕ + show `message`.
   - `Failed` → red ⚠ + show `message` + show `reasonCode` in a tooltip.
4. The frontend does not retry per-file. It surfaces the failure to the user; the user decides whether to re-submit (which creates a fresh `documentId`).

---

## 2. Frontend Form Encoding Rules

- The browser encodes the request natively when using `<input type="file" multiple>` and `FormData`.
- The React client must use the field name `files` (lowercase, plural).
- The client must not strip Unicode from filenames. The browser already URL-encodes the multipart headers; the server must decode `IFormFile.FileName` to its original UTF-8 form. (In .NET, `IFormFile.FileName` returns a UTF-8 string when `FormOptions.MultipartHeadersLengthLimit` is sufficient; no special handling needed if the multipart reader is the default.)
- The client must not add `Content-Disposition` modifications; native browser behavior is sufficient.

---

## 3. Backend → n8n Contract

### 3.1 Endpoint Configuration

The n8n webhook URL is read from configuration:

```
N8N__WebhookUrl = https://n8n.example.com/webhook/archive-classify
N8N__TimeoutSeconds = 15
N8N__SharedSecret = <from Key Vault>
```

The shared secret is sent as a custom header (see § 3.2). It is not the same as the user's JWT.

### 3.2 Request

**Transport:** `multipart/form-data`. The backend constructs a fresh request per file in the batch.

**Form fields (exact order is not significant; the n8n workflow must be tolerant):**

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `file` | binary | Yes | The original file bytes (same bytes that will be uploaded to Blob) |
| `schoolId` | UUID string | Yes | Authenticated tenant id. Allows n8n to apply school-specific classification rules. |
| `documentId` | UUID string | Yes | The pre-allocated document id. n8n logs use this for traceability. |

**Headers:**

| Header | Value | Notes |
|:---|:---|:---|
| `Authorization` | `Bearer <N8N_SHARED_SECRET>` | Static secret, rotated via configuration |
| `X-Request-Id` | `<backend request id>` | For cross-service tracing |
| `X-School-Id` | `<authenticated schoolId>` | Convenience header; redundant with form field but cheap |
| `X-Document-Id` | `<documentId>` | Same |
| `Content-Type` | `multipart/form-data; boundary=<...>` | Constructed by HTTP client |

**HTTP settings:**
- Method: `POST`
- Timeout: **15 seconds** total (connect + send + receive).
- Retry: **none** in v1 (the app fails fast).
- TLS: required (HTTPS only).

### 3.3 Response (Success)

HTTP `200 OK`. `Content-Type: application/json; charset=utf-8`.

```json
{
  "category": "تقرير إداري",
  "confidence": 0.92,
  "tags": ["تقرير", "إداري"],
  "language": "ar"
}
```

| Field | Type | Required by backend | Description |
|:---|:---|:---:|:---|
| `category` | string | Yes (if absent → `N8N_INVALID_RESPONSE`) | The classification label. Stored in `Archives.category`. Max length 127 chars. |
| `confidence` | number | No | Currently ignored. |
| `tags` | array of string | No | Currently ignored. Reserved for Phase 4 search. |
| `language` | string | No | Currently ignored. |

The backend treats the response as opaque beyond `category`. Extra fields are ignored. Missing `category` ⇒ `N8N_INVALID_RESPONSE`.

### 3.4 Response (Failure Modes as Seen by Backend)

| n8n outcome | Backend behavior |
|:---|:---|
| HTTP `2xx` with valid JSON and `category` | Treat as success; use `category` |
| HTTP `2xx` with invalid JSON or missing `category` | `N8N_INVALID_RESPONSE` |
| HTTP `2xx` with `category` longer than 127 chars | Truncate to 127 chars (do not fail) |
| HTTP `4xx` (e.g., 400, 401, 413) | `N8N_HTTP_ERROR` |
| HTTP `5xx` | `N8N_HTTP_ERROR` |
| Network error (DNS, TCP reset) | `N8N_HTTP_ERROR` |
| Timeout (15 s) | `N8N_TIMEOUT` |

In every failure case, the backend:
- Does not call Blob for that file.
- Does not insert a DB row.
- Returns `Failed` with the appropriate `reasonCode`.
- Logs the outcome with `requestId`, `documentId`, `schoolId`.

### 3.5 n8n Idempotency / State

n8n is **stateless** w.r.t. the upload. It does not store anything; the backend does not depend on n8n remembering a prior call. If n8n is restarted mid-batch, the current file's call fails (`N8N_HTTP_ERROR`) and subsequent files in the batch are processed normally.

### 3.6 n8n Concurrency

n8n accepts one file per request. The backend never sends two files in one request. Concurrent calls from different users are allowed; the backend does not serialize across users.

---

## 4. Backend → Blob Storage Contract

Covered in detail in `STORAGE_CONTRACT.md`. The relevant per-call contract is:

| Operation | Inputs | Outputs | Notes |
|:---|:---|:---|:---|
| Upload | `objectName`, `stream`, `contentType`, `size` | `ETag`, `LastModified` | Synchronous; no chunking in v1 |
| Delete (orphan cleanup) | `objectName` | `bool` | Not used by upload pipeline; reserved for future |

Blob operations do not return public URLs. They return internal object names. The frontend never receives a Blob URL directly; downloads go through `GET /api/v1/archive/download/{id}` (Phase 4), which generates a short-lived SAS.

---

## 5. Out-of-Scope (Deferred)

The following are not part of the v1 API surface and will be designed in later phases:

- `GET /api/v1/archive/search` — Phase 4
- `GET /api/v1/archive/download/{id}` — Phase 4
- `DELETE /api/v1/archive/{id}` — Phase 4+
- `POST /api/v1/archive/{id}/reclassify` — deferred
- `GET /api/v1/categories` — Phase 4
- `GET /api/v1/subscription` — Phase 6
- `POST /api/v1/subscription/renew` — Phase 6 (admin)
- `GET /api/v1/admin/...` — Phase 6

---

## 6. Versioning Policy

- The path prefix `/api/v1/` is locked for v1.
- Breaking changes require a `/api/v2/` prefix and a deprecation window.
- Adding new optional fields to the response is non-breaking.
- Adding new `reasonCode` values is non-breaking for clients that handle unknown values gracefully (the frontend should treat unknown `reasonCode` as `Failed` and display the raw code).

---

## 7. Compatibility Notes

- The frontend must treat the response as a 200 OK even when `failedFiles > 0`. It must NOT inspect HTTP status to decide success.
- The frontend must handle a `requestId` it did not send (server-generated).
- The frontend must be tolerant of trailing/leading whitespace in `originalName` returned by the server (the server trims).
- The `blobUri` returned to the frontend is the **object name**, not a URL. The frontend must not attempt to fetch it directly.
