# Arabic School Archive - Local API Request Collection

> **Format:** Plain `curl` examples. These can be pasted directly into a shell,
> imported into Postman/Insomnia/Bruno via "Import > Raw text > cURL", or
> wrapped in a small script.
>
> **Environment:** All examples assume the API is reachable at
> `http://localhost:5132` (default `dotnet run` port) OR `http://localhost:8080`
> (default docker-compose port). The `BASE_URL` placeholder below lets you
> flip between them.

## Environment variables used in the examples

```bash
# Pick one:
export BASE_URL=http://localhost:5132      # native dotnet run
# export BASE_URL=http://localhost:8080    # docker-compose

# Dev-bypass identity headers (only honored when ASPNETCORE_ENVIRONMENT=Development
# and Auth:DevBypassEnabled=true — see LOCAL_RUN.md §4.2).
export DEV_SCHOOL_ID=11111111-1111-1111-1111-111111111111
export DEV_USER_ID=22222222-2222-2222-2222-222222222222

# A small valid PDF used in the success-path attempt.
mkdir -p /tmp/asa
printf '%%PDF-1.4\n%% hello from local manual QA\n%%EOF\n' > /tmp/asa/sample.pdf

# A .exe used for the extension-rejection scenario.
printf 'MZ' > /tmp/asa/looks-like-virus.exe

# A 21 MB file used for the oversize scenario.
dd if=/dev/zero of=/tmp/asa/big.pdf bs=1M count=21 2>/dev/null

# Two extra small valid PDFs used by the multi-file scenarios (QA-08).
printf '%%PDF-1.4\n%% second file\n%%EOF\n' > /tmp/asa/two.pdf
printf '%%PDF-1.4\n%% third file\n%%EOF\n'  > /tmp/asa/three.pdf
```

## 1. Health check (no auth)

```bash
curl -sS $BASE_URL/health
```

Expected:
```json
{ "status": "ok", "time": "...", "service": "ArabicSchoolArchive.Api", "version": "phase-2.5" }
```

## 2. Upload without auth (expect 401)

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST $BASE_URL/api/v1/archive/upload \
    -F "file=@/tmp/asa/sample.pdf"
```

## 3. Single-file upload (success path against real n8n + Azurite)

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/sample.pdf"
```

Expected (when n8n and Azurite are both up):
```json
{
  "originalName": "sample.pdf",
  "status": "Success",
  "reasonCode": null,
  "message": "تم أرشفة الملف بنجاح وتصنيفه كـ '...'",
  "documentId": "<guid>",
  "category": "...",
  "sizeBytes": 31,
  "mimeType": "application/pdf",
  "blobUri": "schools/<schoolId>/archive/2026/06/<docId>_sample.pdf"
}
```

If n8n is not running (likely in a brand-new clone) you will get:
```json
{ "status": "Failed", "reasonCode": "N8N_HTTP_ERROR", "documentId": "<guid>", ... }
```
If Azurite is not running, you will get:
```json
{ "status": "Failed", "reasonCode": "BLOB_FAILED", "blobUri": null, ... }
```

## 4. Extension rejection (QA-05)

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/looks-like-virus.exe"
```

Expected:
```json
{
  "originalName": "looks-like-virus.exe",
  "status": "Rejected",
  "reasonCode": "EXTENSION_NOT_ALLOWED",
  "documentId": null,
  "blobUri": null
}
```

## 5. Oversize rejection (QA-06)

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/big.pdf"
```

Expected: HTTP 400 (`BODY_TOO_LARGE` from Kestrel — request-level rejection,
because the file exceeds the 25 MB request body limit).

## 6. Empty batch (no file part)

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 400 with body `{ "code": "EMPTY_BATCH" }`.

## 7. Missing tenant claim

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/sample.pdf"
```

Expected: HTTP 403 with body `{ "code": "TENANT_MISSING" }`.

(The `X-Dev-User-Id` header alone is not enough: the dev-bypass requires
`X-Dev-School-Id` to construct a valid `school_id` claim.)

## 8. n8n failure injection (QA-02)

Point `N8N__WebhookUrl` at an unreachable address (e.g.
`http://127.0.0.1:9` — discard port), then re-run request #3.

Expected:
```json
{
  "originalName": "sample.pdf",
  "status": "Failed",
  "reasonCode": "N8N_HTTP_ERROR",
  "documentId": "<guid>",
  "blobUri": null
}
```

No row should be written and no blob should be uploaded. (The in-memory DB
loses state on restart, so re-running the same request will return a new
`documentId` each time. That is expected.)

## 9. Blob failure injection (QA-03)

Point `BLOB__ConnectionString` at a non-existent Azurite (e.g.
`UseDevelopmentStorage=true;BlobEndpoint=http://127.0.0.1:65500/devstoreaccount1;`),
keep `N8N__WebhookUrl` at a working mock that returns `{"category":"test"}`,
and re-run request #3.

Expected:
```json
{
  "status": "Failed",
  "reasonCode": "BLOB_FAILED",
  "category": "test",
  "blobUri": null
}
```

## 10. DB failure injection (QA-04)

Phase 2.5 ships against the in-memory DB, so DB failures cannot be triggered
through configuration. The xUnit suite (`UploadOrchestratorTests`) covers the
`DB_FAILED` path with a throwing `ArchiveDbContext`. See `TESTING.md` §3.

---

## Phase 3 multi-file scenarios (QA-08)

The `POST /api/v1/archive/upload` endpoint now accepts a `files` form field
with one or more file parts. The response is always HTTP 200 with a per-file
`results` array in submission order, plus `totalFiles`, `successfulFiles`, and
`failedFiles` counters. Each file follows the same validate → n8n → blob → DB
flow as a single-file upload, but the loop is **sequential** and **partial
success is the norm**.

The original `file` form field still works — a request with exactly one `file`
part returns the single-file response shape (no `results`, no `totalFiles`).

### 11. Multi-file upload — all success (QA-08a)

Requires n8n and Azurite reachable.

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "files=@/tmp/asa/sample.pdf" \
    -F "files=@/tmp/asa/two.pdf" \
    -F "files=@/tmp/asa/three.pdf"
```

Expected:
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

Order in `results` must match the order of the `-F` flags in the request.
Three new blobs should appear in Azurite under the `schools/{schoolId}/archive/.../`
prefix.

### 12. Multi-file upload — mixed outcomes (QA-08b)

Stop n8n (or set `N8N__WebhookUrl=http://127.0.0.1:9`) but leave Azurite running.
Then:

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "files=@/tmp/asa/sample.pdf" \
    -F "files=@/tmp/asa/looks-like-virus.exe" \
    -F "files=@/tmp/asa/two.pdf"
```

Expected: HTTP 200, `totalFiles=3`, with the `.exe` reported as
`Rejected/EXTENSION_NOT_ALLOWED` (no `documentId`, no n8n, no blob, no DB) and
the two `.pdf` parts reported as `Failed/N8N_HTTP_ERROR` (with `documentId`
allocated but `blobUri: null`).

To produce a **partial-success** shape (some `Success` and some `Failed`),
keep n8n reachable for the request and set `N8N__WebhookUrl=http://127.0.0.1:9`
**only for the duration of the request** — Phase 3 does not implement
per-request failure injection at the HTTP layer. The xUnit suite
(`UploadOrchestratorBatchTests.MixedOutcomes_PartialSuccess`) covers the
partial-success case end-to-end.

### 13. Multi-file upload — empty files (QA-08c)

A multipart POST with no `files` (or `file`) parts:

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 400 with body `{ "code": "EMPTY_BATCH" }`. (Adding a non-file
form field, e.g. `-F "_dummy=x"`, also yields `EMPTY_BATCH` — there must be
at least one file part.)

### 14. Multi-file upload — batch size exceeded (QA-08d)

Override the batch cap to a low value and restart the API:

```bash
export Upload__MaxBatchSizeBytes=1024
# restart the API process
```

Then send a multi-file request whose combined size exceeds 1 KiB:

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "files=@/tmp/asa/big.pdf" \
    -F "files=@/tmp/asa/sample.pdf"
```

Expected: HTTP 400 with body `{ "code": "BODY_TOO_LARGE" }`. **No files are
processed** — the controller-level batch cap fires before the orchestrator runs.

### 15. Single-file backward compat (QA-08e)

Re-run the original single-file curl (request #3) with `file=...` (not
`files=...`):

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/sample.pdf"
```

Expected: HTTP 200 with the single-file response shape — the body contains
`originalName`, `status`, `documentId`, etc. but does **not** contain
`totalFiles` or `results`. This proves the legacy path is preserved; the
multi-file surface is purely additive.

---

## Phase 4 browse, search, retrieval scenarios (QA-07, QA-10..QA-15)

Phase 4 adds read-only endpoints under `/api/v1/archive/archives`. Every
endpoint requires authentication (dev bypass is the same as for the upload
endpoint) and is scoped to the authenticated `school_id` server-side. A
request for another school's `documentId` returns `404 ARCHIVE_NOT_FOUND`
with no metadata leak.

Capture a `documentId` from a previous upload response and substitute it in
the curl examples below.

### 16. List archives (QA-10)

```bash
curl -sS "$BASE_URL/api/v1/archive/archives" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 200 with a JSON body of the shape:

```json
{
  "items": [ { "documentId": "...", "originalName": "...", ... }, ... ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 3,
  "totalPages": 1
}
```

Only the authenticated school's rows are returned. Defaults: `page=1`,
`pageSize=20`. `pageSize` is capped at 100.

### 17. Search + filter (QA-11)

```bash
# Filter by name fragment
curl -sS "$BASE_URL/api/v1/archive/archives?originalNameContains=$(printf 'تقرير' | jq -sRr @uri)" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"

# Filter by exact category + processing year/month
curl -sS "$BASE_URL/api/v1/archive/archives?category=%D8%AA%D9%82%D8%B1%D9%8A%D8%B1&processingYear=2026&processingMonth=6" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"

# Date range
curl -sS "$BASE_URL/api/v1/archive/archives?uploadedFrom=2026-06-01T00:00:00Z&uploadedTo=2026-06-30T23:59:59Z" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

All filters compose with the tenant filter; the result set is always
restricted to the authenticated school.

### 18. Pagination (QA-12)

```bash
curl -sS "$BASE_URL/api/v1/archive/archives?page=2&pageSize=5" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 200, `page=2`, `pageSize=5`, `totalCount >= 5`,
`totalPages >= 1`. The `items` array contains up to 5 entries, ordered by
`UploadedAtUtc` desc.

### 19. Get by document id (QA-13, QA-07)

```bash
# Same school — 200
curl -sS "$BASE_URL/api/v1/archive/archives/<docId>" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"

# Different school — 404 with no leak
export DEV_SCHOOL_B=33333333-3333-3333-3333-333333333333
curl -sS -i "$BASE_URL/api/v1/archive/archives/<docId>" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_B" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 404 with body `{ "code": "ARCHIVE_NOT_FOUND" }`. The response
body must **not** contain the `originalName`, `documentId`, `blobObjectName`,
or any other metadata field from the row.

### 20. Download (SAS URL) (QA-14)

```bash
# Same school — 200 with signedUrl
curl -sS "$BASE_URL/api/v1/archive/archives/<docId>/download" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 200 with body of the shape:

```json
{
  "documentId": "<docId>",
  "blobObjectName": "schools/<schoolId>/archive/2026/06/<docId>_sample.pdf",
  "signedUrl": "http://127.0.0.1:10000/devstoreaccount1/school-archives/schools/<schoolId>/archive/2026/06/<docId>_sample.pdf?sv=2021-10-04&sr=b&sp=r&se=2026-06-17T10:15:00Z&sig=...",
  "expiresAtUtc": "2026-06-17T10:15:00Z",
  "ttlMinutes": 10
}
```

The TTL is clamped to `5–15` minutes (configurable via
`Blob:SasTtlMinutes`, default 10). The `signedUrl` always includes
`schools/<authenticatedSchoolId>/` in the object name.

```bash
# Pull the file with curl
SIGNED_URL=$(curl -sS "$BASE_URL/api/v1/archive/archives/<docId>/download" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" | jq -r .signedUrl)
curl -sS -o /tmp/asa/downloaded.pdf "$SIGNED_URL"
diff /tmp/asa/sample.pdf /tmp/asa/downloaded.pdf && echo OK
```

Cross-tenant test:

```bash
# Different school — 404 with no signedUrl
curl -sS -i "$BASE_URL/api/v1/archive/archives/<docId>/download" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_B" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
```

Expected: HTTP 404 with body `{ "code": "ARCHIVE_NOT_FOUND" }`. The response
body must **not** contain the `signedUrl` or any metadata field.

### 21. Local-dev content route (QA-15)

> **Important (revised for the local-dev run path):** when the API runs in
> Docker and `BLOB_CONNECTION_STRING` points at the internal `azurite` host
> (`http://azurite:10000/...`), the signed URL the API returns in `download`
> / `20` is **not** resolvable from the host browser — the browser cannot
> resolve the `azurite` DNS name. **In local dev, do not open the SAS URL
> from the browser.** Use the dev-only content route below, which the Vite
> frontend (see §22) calls automatically when `LocalDev:DownloadStreamEnabled=true`.

This is a dev-only convenience that streams the blob through the API. It is
gated on `ASPNETCORE_ENVIRONMENT=Development` **and**
`LocalDev:DownloadStreamEnabled=true`. It is **not** intended for production.

```bash
# Start the API with the dev stream route enabled
export LocalDev__DownloadStreamEnabled=true
# (then start the API as usual)
```

```bash
# Same school — 200 with the file bytes
curl -sS -o /tmp/asa/streamed.pdf \
    "$BASE_URL/api/v1/archive/archives/<docId>/content" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
diff /tmp/asa/sample.pdf /tmp/asa/streamed.pdf && echo OK

# Different school — 404 (tenant check runs first)
curl -sS -i "$BASE_URL/api/v1/archive/archives/<docId>/content" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_B" \
    -H "X-Dev-User-Id: $DEV_USER_ID"

# In a non-Development environment the route is disabled and always 404s.
```

For the Vite frontend, no extra setup is needed. The dev server fetches
`/api/v1/local-dev/info` on first load; if `downloadStreamEnabled` is true
the "تنزيل المستند" button routes through `/content` automatically. In
production / staging, the same button opens the signed URL — production
behavior is unchanged.

---

## Phase 5 security hardening scenarios (QA-16..QA-21)

Phase 5 adds four defense layers: binary-signature validation, rate limiting,
audit logging, and CORS hardening. The existing endpoints keep their response
shapes; the new rejections are returned as `Rejected` results in the existing
envelope (upload) or HTTP error codes (rate limit, CORS).

### 21b. Dev-only info endpoint (local-dev run path)

The API exposes a tiny informational endpoint that the Vite frontend uses on
first load to decide whether to use the dev content route for downloads. It
returns 404 in non-Development environments so it is not probe-able in
production.

```bash
curl -sS http://localhost:8080/api/v1/local-dev/info
```

Expected in Development:

```json
{
  "environment": "Development",
  "downloadStreamEnabled": true,
  "authDevBypassEnabled": true
}
```

In non-Development (e.g. Production, Staging), the endpoint returns HTTP 404
and a JSON body `{ "code": "NOT_FOUND" }`.

### 22. Magic-bytes rejection (QA-16)

A file with the right extension and MIME but the wrong binary signature must
be rejected with `Rejected/MAGIC_BYTES_MISMATCH`.

```bash
# A "PDF" that is actually a DOS/MZ header.
printf 'MZ\x90\x00\x03\x00\x00\x00\x04\x00' > /tmp/asa/fake.pdf
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/fake.pdf;type=application/pdf"
```

Expected: HTTP 200 with body

```json
{
  "originalName": "fake.pdf",
  "status": "Rejected",
  "reasonCode": "MAGIC_BYTES_MISMATCH",
  "message": "توقيع الملف لا يطابق نوع PDF المعلن",
  "documentId": null,
  "blobUri": null
}
```

The n8n call is never made. No blob is uploaded. No DB row is written.

### 23. Magic-bytes acceptance (QA-17)

A real PDF (`%PDF-` header) is accepted.

```bash
printf '%%PDF-1.4\n%% hello\n%%EOF\n' > /tmp/asa/real.pdf
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 200 with `status: "Success"` (or `Failed` if n8n/Blob are
down, but **never** `Rejected` — the magic-bytes check passed).

### 24. Rate limit (QA-18)

The rate-limit middleware is per-tenant (keyed on the authenticated
`school_id` claim). A request without a school id falls back to per-IP.

```bash
# Restart the API with a low upload cap
export RateLimit__UploadPerMinute=2
# restart
for i in 1 2 3; do
  curl -sS -o /dev/null -w "req $i: HTTP %{http_code}\n" \
    -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" \
    -F "file=@/tmp/asa/real.pdf;type=application/pdf"
done
```

Expected: the first two requests return `HTTP 200`. The third returns
`HTTP 429 TooManyRequests` with body:

```json
{ "code": "RATE_LIMITED", "scope": "Upload", "retryAfterSeconds": <n> }
```

The `Retry-After` HTTP header is also set.

The same pattern applies to the read path:

```bash
export RateLimit__ReadPerMinute=2
# restart
for i in 1 2 3; do
  curl -sS -o /dev/null -w "req $i: HTTP %{http_code}\n" \
    "$BASE_URL/api/v1/archive/archives" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID"
done
```

Expected: the first two return `HTTP 200`. The third returns `HTTP 429` with
`scope: "Read"`. The `/health` endpoint is exempt from the rate limit.

### 25. CORS hardening (QA-19)

By default `Cors:AllowedOrigins` is empty, which means the CORS middleware is
**not** registered. A preflight from a non-allowlisted origin gets no
`Access-Control-Allow-Origin` header back.

```bash
curl -sS -i -X OPTIONS $BASE_URL/api/v1/archive/archives \
    -H "Origin: http://evil.example.com" \
    -H "Access-Control-Request-Method: GET"
```

Expected: no `Access-Control-Allow-Origin` in the response.

To allow a specific origin, restart the API with:

```bash
export Cors__AllowedOrigins__0=http://allowed.example.com
# restart
curl -sS -i -X OPTIONS $BASE_URL/api/v1/archive/archives \
    -H "Origin: http://allowed.example.com" \
    -H "Access-Control-Request-Method: GET"
```

Expected: `Access-Control-Allow-Origin: http://allowed.example.com` in the
response. A wildcard `*` in `Cors:AllowedOrigins` is rejected at startup
with `InvalidOperationException`.

### 26. Cross-tenant access is audited (QA-20)

A request for another school's `documentId` returns `404` and writes an
`AuditOutcome.ForbiddenTenantAccess` audit record.

```bash
# 1. Upload as DEV_SCHOOL_A, capture the docId from the response.
# 2. Switch headers to DEV_SCHOOL_B and request the same docId.
curl -sS -i "$BASE_URL/api/v1/archive/archives/<docId>" \
    -H "X-Dev-School-Id: 33333333-3333-3333-3333-333333333333" \
    -H "X-Dev-User-Id:  $DEV_USER_ID"
```

Expected: HTTP 404 with body `{ "code": "ARCHIVE_NOT_FOUND" }`. The response
body must **not** contain the row's `originalName`, `documentId`, or
`blobObjectName`. In the application log there must be an
`ArabicSchoolArchive.Api.Services.AuditLog` entry of the form:

```
[ArabicSchoolArchive.Api.Services.AuditLog] action=BrowseGetById outcome=ForbiddenTenantAccess reasonCode=ARCHIVE_NOT_FOUND schoolId=<attacker> userId=<...> documentId=<docId> method=GET path=/api/v1/archive/archives/<docId> status=404 ...
```

The original document's name and blob URI are **not** present in the log.

### 27. Secret scrubbing in logs (QA-21)

The `LogScrubber` helper strips SAS query strings, `Authorization` headers,
`AccountKey=…` segments in connection strings, and JWT-shaped tokens. The
audit log passes every field through it.

```bash
# Configure a real-looking secret and trigger a request.
export Auth__SigningKey=THIS_IS_A_SECRET_VALUE
export Blob__ConnectionString='AccountName=devstoreaccount1;AccountKey=REAL_KEY_DO_NOT_LOG;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
# restart
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id:  $DEV_USER_ID" \
    -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Then check the log:

```bash
grep -R "THIS_IS_A_SECRET_VALUE" /path/to/api.log   # expect zero matches
grep -R "REAL_KEY_DO_NOT_LOG"   /path/to/api.log   # expect zero matches
```

Trigger a download and inspect the log for the `signedUrl` audit entry:

```bash
curl -sS "$BASE_URL/api/v1/archive/archives/<docId>/download" \
    -H "X-Dev-School-Id: $DEV_SCHOOL_ID" \
    -H "X-Dev-User-Id: $DEV_USER_ID" > /dev/null
grep -E "signedUrl|sig=" /path/to/api.log
```

The log line exists (the audit record is written) but every `sv=`, `sr=`,
`sp=`, `se=`, and `sig=…` value is replaced with `***`.

---

## Phase 6 subscription enforcement scenarios (QA-22..QA-32)

Phase 6 adds a `SubscriptionGuardMiddleware` that runs after authentication
and before the controllers. The middleware reads the `school_id` claim from
the authenticated principal, looks the tenant up in the
`Subscriptions:Schools[]` config table, and blocks `Expired` (HTTP 402) or
`Suspended` (HTTP 403) tenants. `Active` and `GracePeriod` tenants are
allowed. The `/health` endpoint is exempt.

The well-known dev school ids mapped in `appsettings.Development.json`:

| School id | State | Reject code | Reject status |
|:---|:---|:---|:---|
| `11111111-1111-1111-1111-111111111111` | `Active` | — | 200 |
| `22222222-2222-2222-2222-222222222222` | `GracePeriod` | — | 200 |
| `33333333-3333-3333-3333-333333333333` | `Expired` | `SUBSCRIPTION_EXPIRED` | 402 |
| `44444444-4444-4444-4444-444444444444` | `Suspended` | `SUBSCRIPTION_SUSPENDED` | 403 |

```bash
export DEV_SCHOOL_ACTIVE=11111111-1111-1111-1111-111111111111
export DEV_SCHOOL_GRACE=22222222-2222-2222-2222-222222222222
export DEV_SCHOOL_EXPIRED=33333333-3333-3333-3333-333333333333
export DEV_SCHOOL_SUSPENDED=44444444-4444-4444-4444-444444444444
```

### 28. Active tenant can upload (QA-22)

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_ACTIVE" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 200 with `status: "Success"` (or `Failed` if n8n/Blob are
down, but the body must **not** contain `SUBSCRIPTION_*`).

### 29. GracePeriod tenant can upload (QA-23)

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_GRACE" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 200, no `SUBSCRIPTION_*` in the body.

### 30. Expired tenant upload returns 402 (QA-24)

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_EXPIRED" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 402 with body:

```json
{ "code": "SUBSCRIPTION_EXPIRED", "state": "Expired", "schoolId": "33333333-3333-3333-3333-333333333333" }
```

Response header `X-Subscription-State: Expired` is set. No blob is uploaded;
no DB row is written.

### 31. Suspended tenant upload returns 403 (QA-25)

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_SUSPENDED" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 403 with body:

```json
{ "code": "SUBSCRIPTION_SUSPENDED", "state": "Suspended", "schoolId": "44444444-4444-4444-4444-444444444444" }
```

Response header `X-Subscription-State: Suspended` is set.

### 32. Expired tenant browse / search returns 402 (QA-27)

```bash
curl -sS -i $BASE_URL/api/v1/archive/archives \
  -H "X-Dev-School-Id: $DEV_SCHOOL_EXPIRED" \
  -H "X-Dev-User-Id:  $DEV_USER_ID"
```

Expected: HTTP 402 with body `{ "code": "SUBSCRIPTION_EXPIRED", ... }`.

### 33. Suspended tenant download returns 403 (QA-28)

Upload a file as the `Active` school and capture the `documentId`:

```bash
DOC_ID=$(curl -sS -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_ACTIVE" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf" | jq -r .documentId)
```

Then request the download URL as the `Suspended` school:

```bash
curl -sS -i $BASE_URL/api/v1/archive/archives/$DOC_ID/download \
  -H "X-Dev-School-Id: $DEV_SCHOOL_SUSPENDED" \
  -H "X-Dev-User-Id:  $DEV_USER_ID"
```

Expected: HTTP 403 with body `{ "code": "SUBSCRIPTION_SUSPENDED", ... }`.
The response body must **not** contain a `signedUrl`.

### 34. Middleware runs after auth — unauthenticated is 401 (QA-29)

```bash
curl -sS -i -X POST $BASE_URL/api/v1/archive/upload \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf"
```

Expected: HTTP 401 with `WWW-Authenticate: Bearer`. The response must
**not** be `402` or `403`. The subscription check runs **after**
authentication, so an unauthenticated request is rejected by the
JWT / dev-bypass scheme first.

### 35. Tenant state is resolved by `school_id`, not `user_id` (QA-30)

```bash
for user in 22222222-2222-2222-2222-222222222222 55555555-5555-5555-5555-555555555555; do
  curl -sS -i $BASE_URL/api/v1/archive/archives \
    -H "X-Dev-School-Id: $DEV_SCHOOL_SUSPENDED" \
    -H "X-Dev-User-Id:  $user"
done
```

Expected: both responses are HTTP 403 with `SUBSCRIPTION_SUSPENDED`. The
state is keyed on the `school_id`, not the user.

### 36. Subscription guard skips `/health` (QA-31)

```bash
curl -sS -i $BASE_URL/health
```

Expected: HTTP 200. The middleware skips `/health` regardless of
subscription state.

### 37. Audit record for subscription block (QA-32)

Trigger a blocked request as the `Expired` dev school:

```bash
curl -sS -X POST $BASE_URL/api/v1/archive/upload \
  -H "X-Dev-School-Id: $DEV_SCHOOL_EXPIRED" \
  -H "X-Dev-User-Id:  $DEV_USER_ID" \
  -F "file=@/tmp/asa/real.pdf;type=application/pdf" > /dev/null
```

Inspect the log:

```bash
grep "SubscriptionGuard" /path/to/api.log
grep "SUBSCRIPTION_EXPIRED" /path/to/api.log
```

Expected: one entry of category `ArabicSchoolArchive.Api.Services.AuditLog`
with `action=Upload outcome=ForbiddenTenantAccess
reasonCode=SUBSCRIPTION_EXPIRED schoolId=33333333-... status=402`. The
`originalName` and `signedUrl` fields must not be present (the request
was blocked before any of that work was done).
