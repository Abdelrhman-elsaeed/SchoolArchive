# STORAGE_CONTRACT.md - Azure Blob Storage Contract

This document specifies the Azure Blob Storage path convention, operations, and isolation rules used by the **الأرشيف المدرسي العربي** (Arabic School Archive) upload pipeline. It is design-only and contains no C# code, no ARM/Bicep templates, and no Azurite setup scripts. Phase 2+ implementation will instantiate this contract.

This document refines the path convention introduced in `SECURITY.md` § 1 and `DECISIONS.md` § 3.

---

## 1. Container and Account Topology

| Property | Value |
|:---|:---|
| Storage account | Single shared account (`arqstorage`) |
| Container | Single container: `school-archives` |
| Public access | **Disabled** (private container) |
| Default encryption | Microsoft-managed keys (customer-managed keys are out of v1 scope) |
| Minimum TLS | 1.2 |
| Network rules | Phase 5 will restrict to specific VNets/IPs. Phase 1: open from app egress. |
| Lifecycle policy | Phase 2+ will route to Cool tier after 90 days, Archive tier after 365 days. Phase 1: default Hot tier. |

All schools share the same account and container. Logical isolation is enforced by the object name prefix (Section 2).

---

## 2. Blob Object Name Convention

### 2.1 Format

```
schools/{schoolId}/archive/{yyyy}/{MM}/{documentId}_{safeFileName}
```

| Segment | Type | Source | Description |
|:---|:---|:---|:---|
| `schools` | literal | — | Constant prefix; non-negotiable. |
| `{schoolId}` | UUID string | `ICurrentSchoolContext.SchoolId` | Authenticated tenant id. |
| `archive` | literal | — | Constant; reserves the namespace for future sibling prefixes (e.g., `audit/`, `temp/`). |
| `{yyyy}` | 4-digit zero-padded year | `uploaded_at_utc` year at insert time | Enables lifecycle routing by year. |
| `{MM}` | 2-digit zero-padded month | `uploaded_at_utc` month at insert time | Range 01–12. |
| `{documentId}` | UUID string | Backend `NewGuid()` | Same id used in DB row PK and n8n correlation. |
| `_` | literal | — | Separator. |
| `{safeFileName}` | sanitized string | Section 2.2 | Distinct from `original_name`; for storage key only. |

### 2.2 `safeFileName` Construction Rules

The `safeFileName` is derived from the original filename **only for the storage key**. It is never written to the DB `original_name` column.

Allowed character set (the allowlist):
- ASCII letters: `A-Z`, `a-z`
- ASCII digits: `0-9`
- The characters `.`, `_`, `-`
- Arabic Unicode block: `U+0600`–`U+06FF` (the Arabic and Arabic Supplement blocks)

Rules:
1. Trim leading/trailing whitespace.
2. Replace every space (`U+0020`) with `_`.
3. For every character not in the allowlist above, replace it with `_`.
4. Collapse consecutive `_` into a single `_`.
5. Strip leading `_` and `.` characters.
6. Truncate to **100 characters** maximum.
7. If empty after sanitization, fall back to `file`.
8. The final Blob object name's total length (including the `schools/.../{documentId}_` prefix) must be **≤ 1024 characters** (Azure limit is 2048, we cap conservatively).

The `safeFileName` is also stored in the DB row (`safe_name` column, see `DB_SCHEMA_PLAN.md` § 2.1) for diagnostics. The `original_name` column holds the un-trimmed, un-sanitized, un-truncated original.

### 2.3 Example

Given:
- `schoolId = 11111111-1111-1111-1111-111111111111`
- `documentId = 4a3b1d2e-07d7-4729-996b-66b002e885d9`
- `originalName = "تقرير الغياب 2026.pdf"`
- `uploaded_at_utc = 2026-06-16T10:15:30Z`

The Blob object name is:
```
schools/11111111-1111-1111-1111-111111111111/archive/2026/06/4a3b1d2e-07d7-4729-996b-66b002e885d9_تقرير_الغياب_2026.pdf
```

Sanitization steps (in this example, only the spaces are replaced):
- Original: `تقرير الغياب 2026.pdf`
- Step 2: `تقرير_الغياب_2026.pdf` (Arabic letters are in the allowlist, so they pass through)
- All other steps: no-op.

### 2.4 Anti-Patterns (Explicitly Rejected)

- **User-controlled suffix:** Never allow the original filename to flow into the Blob name without sanitization. A filename like `../../etc/passwd` would be sanitized to `.._.._.._etc_passwd` and is therefore safe, but the **only** reason to trust that is the deterministic sanitizer. Direct concatenation is forbidden.
- **Per-school container:** v1 uses one container. Per-school containers are a premium-tier upgrade (out of scope).
- **No schoolId prefix:** Forbidden. Storage-layer isolation requires the prefix.
- **Storing full original name in the object key:** Forbidden. Long Arabic filenames can exceed limits; the safe_name is the storage form.

---

## 3. Storage Operations

### 3.1 Upload (Step 3 of the Orchestration)

| Property | Value |
|:---|:---|
| Operation | `PutBlob` (block blob, single Put) |
| Source | `IFormFile.OpenReadStream()` (or buffered equivalent) |
| Object name | Section 2 |
| `Content-Type` (Blob HTTP header) | Verified MIME type (e.g., `application/pdf`) |
| `Content-Length` | `size_bytes` |
| `Content-MD5` | Optional; computed if cheap |
| `x-ms-blob-content-encoding` | Not set |
| `x-ms-blob-content-language` | Not set |
| `x-ms-meta-*` | None in v1. Phase 5 may add `x-ms-meta-school-id` and `x-ms-meta-document-id` for cross-checking via ops tools. |
| Concurrency | One upload at a time per request. No chunking, no parallelism. |
| Timeout | 30 seconds. (Higher than n8n's 15 s because uploads may be larger than classification responses.) |

**Failure outcomes:**
- HTTP non-2xx from Blob → `BLOB_FAILED`, no DB write.
- Timeout (30 s) → `BLOB_FAILED`, no DB write.
- Network error → `BLOB_FAILED`, no DB write.
- Successful 2xx → proceed to DB insert.

The backend does **not** call Blob with `If-None-Match: *` to enforce uniqueness. Uniqueness is already guaranteed by the `documentId` UUID; Blob writes always succeed unless the object already exists. If the object already exists, the backend treats it as a logic bug and surfaces `BLOB_FAILED` (a duplicate object is impossible by design).

### 3.2 Delete (Reserved, Not Used by Upload Pipeline)

A `DeleteBlob` operation is reserved for a future orphan-cleanup job. The upload pipeline never deletes. A future maintenance worker (Phase 4 or later) may:
1. List all `documents` in the DB.
2. List all objects in the `school-archives` container.
3. Compute the set difference; orphans are objects without a DB row.
4. Delete orphans.

Until that job exists, orphans are acknowledged but unrepaired.

### 3.3 Read (Out of Scope for Upload Pipeline)

The upload pipeline never reads from Blob. Reads are exclusively in the Phase 4 download path via SAS tokens (see `SECURITY.md` § 1 for SAS duration: 5–15 minutes).

---

## 4. Storage-Layer Tenant Isolation

### 4.1 The Path Prefix is the Tenant Boundary

The `schools/{schoolId}/` segment is the storage-layer tenant boundary. Two rules:

1. **Every write** (Step 3 of the orchestration) must compute its object name from the authenticated `schoolId` — never from any client-supplied value.
2. **Every read** (Phase 4 download) must verify that the requested `documentId` belongs to the authenticated school **before** generating a SAS token.

### 4.2 Defensive Checks in the Storage Service

The storage service class (to be implemented in Phase 2) is the only component that builds Blob object names. It must enforce:

| Check | What it asserts | What it does on failure |
|:---|:---|:---|
| Prefix check | The constructed object name starts with `schools/{currentSchoolContext.SchoolId}/` | Throws an internal exception → `INTERNAL_ERROR` (this is a programming bug, not a user error) |
| SchoolId format | `{currentSchoolContext.SchoolId}` is a valid UUID | Throws an internal exception |
| Length check | Object name ≤ 1024 characters | Throws `INTERNAL_ERROR` (or rejects the upload earlier if the original filename is excessively long) |
| No parent traversal | The constructed object name does not contain `..` segments | Throws `INTERNAL_ERROR` |

A unit test in Phase 5 will assert that the storage service refuses to write any object whose name does not start with the prefix for the current `schoolId`. This test guards against future regressions.

### 4.3 What the Service Will NOT Do

- It will not accept an object name from the caller. The caller passes the `documentId` and the `originalName`; the service constructs the name.
- It will not accept a `schoolId` parameter from the caller. It reads it from `ICurrentSchoolContext` at call time.
- It will not generate SAS tokens. SAS generation lives in the Phase 4 download path.

---

## 5. Cross-Tenant Leakage Tests (Design-Level)

Phase 5 tests must include:

1. **Prefix enforcement test**: Construct an `IArchiveStorage` with a mocked `ICurrentSchoolContext` returning school A. Attempt to write a name not starting with `schools/{schoolA}/`. Assert that the service throws.
2. **Cross-tenant read test (Phase 4)**: With school A's principal, request a SAS for a document whose `school_id` is school B. Assert the service returns a 403/404 path (no SAS).
3. **Prefix uniqueness test**: Generate two `documentId`s for the same file; assert that the two Blob object names differ (collisions are astronomically unlikely but the test pins the property).

---

## 6. Configuration Surface

| Setting | Default | Notes |
|:---|:---|:---|
| `Blob:AccountName` | (none, required) | Read from Key Vault in production. |
| `Blob:ContainerName` | `school-archives` | Hard-coded default; configurable. |
| `Blob:UploadTimeoutSeconds` | 30 | Per-call timeout. |
| `Upload:MaxFileSizeBytes` | 20971520 (20 MB) | Per-file cap. |
| `Upload:MaxBatchSizeBytes` | 26214400 (25 MB) | Total request cap. |
| `Upload:AllowedExtensions` | `.pdf,.docx,.xlsx,.png,.jpg,.jpeg` | Allowlist, comma-separated. |
| `Subscription:DefaultGracePeriodDays` | 7 | Per-school override on the row. |

All values are bound from configuration; nothing is hard-coded in source. Secrets come from environment variables in local dev and from Azure Key Vault in production (per `SECURITY.md` § 4).

---

## 7. Failure Surfaces Specific to Blob

These are the Blob-side failure modes the orchestration must distinguish from one another:

| Failure | Detected when | reasonCode |
|:---|:---|:---|
| 401/403 from Blob | HTTP response | `BLOB_FAILED` |
| 404 from Blob on subsequent GetBlob (orphan check, Phase 4) | Future read | `NOT_FOUND` (not in upload path) |
| 409 Conflict | HTTP response (e.g., lease conflict; should not occur) | `BLOB_FAILED` |
| Network/timeout | Client throws | `BLOB_FAILED` |
| Throttled (503) | HTTP response | `BLOB_FAILED` |

v1 does not differentiate Blob failure modes in the user-facing message. They are all `BLOB_FAILED`. Differentiation can be added in Phase 5 with structured logs only.

---

## 8. Operational Notes

- **No public URL is ever returned to the client.** The `blobUri` field in the response is the object name, suitable for diagnostics and for building SAS URLs server-side, but never a fetchable link.
- **Container is private.** Even if an attacker guesses an object name, they cannot read it. Reading requires a SAS or the app's role assignment.
- **Role assignment for the app identity:** The backend's managed identity has `Storage Blob Data Contributor` on the `school-archives` container only (not the whole account). It does **not** have `Storage Blob Data Reader` (the app does not list-blob).
- **No soft-delete in v1.** Blob soft-delete is a Phase 4+ concern.

---

## 9. Out-of-Scope (Deferred)

- Chunked uploads, resumable uploads.
- Direct browser → Blob uploads via SAS.
- Blob versioning and immutable storage.
- Customer-managed encryption keys (CMK).
- Cross-region replication.
- Storage firewalls / VNet integration (Phase 5).
