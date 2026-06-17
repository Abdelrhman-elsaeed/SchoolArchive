# MANUAL_QA.md - Manual QA Validation Scenarios

This document provides step-by-step scripts and checklists for manual QA testing of the **الأرشيف المدرسي العربي** (Arabic School Archive) application.

Phase 2.5 introduces a development-only auth bypass so all scenarios below can be exercised with plain `curl` / Postman / Bruno. The bypass is gated on **both** `ASPNETCORE_ENVIRONMENT=Development` and `Auth:DevBypassEnabled=true`. In a non-Development environment the scenarios require a real JWT as documented in `LOCAL_RUN.md` §4.2.

> **Prereq:** Start the API and (optionally) Azurite + n8n as described in `LOCAL_RUN.md` §4 (native) or §5 (Docker). The examples below assume the dotnet-run port `5132`. If you are using Docker, replace with `8080`.

---

## QA Scenario Index

| ID | Scenario Title | Objective | Expected Result | Pass/Fail |
|:---:|:---|:---|:---|:---:|
| **QA-00** | Health endpoint reachable | Liveness probe. | `GET /health` returns 200. | — |
| **QA-01** | Single File Upload Success | Verify standard single-file upload path. | File archived, metadata in DB. | — |
| **QA-02** | Single File n8n Failure | Verify backend aborts if n8n classification fails. | No blob uploaded, no DB metadata row. | — |
| **QA-03** | Single File Blob Storage Failure | Verify backend aborts if Blob Storage fails. | No DB metadata row. | — |
| **QA-04** | DB Write Failure After Blob Success | Verify `DB_FAILED` returned, orphan flagged in logs. | Response is `Failed` with `DB_FAILED`. | xUnit only (Phase 2.5) |
| **QA-05** | Unsupported Type Rejection | Upload restricted extensions (e.g., `.exe`). | API returns `Rejected` with `EXTENSION_NOT_ALLOWED`. | — |
| **QA-06** | Oversized File Rejection | Upload a 21 MB file. | API returns HTTP 400 (`BODY_TOO_LARGE`). | — |
| **QA-07** | Cross-Tenant Read Check | Attempt to access another school's document ID. | Access denied (`404 Not Found`, no metadata leak). | Phase 4 |
| **QA-08** | Multi-File Mixed Upload | Verify batch uploads return granular statuses. | Successes saved, failures reported. | Phase 3 |
| **QA-09** | Expirations UX Placeholder | Verify UI lock screen when subscription expired. | Display renewal screen, block access. | Phase 6 server-side block; UI banner is Phase 7. |

A printable single-file request collection (curl + Bruno JSON) lives in:
- `docs/agent/REQUEST_COLLECTION.md`
- `docs/agent/bruno-collection.json`

---

## Common Test Vectors (Dev Bypass)

```bash
# API base (change to :8080 if using docker-compose)
export BASE_URL=http://localhost:5132
export DEV_SCHOOL_ID=11111111-1111-1111-1111-111111111111
export DEV_USER_ID=22222222-2222-2222-2222-222222222222

# A small valid PDF used in the success-path attempt.
mkdir -p /tmp/asa
printf '%%PDF-1.4\n%% hello from local manual QA\n%%EOF\n' > /tmp/asa/sample.pdf

# A .exe used for the extension-rejection scenario.
printf 'MZ' > /tmp/asa/looks-like-virus.exe

# A 21 MB file used for the oversize scenario.
dd if=/dev/zero of=/tmp/asa/big.pdf bs=1M count=21 2>/dev/null
```

---

## Detailed Scenario Scripts

### QA-00: Health endpoint reachable

1. `curl -sS $BASE_URL/health`
2. Assert HTTP 200 with body:
   ```json
   { "status": "ok", "time": "...", "service": "ArabicSchoolArchive.Api", "version": "phase-2.5" }
   ```

This must work with no auth headers and from any environment.

---

### QA-01: Single File Upload Success

1. Make sure both n8n and Azurite are reachable (e.g. `docker compose -f src/docker-compose.local.yml ps`).
2. Make sure the dev-bypass is on: `ASPNETCORE_ENVIRONMENT=Development` and `Auth:DevBypassEnabled=true` (the defaults).
3. Issue the upload with the dev-bypass headers:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/sample.pdf"
   ```
4. Assert HTTP 200 with body:
   ```json
   {
     "originalName": "sample.pdf",
     "status": "Success",
     "category": "...",
     "documentId": "<guid>",
     "blobUri": "schools/<schoolId>/archive/<yyyy>/<MM>/<docId>_sample.pdf"
   }
   ```
5. Verify the file is present in Azurite (use Azure Storage Explorer → `127.0.0.1:10000` → `school-archives` container) under the path above.
6. **DB check is not possible in the default in-memory configuration** — restart the API to confirm the row is lost. To verify the DB write, set `ConnectionStrings__AzureSql` to a real SQL Server and pre-create the `Archives` table per `LOCAL_RUN.md` §3.2.

---

### QA-02: Single File n8n Failure

1. Stop n8n (or set `N8N__WebhookUrl` to a black-hole URL such as `http://127.0.0.1:9`).
2. Re-run the upload from QA-01 step 3.
3. Assert HTTP 200 with body:
   ```json
   { "status": "Failed", "reasonCode": "N8N_HTTP_ERROR", "documentId": "<guid>" }
   ```
4. Assert the Azurite container has no new object for this `documentId`.
5. Assert the `Archives` table has no new row (only relevant with a real DB).
6. **Verified behaviour** (recorded in the Phase 2.5 smoke run): when n8n is down, the response is `Failed/N8N_HTTP_ERROR` with a populated `documentId` and `sizeBytes`, `blobUri: null`. n8n is called but Blob and DB are not.

---

### QA-03: Single File Blob Storage Failure

1. Make n8n reachable again and verify it returns `{ "category": "..." }` on a manual curl.
2. Break the Azurite connection: in `.env` change `BLOB_CONNECTION_STRING` to point at a non-existent port (e.g. swap `10000` → `65500`) and restart the API.
3. Re-run the upload from QA-01 step 3.
4. Assert HTTP 200 with `status: "Failed"`, `reasonCode: "BLOB_FAILED"`, `category` present (from n8n), `blobUri: null`.
5. Assert the `Archives` table has no new row.

---

### QA-04: DB Write Failure After Blob Success

The in-memory database cannot be made to throw on `SaveChangesAsync` through configuration. This scenario is **covered by the xUnit suite only** in Phase 2.5: `UploadOrchestratorTests.ThrowsWhenRepositoryFails_ReturnsDbFailed` (see `TESTING.md` §2.3). A future Phase 3+ feature flag (a "fault-injection mode" on the `ArchiveDbContext`) will make this scenario executable end-to-end.

Acceptance is still provable today:
- The xUnit test asserts `status: "Failed"`, `reasonCode: "DB_FAILED"`, `category` present, `blobUri` populated.
- The log line containing "Blob orphan possible" is asserted in the same test.

---

### QA-05: Unsupported Type Rejection

1. Issue the upload with the dev-bypass headers and a `.exe` file:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/looks-like-virus.exe"
   ```
2. Assert HTTP 200 with `status: "Rejected"`, `reasonCode: "EXTENSION_NOT_ALLOWED"`, `documentId: null`.
3. Assert the Azurite container has no new object.
4. Assert the `Archives` table has no new row.
5. **Verified behaviour** (Phase 2.5 smoke run): the response is `Rejected/EXTENSION_NOT_ALLOWED` with an Arabic message and `documentId: null`. n8n and Blob are not called.

---

### QA-06: Oversized File Rejection

1. Issue the upload with the dev-bypass headers and the 21 MB file:
   ```bash
   curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/big.pdf"
   ```
2. Assert HTTP 400 (`BODY_TOO_LARGE` from Kestrel's request body limit, not a JSON response).
3. (Variant) A 19.5 MB `.pdf` plus a multipart wrapper that nudges the body over the 25 MB cap. Assert HTTP 400 `BODY_TOO_LARGE`.

---

### QA-07: Cross-Tenant Read Check (Phase 4)

Phase 4 introduces the read endpoints. Every read and every download is scoped to the authenticated `school_id`. A request for another school's `documentId` returns **`404 Not Found`** (intentionally not `403`, to avoid leaking existence) with body `{ "code": "ARCHIVE_NOT_FOUND" }`. The response body never contains the other school's `originalName`, `documentId`, `blobObjectName`, or `signedUrl`.

Prepare the test vectors:

```bash
# Two schools to demonstrate isolation. School A owns a row; school B does not.
export DEV_SCHOOL_A=11111111-1111-1111-1111-111111111111
export DEV_SCHOOL_B=33333333-3333-3333-3333-333333333333
```

1. Upload a file as school A (QA-01 step 3 with `DEV_SCHOOL_A`).
2. Capture the returned `documentId` from the upload response.
3. Call `GET /api/v1/archive/archives/{documentId}` as school B:
   ```bash
   curl -sS -i $BASE_URL/api/v1/archive/archives/<docId> \
     -H "X-Dev-School-Id: $DEV_SCHOOL_B" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
4. Assert HTTP 404. Assert the response body does **not** contain `originalName`, `documentId`, `blobUri`, or any other metadata field.
5. Repeat the same with `GET .../download`. Assert HTTP 404 and the body does not contain a `signedUrl`.

### QA-08: Multi-File Mixed Upload (Phase 3)

The same `POST /api/v1/archive/upload` endpoint now accepts a `files` form field with multiple file parts. The response is always HTTP 200 with a per-file `results` array in submission order. Each file follows the same validate → n8n → blob → DB flow as a single-file upload, but the loop is **sequential** and **partial success is the norm** — a failure in file #2 does not roll back file #1.

> **Backward compatibility:** the original `file` form field still works. A request with exactly one `file` part returns the single-file response shape (no `results` array, no `totalFiles`).

Prepare two additional test vectors for QA-08:

```bash
# Two extra small valid PDFs for the multi-file success path.
printf '%%PDF-1.4\n%% second file\n%%EOF\n' > /tmp/asa/two.pdf
printf '%%PDF-1.4\n%% third file\n%%EOF\n'  > /tmp/asa/three.pdf
```

#### QA-08a: All files succeed

1. Make sure both n8n and Azurite are reachable.
2. Issue the multi-file upload:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "files=@/tmp/asa/sample.pdf" \
     -F "files=@/tmp/asa/two.pdf" \
     -F "files=@/tmp/asa/three.pdf"
   ```
3. Assert HTTP 200 with body:
   ```json
   {
     "totalFiles": 3,
     "successfulFiles": 3,
     "failedFiles": 0,
     "results": [
       { "originalName": "sample.pdf", "status": "Success", ... },
       { "originalName": "two.pdf",    "status": "Success", ... },
       { "originalName": "three.pdf",  "status": "Success", ... }
     ]
   }
   ```
4. Assert the order in `results` matches the order in the request.
5. Assert three new blobs exist in Azurite under the `schools/{schoolId}/archive/.../` prefix.

#### QA-08b: Mixed outcomes (success + Rejected + Failed)

1. Stop n8n (or point `N8N__WebhookUrl` at a black-hole address). Leave Azurite running.
2. Issue:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "files=@/tmp/asa/sample.pdf" \
     -F "files=@/tmp/asa/looks-like-virus.exe" \
     -F "files=@/tmp/asa/two.pdf"
   ```
   (Note: with n8n down, the two `.pdf` parts will come back as `Failed/N8N_HTTP_ERROR`, and the `.exe` will be `Rejected/EXTENSION_NOT_ALLOWED` — but all three results are returned in submission order.)
3. Assert HTTP 200 and the per-file statuses match input order.

#### QA-08c: Empty files collection

1. Issue a multipart POST with no `files` parts (e.g. just headers):
   ```bash
   curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
2. Assert HTTP 400 with body `{ "code": "EMPTY_BATCH" }`.

#### QA-08d: Batch size exceeded

1. Override the batch cap to a low value (e.g. `Upload__MaxBatchSizeBytes=1024`) and restart the API.
2. Issue a multi-file upload whose combined size exceeds 1 KiB (e.g. the 21 MB `big.pdf` from QA-06 plus `sample.pdf`).
3. Assert HTTP 400 with body `{ "code": "BODY_TOO_LARGE" }`. **No files are processed** — the controller-level cap fires before the orchestrator runs.

#### QA-08e: Single-file backward compat

1. Re-run the original single-file curl (QA-01 step 3) with `file=...` (not `files=...`).
2. Assert HTTP 200 with the single-file response shape (no `totalFiles`, no `results`).
3. This proves the legacy path is preserved; the multi-file surface is purely additive.

### QA-09: Expirations UX Placeholder
Pending Phase 6.

### QA-22: Active tenant can upload (Phase 6)

1. Use the well-known dev school id `11111111-1111-1111-1111-111111111111` (mapped to `Active` in `appsettings.Development.json`).
2. Issue a normal upload:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: 11111111-1111-1111-1111-111111111111" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/real.pdf;type=application/pdf"
   ```
3. Assert HTTP 200 with `status: "Success"` (or `Failed` if n8n/Blob are down, but never `SUBSCRIPTION_*`).

### QA-23: GracePeriod tenant can upload (Phase 6)

1. Use the well-known dev school id `22222222-2222-2222-2222-222222222222` (mapped to `GracePeriod` in `appsettings.Development.json`).
2. Issue the same upload as QA-22.
3. Assert HTTP 200 with `status: "Success"` (or `Failed` if n8n/Blob are down, but never `SUBSCRIPTION_*`).

### QA-24: Expired tenant upload returns 402 (Phase 6)

1. Use the well-known dev school id `33333333-3333-3333-3333-333333333333` (mapped to `Expired` in `appsettings.Development.json`).
2. Issue the upload:
   ```bash
   curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: 33333333-3333-3333-3333-333333333333" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/real.pdf;type=application/pdf"
   ```
3. Assert HTTP 402 with body:
   ```json
   { "code": "SUBSCRIPTION_EXPIRED", "state": "Expired", "schoolId": "33333333-..." }
   ```
4. Assert the response header `X-Subscription-State: Expired` is set.

### QA-25: Suspended tenant upload returns 403 (Phase 6)

1. Use the well-known dev school id `44444444-4444-4444-4444-444444444444` (mapped to `Suspended` in `appsettings.Development.json`).
2. Issue the same upload as QA-24.
3. Assert HTTP 403 with body:
   ```json
   { "code": "SUBSCRIPTION_SUSPENDED", "state": "Suspended", "schoolId": "44444444-..." }
   ```
4. Assert the response header `X-Subscription-State: Suspended` is set.

### QA-26: Active tenant can browse / search (Phase 6)

1. As the `Active` dev school, list the archives:
   ```bash
   curl -sS $BASE_URL/api/v1/archive/archives \
     -H "X-Dev-School-Id: 11111111-1111-1111-1111-111111111111" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
2. Assert HTTP 200 with the normal list response.

### QA-27: Expired tenant browse / search returns 402 (Phase 6)

1. As the `Expired` dev school, issue the same list call as QA-26.
2. Assert HTTP 402 with body `{ "code": "SUBSCRIPTION_EXPIRED", ... }`.

### QA-28: Suspended tenant download returns 403 (Phase 6)

1. As the `Active` dev school, upload a file (QA-22) and capture the `documentId`.
2. As the `Suspended` dev school, request the download URL:
   ```bash
   curl -sS -i $BASE_URL/api/v1/archive/archives/<docId>/download \
     -H "X-Dev-School-Id: 44444444-4444-4444-4444-444444444444" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 403 with body `{ "code": "SUBSCRIPTION_SUSPENDED", ... }`.
4. Assert that **no signed URL** is leaked in the body.

### QA-29: Middleware runs after auth — unauthenticated is 401 (Phase 6)

1. Issue an upload with **no** `X-Dev-School-Id` and **no** `Authorization: Bearer`:
   ```bash
   curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
     -F "file=@/tmp/asa/real.pdf;type=application/pdf"
   ```
2. Assert HTTP 401 with `WWW-Authenticate: Bearer`. The response must **not** be `402` or `403`. The subscription check runs **after** authentication; an unauthenticated request is rejected by the JWT / dev-bypass scheme first.

### QA-30: Tenant state is resolved by `school_id`, not `user_id` (Phase 6)

1. As the `Suspended` dev school, request the list with two different `X-Dev-User-Id` values:
   ```bash
   for user in 22222222-2222-2222-2222-222222222222 55555555-5555-5555-5555-555555555555; do
     curl -sS -i $BASE_URL/api/v1/archive/archives \
       -H "X-Dev-School-Id: 44444444-4444-4444-4444-444444444444" \
       -H "X-Dev-User-Id:  $user"
   done
   ```
2. Assert both responses are HTTP 403 with `SUBSCRIPTION_SUSPENDED`. The state is keyed on the `school_id`, not the user.

### QA-31: Subscription guard skips `/health` (Phase 6)

1. Issue `GET /health` with no auth:
   ```bash
   curl -sS -i $BASE_URL/health
   ```
2. Assert HTTP 200. The middleware skips `/health` regardless of subscription state.

### QA-32: Audit record for subscription block (Phase 6)

1. As the `Expired` dev school, trigger an upload (QA-24 step 2).
2. Inspect the application log. There must be one entry of category `ArabicSchoolArchive.Api.Services.AuditLog` with:
   - `action=Upload` (or `BrowseList` for a list attempt)
   - `outcome=ForbiddenTenantAccess`
   - `reasonCode=SUBSCRIPTION_EXPIRED`
   - `schoolId=33333333-...` (the blocked tenant)
   - `status=402`
3. The `originalName` and `signedUrl` fields must **not** be present (the request was blocked before any of that work was done).

### QA-10: List Archives (Phase 4)

1. Upload at least 2-3 files as the dev school (QA-01 step 3).
2. List the archives:
   ```bash
   curl -sS $BASE_URL/api/v1/archive/archives \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 200 with body containing `items`, `page`, `pageSize`, `totalCount`, `totalPages`.
4. Assert the response contains only the authenticated school's rows.

### QA-11: Search Archives (Phase 4)

1. With multiple archives uploaded, search by name fragment:
   ```bash
   curl -sS "$BASE_URL/api/v1/archive/archives?originalNameContains=$(printf 'تقرير' | jq -sRr @uri)" \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
2. Assert HTTP 200, only matching rows, only the authenticated school's rows.
3. Combine with the `category` and `processingYear` / `processingMonth` filters and assert composition.

### QA-12: Pagination (Phase 4)

1. Upload (or seed) at least 12 rows for the dev school.
2. ```bash
   curl -sS "$BASE_URL/api/v1/archive/archives?page=1&pageSize=5" \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 200, `page=1`, `pageSize=5`, `totalCount >= 12`, `totalPages >= 3`.
4. Repeat with `page=2`, `page=3` and assert the items do not overlap.

### QA-13: Get by document id (Phase 4)

1. Upload a file and capture the `documentId` from the response.
2. ```bash
   curl -sS $BASE_URL/api/v1/archive/archives/<docId> \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 200 with the row's `originalName`, `blobObjectName`, `category`, etc.
4. Repeat the same call as a different `schoolId`:
   ```bash
   curl -sS -i $BASE_URL/api/v1/archive/archives/<docId> \
     -H "X-Dev-School-Id: 33333333-3333-3333-3333-333333333333" \
     -H "X-Dev-User-Id:  22222222-2222-2222-2222-222222222222"
   ```
5. Assert HTTP 404 and the body does not contain the row's `originalName` or `documentId`.

### QA-14: Download (SAS URL) (Phase 4)

1. Upload a file as the dev school and capture its `documentId`.
2. Request a download URL:
   ```bash
   curl -sS $BASE_URL/api/v1/archive/archives/<docId>/download \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 200 with body:
   ```json
   {
     "documentId": "<docId>",
     "blobObjectName": "schools/<schoolId>/archive/.../...",
     "signedUrl": "http://.../devstoreaccount1/school-archives/...?sv=...&sr=b&sp=r&se=...&sig=...",
     "expiresAtUtc": "2026-06-17T10:15:00Z",
     "ttlMinutes": 10
   }
   ```
4. Pull the file with `curl`:
   ```bash
   curl -sS -o /tmp/asa/downloaded.pdf "<signedUrl>"
   diff /tmp/asa/sample.pdf /tmp/asa/downloaded.pdf && echo OK
   ```
5. Assert the bytes match the uploaded file.

### QA-15: Local-dev content route (Phase 4, revised for the local-dev run path)

> **Important:** in the local-dev run path, the API runs in Docker with
> `BLOB_CONNECTION_STRING` pointing at the internal `azurite` host
> (`http://azurite:10000/...`). The signed URL the API returns from
> `GET /archives/{id}/download` therefore points at `azurite`, which the
> **host browser cannot resolve**. In local dev, downloads must go through
> the dev-only content route. The Vite frontend (§QA-36) does this
> automatically when `LocalDev:DownloadStreamEnabled=true`.

This is a dev-only convenience that streams the blob through the API. It is
gated on `LocalDev:DownloadStreamEnabled=true` AND `ASPNETCORE_ENVIRONMENT=Development`.

1. Start the API with `LocalDev__DownloadStreamEnabled=true` (already the
   default in `docker-compose.local.yml` for the local-dev run path).
2. Upload a file (QA-01).
3. ```bash
   curl -sS -o /tmp/asa/streamed.pdf \
     $BASE_URL/api/v1/archive/archives/<docId>/content \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   diff /tmp/asa/sample.pdf /tmp/asa/streamed.pdf && echo OK
   ```
4. Assert the bytes match the uploaded file.
5. Re-run the same call as a different `schoolId`. Assert HTTP 404
   `ARCHIVE_NOT_FOUND` (the tenant check runs **before** the blob stream is
   opened, so a wrong school can never trigger a download).
6. In a non-Development environment (or with
   `LocalDev:DownloadStreamEnabled=false`), the route returns 404 for every
   request.
7. Verify the Vite frontend picked this up:
   ```bash
   curl -sS http://localhost:8080/api/v1/local-dev/info
   ```
   Assert the response includes `"downloadStreamEnabled": true`. (The
   frontend's "تنزيل المستند" button uses `/content` while this is true;
   the SAS URL is the production / staging fallback.)

### QA-16: Magic-bytes rejection (Phase 5)

1. Create a file with the right extension and MIME but the wrong magic bytes:
   ```bash
   printf 'MZ\x90\x00\x03\x00\x00\x00\x04\x00' > /tmp/asa/fake.pdf
   ```
2. Upload it:
   ```bash
   curl -sS -X POST $BASE_URL/api/v1/archive/upload \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
     -H "X-Dev-User-Id:  $DEV_USER_ID" \
     -F "file=@/tmp/asa/fake.pdf;type=application/pdf"
   ```
3. Assert HTTP 200 with body:
   ```json
   {
     "originalName": "fake.pdf",
     "status": "Rejected",
     "reasonCode": "MAGIC_BYTES_MISMATCH",
     "documentId": null,
     "blobUri": null
   }
   ```
4. Assert that no blob was uploaded to Azurite and no DB row was created.

### QA-17: Magic-bytes acceptance (Phase 5)

1. Create a real PDF (or use the sample from QA-01):
   ```bash
   printf '%%PDF-1.4\n%% hello\n%%EOF\n' > /tmp/asa/real.pdf
   ```
2. Upload it. Assert HTTP 200 with `status: "Success"` (or `Failed` if n8n/Blob are down, but never `Rejected`).
3. The byte signature of the file must start with `%PDF-` (hex `25 50 44 46 2D`).

### QA-18: Rate limit (Phase 5)

1. Set a low upload cap (e.g. `Upload__MaxBatchSizeBytes=1048576` and `RateLimit__UploadPerMinute=2`).
2. Restart the API and post 3 upload requests in a row:
   ```bash
   for i in 1 2 3; do
     curl -sS -o /dev/null -w "req $i: HTTP %{http_code}\n" \
       -X POST $BASE_URL/api/v1/archive/upload \
       -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
       -H "X-Dev-User-Id:  $DEV_USER_ID" \
       -F "file=@/tmp/asa/real.pdf;type=application/pdf"
   done
   ```
3. Assert that the first two requests return `HTTP 200` and the third returns `HTTP 429`.
4. Repeat for the read path with `RateLimit__ReadPerMinute=2`: 3 consecutive `GET /archives` calls. The first two return `HTTP 200` and the third returns `HTTP 429` with body containing `RATE_LIMITED`.
5. Assert the `429` response includes a `Retry-After: <seconds>` header.

### QA-19: CORS hardening (Phase 5)

1. Start the API with no `Cors:AllowedOrigins` (the default).
2. Send a preflight:
   ```bash
   curl -sS -i -X OPTIONS $BASE_URL/api/v1/archive/archives \
     -H "Origin: http://evil.example.com" \
     -H "Access-Control-Request-Method: GET"
   ```
3. Assert that the response does **not** contain `Access-Control-Allow-Origin`.
4. Restart the API with `Cors__AllowedOrigins__0=http://allowed.example.com` and re-send the preflight. Assert `Access-Control-Allow-Origin: http://allowed.example.com` is now in the response.
5. Try to start the API with `Cors__AllowedOrigins__0=*`. Assert the process refuses to start with `InvalidOperationException: Cors:AllowedOrigins must not contain '*'`.

### QA-20: Cross-tenant denial is audited (Phase 5)

1. Upload a file as `DEV_SCHOOL_A` and capture the `documentId` from the response.
2. Switch the dev-bypass header to `DEV_SCHOOL_B`:
   ```bash
   curl -sS -i $BASE_URL/api/v1/archive/archives/<docId> \
     -H "X-Dev-School-Id: 33333333-3333-3333-3333-333333333333" \
     -H "X-Dev-User-Id:  $DEV_USER_ID"
   ```
3. Assert HTTP 404 `ARCHIVE_NOT_FOUND` and the body does not contain the row's `originalName` or `documentId`.
4. Inspect the application log: an entry of category `ArabicSchoolArchive.Api.Services.AuditLog` with `action=BrowseGetById outcome=ForbiddenTenantAccess schoolId=<attacker> documentId=<docId>` must be present. The original document's name and blob URI must **not** appear in the log line.

### QA-21: Secret scrubbing in logs (Phase 5)

1. Configure the API with a real-looking `Auth:SigningKey=THIS_IS_A_SECRET_VALUE` and `Blob:ConnectionString=AccountName=x;AccountKey=REAL_KEY_DO_NOT_LOG`.
2. Restart and trigger a few requests.
3. Grep the log for the values:
   ```bash
   grep -R "THIS_IS_A_SECRET_VALUE" /tmp/asa/api.log
   grep -R "REAL_KEY_DO_NOT_LOG"   /tmp/asa/api.log
   ```
4. Assert zero matches in both cases.
5. Trigger a download and grep for the SAS URL:
   ```bash
   curl -sS $BASE_URL/api/v1/archive/archives/<docId>/download \
     -H "X-Dev-School-Id: $DEV_SCHOOL_ID" -H "X-Dev-User-Id: $DEV_USER_ID" > /dev/null
   grep -R "signedUrl" /tmp/asa/api.log
   ```
6. Assert the log line is present (the audit log records the action) but the `sig=…` value is replaced with `***` and the path query string is replaced with `?***`.

---

## Non-Dev Path (Real JWT)

If `Auth:DevBypassEnabled=false` **or** the host environment is not `Development`, the dev-bypass is fully disabled. Every request must carry a real `Authorization: Bearer <jwt>` issued with the same `Auth:Issuer` / `Auth:Audience` / `Auth:SigningKey` values the API was configured with, and the JWT must contain:

- `sub` (UUID) — used as `uploadedByUserId`.
- `school_id` (UUID) — used to scope the upload and the blob path.

All scenarios above still apply; only the request syntax changes:

```bash
curl -X POST $BASE_URL/api/v1/archive/upload \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@/tmp/asa/sample.pdf"
```

The minting of the JWT itself is out of scope for Phase 2.5. Phase 5 (Security Hardening) will define the real identity provider integration.

---

## Phase 7 — UI Scenarios (QA-33..QA-40)

Phase 7 ships the first user-facing UI under `src/ArabicSchoolArchive.Web/` (Vite + React + TypeScript). The dev server runs on `http://localhost:5173` and proxies `/api/*` + `/health` to the dotnet API on `:5132` (see `LOCAL_RUN.md` §8).

> **Prereq:** Start the API as in §4 (native) or §5 (Docker) of `LOCAL_RUN.md`. Then in a separate terminal:
> ```bash
> cd src/ArabicSchoolArchive.Web
> npm install
> npm run dev
> ```
> Open `http://localhost:5173/`. The default dev-bypass school id is `11111111-1111-1111-1111-111111111111` (Active).

### QA-33: Multi-file upload renders granular per-file results

1. With the API up and the dev-bypass enabled, open `http://localhost:5173/upload` (or click "رفع المستندات" in the header).
2. In the file picker, select two valid PDFs and one `.exe` file.
3. Click "رفع المستندات".
4. Assert the page renders a per-file list with three rows in submission order. The two PDFs show a "ناجح" or "فشل" badge; the `.exe` shows a "مرفوض" badge.
5. Assert the summary line shows the correct counts (e.g. إجمالي: 3، ناجح: 2، مرفوض: 1).
6. Assert each row shows the original name, the status badge, the Arabic message, and the reason code (when applicable).

### QA-34: Mixed upload (Success + Rejected + Failed) renders all three badges

1. With n8n disabled, open the upload page.
2. Pick one valid PDF and one `.exe` file.
3. Click "رفع المستندات".
4. Assert the PDF shows "فشل" with reason code `N8N_HTTP_ERROR` (or similar) and the `.exe` shows "مرفوض" with `EXTENSION_NOT_ALLOWED`.
5. Assert the Arabic error / rejection message is rendered for each row, not the English reason code alone.

### QA-35: Browse + search + pagination

1. With at least 3 archived documents, open `http://localhost:5173/archives` (or click "الأرشيف" in the header).
2. Type a name fragment in the search box and click "بحث".
3. Assert the result count, page indicator, and per-row metadata (original name, category, size, upload date) are in Arabic.
4. Click "التالي" / "السابق" to navigate pages. Assert the page indicator updates.
5. With no results, assert the empty state ("لا توجد مستندات") renders.

### QA-36: Document details + download

1. From the browse page, click a row's "التفاصيل" button.
2. Assert the details page shows: document id, original name, category, MIME, size, upload date, year/month, blob object name.
3. Click "تنزيل المستند". A new tab opens with the signed URL. The dev-only direct-stream route (`/content`) is **not** used by the UI.
4. Assert the page shows "تم إصدار رابط تنزيل صالح حتى …" below the button.

### QA-37: Expired tenant blocked

1. In the footer, click "إعدادات المطور".
2. Click the "منتهي الصلاحية" preset (sets school id to `33333333-3333-3333-3333-333333333333`).
3. Click "تطبيق", then navigate to "رفع المستندات" or "الأرشيف".
4. Assert the page renders the Expired placeholder with the Arabic copy ("انتهت صلاحية اشتراك المدرسة").
5. Assert the placeholder lists the three recommended steps and the "إعادة المحاولة" button.

### QA-38: Suspended tenant blocked

1. In the dev settings, click the "موقوف" preset (school id `44444444-4444-4444-4444-444444444444`).
2. Click "تطبيق" and navigate to any protected route.
3. Assert the Suspended placeholder renders with the Arabic copy ("اشتراك المدرسة موقوف").
4. Assert no payment, no renewal button, no checkout is shown — only the calm placeholder and the recommended steps.

### QA-39: Rate-limit visible error

1. Set the API's `RateLimit:ReadPerMinute=2` and restart.
2. In the UI, refresh the browse page three times in a row.
3. Assert the third request shows the rate-limit alert in Arabic: "تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد لحظات."
4. Restart the API with a higher cap (e.g. `300`) to restore the rate limit.

### QA-40: RTL rendering sanity check

1. Open the page in a fresh tab.
2. Inspect the document (`Ctrl+U` or `View Source`). Assert `<html lang="ar" dir="rtl">` is set.
3. Assert the navigation links in the header read right-to-left ("رفع المستندات" then "الأرشيف").
4. Assert cards and form fields are right-aligned by default.
5. Resize the window below 720 px. Assert the filters collapse to a single column and the page stays usable on mobile.
