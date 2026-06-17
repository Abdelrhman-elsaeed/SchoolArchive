# TESTING.md - Testing Strategy

This document details the testing strategy, test suites, and validation steps for the **الأرشيف المدرسي العربي** (Arabic School Archive) project. Phase 2, 2.5, 3, 4, 5, and 6 have implemented the first slices of automated tests under `src/ArabicSchoolArchive.Tests/`. Phase 7 adds a Vite + React + TypeScript frontend shell under `src/ArabicSchoolArchive.Web/` with its own manual QA scenarios. The remaining test categories are described here for forward planning and remain pending per the ROADMAP.

**Final Phase 6 test count: 110/110 xUnit tests green** (verified 2026-06-17 with `dotnet test` against the test project `src/ArabicSchoolArchive.Tests/`). The 83 pre-Phase-6 tests + 27 new Phase 6 tests (13 config-store + 14 middleware) all pass. No prior test was weakened or skipped.

**Phase 7 test counts:**
- Backend xUnit: **110/110** unchanged (no backend file modified in Phase 7).
- Frontend `node:test`: **7/7** unit tests green (`src/ArabicSchoolArchive.Web/tests/apiClient.test.ts`).
- Manual QA: see `MANUAL_QA.md` §QA-33..§QA-40 for the eight Phase 7 UI scenarios.

---

## 1. Test Architecture Overview

We will implement a testing hierarchy utilizing standard .NET testing frameworks (e.g., xUnit, Moq) and React testing libraries (e.g., Jest, React Testing Library) when the UI is added in Phase 3+.

```
[Unit Tests]          --> Validate individual business functions (e.g. extension filters, path generators, dev-bypass scheme)
[Integration Tests]   --> Test DB interactions, mock n8n webhook HTTP calls, mock Azure Blob Client
[System / Flow Tests] --> Verify sequential multi-file loops, tenancy boundary locks, and subscription gates
```

The Phase 2.5 slice adds a new unit-test surface for the `DevBypassAuthHandler` so the dev-only auth path is regression-protected.

Phase 3 adds two more suites: `UploadOrchestratorBatchTests` (orchestrator-level multi-file + partial-success tests) and `ArchiveUploadControllerTests` (controller-binding + endpoint-shape tests using `WebApplicationFactory<Program>`).

---

## 2. Phase 2 + 2.5 + 3 Implemented Tests

`dotnet test` in `src/ArabicSchoolArchive.Tests/` runs the following suites (110 tests, all green as of Phase 6 close). The 83 pre-Phase-6 tests + 27 new Phase 6 tests all pass.

### 2.1 `FileValidatorTests` (`Services/FileValidatorTests.cs`) — 9 tests
- Valid PDF passes.
- Empty filename rejected with `FILENAME_INVALID`.
- Filename with NUL byte rejected with `FILENAME_INVALID`.
- `.exe` rejected with `EXTENSION_NOT_ALLOWED`.
- Size above 20 MB rejected with `SIZE_EXCEEDED`.
- Zero-byte file rejected with `SIZE_EXCEEDED`.
- Disallowed MIME (e.g. `application/x-msdownload`) rejected with `MIME_MISMATCH`.
- `.docx` with correct MIME passes.
- `.png` image passes.

### 2.2 `BlobStorageServiceSafeNameTests` (`Services/BlobStorageServiceSafeNameTests.cs`) — 7 tests
- Arabic filename with spaces: spaces replaced with `_`, Arabic characters preserved.
- Special characters (e.g. `<>:"/\|?`) replaced with `_`.
- Multiple underscores collapsed.
- Leading dots stripped.
- Empty input falls back to `file`.
- Long filename truncated to ≤ 100 characters.
- `BuildObjectName` produces a path starting with `schools/{schoolId}/archive/{yyyy}/{MM}/{documentId}_`.

### 2.3 `UploadOrchestratorTests` (`Orchestrator/UploadOrchestratorTests.cs`) — 7 tests
- **Complete success path** — n8n OK, Blob OK, DB OK. Asserts: response `Success`, row exists in `Archives`, `category` and `originalName` echoed, `blobUri` non-null.
- **Validation failure** — `.exe` rejected. Asserts: response `Rejected`, `documentId` is null, n8n never called, Blob never called, no DB row.
- **n8n failure** — n8n returns `N8N_TIMEOUT`. Asserts: response `Failed` with `N8N_TIMEOUT`, Blob never called, no DB row.
- **Blob failure** — n8n OK, Blob returns failure. Asserts: response `Failed` with `BLOB_FAILED`, no DB row.
- **DB failure after Blob success** — n8n OK, Blob OK, repository throws. Asserts: response `Failed` with `DB_FAILED`.
- **Original name preserved** — Arabic filename round-trips into `originalName` field untouched.
- **Blob URI has tenant prefix** — `blobUri` starts with `schools/{authenticatedSchoolId}/`.

### 2.4 `DevBypassAuthHandlerTests` (`Services/DevBypassAuthHandlerTests.cs`) — 6 tests (Phase 2.5)
- No headers → handler returns no result (decline to authenticate).
- Development + bypass disabled → handler returns no result.
- Production + bypass enabled → handler returns no result (proves the env-name guard).
- Development + valid headers → handler returns a successful ticket with `school_id` and `sub` claims populated.
- Development + only `X-Dev-School-Id` (no user id) → handler succeeds with `sub = Guid.Empty`.
- Development + non-GUID `X-Dev-School-Id` → handler returns a failure result with a descriptive message.

### 2.5 `UploadOrchestratorBatchTests` (`Orchestrator/UploadOrchestratorBatchTests.cs`) — 7 tests (Phase 3)
- **All files success** — three valid files in a batch. Asserts: `totalFiles=3`, `successfulFiles=3`, `failedFiles=0`, all per-file results are `Success`, three DB rows persisted.
- **Mixed outcomes (success + Rejected + Failed)** — `good1.pdf`, `bad.exe` (validation), `good2.pdf`, `bad2.pdf` (mocked n8n timeout). Asserts: `successfulFiles=2`, `failedFiles=2`, `Results[0..3]` preserve submission order, the `Rejected` result has `EXTENSION_NOT_ALLOWED`, the `Failed` result has `N8N_TIMEOUT`, and exactly two DB rows exist (the validated-success files).
- **Submission order preserved** — three valid files. Asserts `Results[i].OriginalName == inputFiles[i].name` in order.
- **Empty files collection** — `UploadBatchAsync([], …)`. Asserts: `totalFiles=0`, `successfulFiles=0`, `failedFiles=0`, `Results` empty, no DB writes attempted.
- **Earlier success preserved when later fails** — first file passes n8n+blob+DB; second file fails n8n. Asserts: `Results[0].Status = Success` with `documentId` populated, `Results[1].Status = Failed` with `N8N_HTTP_ERROR`, DB has exactly the first file's row.
- **Per-file result shape** — single success file. Asserts every required field is present: `originalName`, `status`, `reasonCode` (null for success), `message` (non-empty Arabic), `documentId`, `category`, `sizeBytes`, `mimeType`, `blobUri`.
- **Unhandled exception recorded as `INTERNAL_ERROR` and continues** — mocked `IN8nClient.ClassifyAsync` throws on every call. Asserts: both files yield `Failed/INTERNAL_ERROR`, the loop did not abort on the first throw.

### 2.6 `ArchiveUploadControllerTests` (`Controller/ArchiveUploadControllerTests.cs`) — 5 tests (Phase 3)
- **Single-file endpoint backward compat** — posts a single `file` form field. Asserts HTTP 200, response contains `originalName` and `status`, and the body does **not** contain `results` or `totalFiles` (proves the single-file shape is preserved).
- **Multi-file endpoint returns envelope** — posts two files in the `files` form field. Asserts HTTP 200, `totalFiles=2`, `results` array present, both `originalName` values present.
- **Empty files returns 400 `EMPTY_BATCH`** — multipart body with no file parts. Asserts HTTP 400 and `code=EMPTY_BATCH`.
- **No auth headers returns 401** — a request with no `X-Dev-School-Id`. Asserts HTTP 401 (proves the controller still requires authentication in the multi-file path).
- **Batch size exceeded returns 400 `BODY_TOO_LARGE`** — overrides `Upload:MaxBatchSizeBytes` to `1 MiB` via `WebApplicationFactory`, posts two ~700 KiB files. Asserts HTTP 400 and `code=BODY_TOO_LARGE` (proves the controller-level batch cap is honored even when each individual file is under `MaxFileSizeBytes`).

### 2.7 `ArchiveReadRepositoryTests` (`Repository/ArchiveReadRepositoryTests.cs`) — 8 tests (Phase 4)
- **List filters by `schoolId`** — seeds archives for two schools. Asserts: only the authenticated school's records are returned, ordered by `UploadedAtUtc` desc.
- **Search by name and category** — seeds mixed rows. Asserts: `originalNameContains` and `category` compose, and the tenant filter is still applied.
- **Get by document id (same school)** — asserts the row is returned with all metadata fields populated.
- **Get by document id (different school)** — asserts the row is **not** returned (returns null) when the caller's `schoolId` differs from the row's owner. This is the repository-level tenant-leak guard.
- **Pagination round-trip** — seeds 25 rows, requests pages 1/2/3 with `pageSize=10`. Asserts: `totalCount=25` on every page, page 1 has 10, page 2 has 10, page 3 has 5, and pages do not overlap.
- **Empty result** — requests archives for a fresh school with no rows. Asserts: `items=[]`, `totalCount=0`.
- **Date-range filter** — seeds 4 rows, requests `UploadedFrom=2026-06-04`, `UploadedTo=2026-06-15`. Asserts: only the two in-range rows are returned.
- **Processing year/month filter** — asserts the `processing_year` + `processing_month` filter works in combination with the tenant filter.

### 2.8 `ArchiveBrowseControllerTests` (`Controller/ArchiveBrowseControllerTests.cs`) — 9 tests (Phase 4)
- **List returns only current school records** — seeds rows for two schools, calls `GET /archives` as school A. Asserts: 200, school A's `originalName` values appear, school B's do not.
- **Search filters by name and `schoolId`** — calls `GET /archives?originalNameContains=...` as school A. Asserts: 200, school A's matching rows appear, school B's do not.
- **Get by id (same school)** — asserts 200 with the row's `originalName`.
- **Get by id (other school)** — asserts **404** with `code=ARCHIVE_NOT_FOUND`. The response body is checked to **not** contain the row's `originalName` or `documentId` (no existence leak).
- **Download (same school)** — asserts 200, the response contains `documentId`, `signedUrl`, `expiresAtUtc`, `ttlMinutes`. The `signedUrl` is asserted to contain the SAS query parameters (`sv=`, `sr=b`, `sp=r`, `se=`) **and** the authenticated `schoolId` in the object name.
- **Download (other school)** — asserts **404** with `code=ARCHIVE_NOT_FOUND`. The response body is checked to **not** contain the row's `originalName`, `documentId`, or `signedUrl` (no existence leak, no signed URL leak).
- **Pagination round-trips `page` and `pageSize`** — seeds 12 rows, calls `GET /archives?page=1..3&pageSize=5`. Asserts: `totalCount=12`, `totalPages=3`, `page` round-trips per request.
- **Empty result returns clean response** — asserts 200, `totalCount=0`, `totalPages=0`, `items=[]`.
- **No auth headers returns 401** — asserts the browse endpoint enforces authentication, like the upload endpoint.

These tests use:
- `InMemoryDatabase` for the DB layer (per-test isolated database name — see `LESSONS_LEARNED.md` L-07).
- `Moq` for `IN8nClient` and `IBlobStorageService`.
- A test-only `ThrowingDbContext` for the DB-failure test.
- A hand-rolled `IHostEnvironment` and `IServiceProvider` for the dev-bypass handler tests. The handler is invoked through `AuthenticationHandler<T>.InitializeAsync` + `AuthenticateAsync` directly, so the test does not need to spin up `WebApplicationFactory<Program>`.
- `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory<Program>`) for the controller-level tests. The factory overrides `Upload:MaxBatchSizeBytes` per test through `IWebHostBuilder.ConfigureAppConfiguration`. The dev-bypass auth scheme is enabled (Development + `Auth:DevBypassEnabled=true`) so request identity is supplied via `X-Dev-School-Id` / `X-Dev-User-Id` headers.

The full test suite (Phase 2 + 2.5 + 3 + 4 + 5) is hermetic and does not require Azurite, n8n, or Azure SQL to be reachable. This is by design: a CI run should be a pure `dotnet test` with no external dependencies. The Phase 4 tests do not download real blobs — the download route is asserted only on the `signedUrl` shape, and the dev-only `content` route is not exercised by the xUnit suite. The Phase 5 rate-limit, audit, and CORS tests all run against an in-process `WebApplicationFactory<Program>` and do not need any external dependency.

### 2.9 `FileSignatureValidatorTests` (`Services/FileSignatureValidatorTests.cs`) — 10 tests (Phase 5)
- **PDF signature accepted** — `%PDF-1.4` header is accepted for `report.pdf` + `application/pdf`.
- **PNG signature accepted** — 8-byte PNG header is accepted for `photo.png` + `image/png`.
- **JPG signature accepted** — `FF D8 FF` is accepted for `photo.jpg` + `image/jpeg`.
- **DOCX ZIP signature accepted** — `50 4B 03 04 …` is accepted for `memo.docx` + the OOXML MIME.
- **XLSX ZIP signature accepted** — same ZIP signature is accepted for `grades.xlsx` + the OOXML MIME.
- **PDF extension with non-PDF bytes** — `MZ` header is rejected with `MAGIC_BYTES_MISMATCH`.
- **PNG extension with JPG bytes** — JPG signature on a `.png` file is rejected with `MAGIC_BYTES_MISMATCH`.
- **Zero-byte file rejected** — empty stream is rejected with `MAGIC_BYTES_UNREADABLE`.
- **DOCX extension with non-ZIP bytes** — PDF bytes on a `.docx` file are rejected with `MAGIC_BYTES_MISMATCH`.
- **Stream position reset** — after validation, the stream's `Position` is `0` so the n8n step can re-read it.

### 2.10 `FileValidatorTests` additions (Phase 5) — 2 tests
- **`Phase5_ZeroByteAndOversized_StillRejectedAsBefore`** — proves that the existing `FileValidator` still returns `SIZE_EXCEEDED` for oversized files and rejects zero-byte files after Phase 5 added the new magic-bytes check.
- **`Phase5_MimeMismatch_StillRejectedAsBefore`** — proves the existing `MIME_MISMATCH` rejection is still emitted, so the Phase 5 hardening did not regress the existing allowlist behavior.

### 2.11 `BlobStorageServiceSafeNameTests` additions (Phase 5) — 1 test
- **`Phase5_SasRefusesNonTenantPrefix`** — proves that `BlobSasGenerator.GenerateRead` throws `ArgumentException` for a `blobObjectName` that (a) belongs to a different school, (b) is a relative `../escaped.pdf` path, or (c) contains a `..` segment in the middle of a tenant-prefixed path. The path-traversal guard added in Phase 5 is end-to-end tested.

### 2.12 `RateLimitAndAuditTests` (`Middleware/RateLimitAndAuditTests.cs`) — 12 tests (Phase 5)
- **Upload rate limit returns 429 after cap** — 5 consecutive POST `/upload` against a low `UploadPerMinute=3` cap; the response after the 3rd is `429 TooManyRequests` and the `Retry-After` header is present.
- **Read rate limit returns 429 after cap** — 12 consecutive GET `/archives` against a low `ReadPerMinute=10` cap; the response after the 10th is `429` and the body contains `RATE_LIMITED`.
- **Audit log records upload action** — sends a valid PDF, asserts an `action=Upload` audit entry exists. The entry is the standard one written by the orchestrator (success or failure — the test is intentionally permissive on the outcome because the dev pipeline is not fully mocked).
- **Audit log records upload success** — uses a custom `WithMockedN8nFactory` that swaps `IN8nClient` and `IBlobStorageService` for in-memory fakes. Drives the full pipeline to `Success` and asserts an `action=Upload outcome=Success` audit entry.
- **Audit log records rejected upload** — sends a `.pdf` with non-PDF bytes; asserts an `action=Upload outcome=Rejected` audit entry with `MAGIC_BYTES_MISMATCH`.
- **Audit log records forbidden cross-tenant access** — seeds an archive for `owner`, calls `GET /archives/{id}` as `attacker`, asserts the `404` response and an `action=BrowseGetById outcome=ForbiddenTenantAccess` audit entry containing the attacker's `schoolId`.
- **CORS not configured for non-allowlisted origin** — sends a preflight `OPTIONS` from `http://evil.example.com`; the response does **not** contain `Access-Control-Allow-Origin`. (Default `Cors:AllowedOrigins` is empty.)
- **`LogScrubber_StripsSasQueryString`** — proves `sv=…&sig=…` query parameters are replaced with `***`.
- **`LogScrubber_StripsBearerToken`** — proves `Authorization: Bearer …` headers are replaced with `Bearer ***`.
- **`LogScrubber_StripsAccountKey`** — proves `AccountKey=…` segments in a connection string are replaced with `***`.
- **`LogScrubber_StripsJwtLikeToken`** — proves JWT-shaped tokens (`eyJ…`) are replaced with `***`.
- **`LogScrubber_StripsSasFromPath`** — proves SAS query strings in a URL path are scrubbed.

These tests use:
- `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory<Program>`) with a custom `RecordingLoggerProvider` that captures every `ILogger` entry into an in-memory list. The audit assertions run against the captured log.
- A custom `WithMockedN8nFactory` that overrides `IN8nClient` and `IBlobStorageService` with in-memory fakes. Used only by the "audit log records upload success" test.
- A custom `RecordingLoggerProvider` that the `WebApplicationFactory` installs via `IWebHostBuilder.ConfigureLogging`. The provider is reset at the start of each test to keep cases isolated.

---

## 3. Phase 2.5 Local Validation Notes

Phase 2.5 added live (non-hermetic) validation paths on top of the automated test suite. These are documented here so a developer can re-run them on a clean checkout.

### 3.1 `/health` smoke

```bash
curl -sS http://localhost:5132/health
# or, on Docker:
curl -sS http://localhost:8080/health
```

Expected: HTTP 200 with the Phase 2.5 marker in the body:
```json
{ "status": "ok", "service": "ArabicSchoolArchive.Api", "version": "phase-2.5" }
```

### 3.2 No-auth challenge

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
    -X POST http://localhost:5132/api/v1/archive/upload \
    -F "file=@/tmp/sample.pdf"
```

Expected: HTTP 401 with `WWW-Authenticate: Bearer`. This proves the JWT challenge scheme is wired even when the dev-bypass is enabled (the policy scheme forwards to JWT because no `Bearer` token is present, but the dev-bypass is not invoked because no `X-Dev-School-Id` is present either — the JWT handler then has no token to validate and the request is rejected as 401).

### 3.3 Dev-bypass happy path (Phase 2 smoke, executed 2026-06-16)

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `GET /health` | 200, JSON `status:ok` | ✓ |
| 2 | `POST /upload` no auth | 401 | ✓ |
| 3 | `POST /upload` `.err` file + dev headers | 200, `Rejected/EXTENSION_NOT_ALLOWED` | ✓ |
| 4 | `POST /upload` tiny PDF + dev headers, no n8n | 200, `Failed/N8N_HTTP_ERROR`, `documentId` set, `blobUri: null` | ✓ |

The third row maps to MANUAL_QA QA-05; the fourth row maps to QA-02.

### 3.4 End-to-end success requires n8n + Azurite

The success path (Phase 2 QA-01) requires both n8n and Azurite reachable from the API. The Docker path (`src/docker-compose.local.yml`) brings them up automatically; the native path requires the developer to run them on the host. The `REQUEST_COLLECTION.md` file documents the exact curl invocations and the Azurite / n8n setup steps.

### 3.5 What is NOT covered by live validation in Phase 2.5

- **QA-04 (DB failure after blob success)** — the in-memory provider cannot be coerced to throw through configuration. The xUnit suite covers this path. A fault-injection switch is deferred to Phase 3+.
- **QA-07 (cross-tenant read)** — no download endpoint exists yet.
- **QA-08 (multi-file partial success)** — see §3.6 below for the Phase 3 live-validation matrix.
- **Production auth path** — there is no identity provider in Phase 2.5; the only way to exercise the JWT scheme end-to-end is to mint a token with `Auth:SigningKey` set. This is described in `LOCAL_RUN.md` §4.2 ("Non-Dev Path") and is intentionally not part of the dev-bypass QA.

### 3.6 Phase 3 live-validation matrix

The xUnit suite (§2.5, §2.6) is the source of truth for multi-file semantics. A live re-verification against a real Azurite + n8n can be done with the multi-file curl examples in `REQUEST_COLLECTION.md` §6. The expected behaviors are:

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `POST /upload` with three valid `files` parts, dev headers | 200, `totalFiles=3`, `successfulFiles=3`, all `Success` | — |
| 2 | `POST /upload` with three `files` parts: one `.exe` + two valid | 200, `totalFiles=3`, `successfulFiles=2`, `failedFiles=1`, the `.exe` is `Rejected/EXTENSION_NOT_ALLOWED`, the two valid files are `Success` | — |
| 3 | `POST /upload` with n8n disabled, three valid `files` parts | 200, all three `Failed/N8N_HTTP_ERROR`, no blobs in Azurite, no DB rows | — |
| 4 | `POST /upload` with two `files` parts whose total size exceeds `Upload:MaxBatchSizeBytes` | 400 `BODY_TOO_LARGE`, no files processed | — |
| 5 | `POST /upload` with no file parts (any form-data body) | 400 `EMPTY_BATCH` | — |
| 6 | `POST /upload` with a single `file` part (backward compat) | 200, single-file shape (no `totalFiles`, no `results`) | — |

### 3.7 Phase 4 live-validation matrix

The xUnit suite (§2.7, §2.8) is the source of truth for browse/search/download semantics. A live re-verification against a running API + Azurite can be done with the curl examples in `REQUEST_COLLECTION.md` §16–§20. The expected behaviors are:

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `GET /archives` with dev headers, school A | 200, only school A's rows | — |
| 2 | `GET /archives?originalNameContains=...` with dev headers, school A | 200, only school A's matching rows | — |
| 3 | `GET /archives/{id}` as the same school | 200 with the row | — |
| 4 | `GET /archives/{id}` as a different school | 404 `ARCHIVE_NOT_FOUND`; no `originalName` / `documentId` in body | — |
| 5 | `GET /archives/{id}/download` as the same school | 200, `signedUrl` contains `sv=`, `sr=b`, `sp=r`, `se=`, and the school id | — |
| 6 | `GET /archives/{id}/download` as a different school | 404 `ARCHIVE_NOT_FOUND`; no `signedUrl` in body | — |
| 7 | `GET /archives?page=2&pageSize=5` | 200, `page=2`, `pageSize=5`, correct `totalCount` | — |
| 8 | `GET /archives` for a fresh school | 200, `items=[]`, `totalCount=0`, `totalPages=0` | — |
| 9 | `GET /archives` no auth | 401 | — |
| 10 | `GET /archives/{id}/content` with `LocalDev:DownloadStreamEnabled=true` and a real blob in Azurite | 200 with the file bytes; same auth + tenant check | — |
| 11 | `GET /archives/{id}/content` as a different school, even with `LocalDev:DownloadStreamEnabled=true` | 404 `ARCHIVE_NOT_FOUND` (tenant check runs first) | — |

### 3.8 Phase 5 live-validation matrix

The xUnit suite (§2.9–§2.12) is the source of truth for Phase 5 hardening. A live re-verification against a running API can be done with the curl examples in `REQUEST_COLLECTION.md` §22–§26. The expected behaviors are:

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `POST /upload` with a real `.pdf` (correct magic bytes) and dev headers | 200, `Success` (or `Failed` if n8n/Blob are down) | — |
| 2 | `POST /upload` with a `.pdf` whose bytes are not `%PDF-…` | 200, `Rejected/MAGIC_BYTES_MISMATCH` | — |
| 3 | `POST /upload` with a `.pdf` whose declared MIME is `application/x-msdownload` | 200, `Rejected/MIME_MISMATCH` (extension/MIME check fires before magic bytes) | — |
| 4 | `POST /upload` more than `UploadPerMinute` times in 60 s | 429 `RATE_LIMITED` with `Retry-After` header | — |
| 5 | `GET /archives` more than `ReadPerMinute` times in 60 s | 429 `RATE_LIMITED` | — |
| 6 | `GET /archives/{otherSchoolsDocId}` | 404 `ARCHIVE_NOT_FOUND` and an `action=BrowseGetById outcome=ForbiddenTenantAccess` audit entry | — |
| 7 | `OPTIONS /archives` with `Origin: http://evil.example.com` (no CORS allowlist) | No `Access-Control-Allow-Origin` header in the response | — |
| 8 | `OPTIONS /archives` with `Origin: http://allowed.example.com` and `Cors:AllowedOrigins: ["http://allowed.example.com"]` | `Access-Control-Allow-Origin: http://allowed.example.com` | — |
| 9 | `GET /archives/{id}/download` with `blobObjectName` manipulated to `../escape.pdf` (would only matter if a caller could supply a `blobObjectName`; the controller never lets the client do that, but the SAS generator refuses it anyway) | The endpoint never reaches the SAS generator for an external `blobObjectName`. Internal unit test `Phase5_SasRefusesNonTenantPrefix` covers the generator. | — |
| 10 | Inspect the application log after a real upload | The `ArabicSchoolArchive.Api.Services.AuditLog` category emits a structured record per upload action (success/rejected/failed). No raw SAS query strings or JWTs are present. | — |

### 2.13 `ConfigSubscriptionStoreTests` (`Subscriptions/ConfigSubscriptionStoreTests.cs`) — 13 tests (Phase 6)
- **`UnknownSchool_IsActive`** — a `school_id` that is not present in `Subscriptions:Schools[]` resolves to `Active`. Pins the safe-default behavior.
- **`ActiveEntry_IsActive`** — a config entry with `State=Active` and no expiration is returned as `Active`.
- **`ExpiredEntry_IsExpired`** — a config entry with `State=Expired` is returned as `Expired` regardless of dates.
- **`SuspendedEntry_IsSuspended`** — a config entry with `State=Suspended` is returned as `Suspended`.
- **`GraceEntry_IsGracePeriod`** — a config entry with `State=GracePeriod` is returned as `GracePeriod`.
- **`ActiveEntry_WithExpiredDate_PromotesToGracePeriod_WhenWithinGrace`** — a config entry with `State=Active` and a past `ExpiresAtUtc` is auto-promoted to `GracePeriod` when the current time is still before `GraceUntilUtc`.
- **`ActiveEntry_PastGrace_DemotesToExpired`** — the same entry, but with the current time past `GraceUntilUtc`, is demoted to `Expired`.
- **`EmptySchoolId_IsIgnored`** — an entry with `SchoolId=""` is ignored; the lookup falls back to `Active`.
- **`InvalidGuid_IsIgnored`** — an entry with `SchoolId="not-a-guid"` is ignored; the lookup falls back to `Active`.
- **`IsAllowed_TrueForActive`** / **`IsAllowed_TrueForGracePeriod`** / **`IsAllowed_FalseForExpired`** / **`IsAllowed_FalseForSuspended`** — the `SubscriptionStatus.IsAllowed()` predicate returns the right boolean for every state.

### 2.14 `SubscriptionGuardMiddlewareTests` (`Middleware/SubscriptionGuardMiddlewareTests.cs`) — 14 tests (Phase 6)
- **`ActiveTenant_CanUpload`** — POST `/upload` with the dev bypass as the `Active` school. Asserts HTTP 200 and no `SUBSCRIPTION_*` body markers.
- **`GracePeriodTenant_CanUpload`** — POST `/upload` with the dev bypass as the `GracePeriod` school. Asserts HTTP 200 and no `SUBSCRIPTION_*` body markers.
- **`ExpiredTenant_UploadReturns402`** — POST `/upload` as the `Expired` school. Asserts HTTP 402 and `SUBSCRIPTION_EXPIRED` in the body.
- **`SuspendedTenant_UploadReturns403`** — POST `/upload` as the `Suspended` school. Asserts HTTP 403 and `SUBSCRIPTION_SUSPENDED` in the body.
- **`ActiveTenant_CanBrowseSearch`** — GET `/archives?originalNameContains=anything` as the `Active` school. Asserts HTTP 200.
- **`ExpiredTenant_BrowseSearchReturns402`** — GET `/archives` as the `Expired` school. Asserts HTTP 402 and `SUBSCRIPTION_EXPIRED` in the body.
- **`SuspendedTenant_DownloadReturns403`** — seeds a document for the `Active` school, then GETs `/archives/{id}/download` as the `Suspended` school. Asserts HTTP 403 and `SUBSCRIPTION_SUSPENDED` in the body.
- **`Unauthenticated_Remains401_Not402Or403`** — POST `/upload` with no `X-Dev-School-Id` (no principal). Asserts HTTP 401 (proves the middleware runs **after** auth).
- **`Unauthenticated_GetById_Remains401`** — same, on the read path. Asserts HTTP 401.
- **`TenantStateResolvedBySchoolId_NotUserId`** — two different `X-Dev-User-Id` values for the same `Suspended` school. Both are rejected (proves the lookup is by `school_id`, not `user_id`).
- **`UnknownSchool_FallsBackToActive_AndCanBrowse`** — a `school_id` not in the config table. Asserts HTTP 200.
- **`HealthEndpoint_IsExempt`** — GET `/health` with no auth. Asserts HTTP 200 (the middleware skips `/health`).
- **`ExpiredTenant_GetById_Returns402`** — GET `/archives/{id}` as the `Expired` school. Asserts HTTP 402 and `SUBSCRIPTION_EXPIRED` in the body.
- **`SuspendedTenant_ListArchives_Returns403`** — GET `/archives` as the `Suspended` school. Asserts HTTP 403 and `SUBSCRIPTION_SUSPENDED` in the body.

These tests use:
- `Microsoft.AspNetCore.Mvc.Testing` (`WebApplicationFactory<Program>`) for the middleware-level tests. The factory installs a four-tenant `Subscriptions:Schools[]` table (one Active, one GracePeriod, one Expired, one Suspended) and disables the rate-limit so the per-tenant caps do not interfere with the assertion.
- A hand-rolled `FixedTimeProvider` for the config-store unit tests, so the grace-period promotion / demotion tests are deterministic regardless of the wall clock.
- The same `WebApplicationFactory<Program>` pattern as the Phase 5 tests. The `Subscriptions:Enabled=false` flag is **set on the prior test factories** (`RateLimitAndAuditTests`, `ArchiveUploadControllerTests`, `ArchiveBrowseControllerTests`) so the Phase 2–5 tests continue to pass without the guard running.

### 2.15 `apiClient.test.ts` (`src/ArabicSchoolArchive.Web/tests/apiClient.test.ts`) — 7 tests (Phase 7 frontend)

Phase 7 adds a Vite + React + TypeScript frontend under `src/ArabicSchoolArchive.Web/`. The frontend has its own Node-based test runner (`node --test --experimental-strip-types`) that does not require any new dev dependencies. The 7 tests cover the only piece of frontend logic that has cross-cutting impact: the `ApiClient` (the `fetch` wrapper every page uses).

- **`get() returns parsed JSON on 2xx`** — a mocked 200 with a JSON body round-trips through `client.get<T>("/api/v1/archive/archives")` and returns the parsed value.
- **`get() throws ApiError with Arabic message on 401`** — a mocked 401 with body `{ "code": "UNAUTH" }` produces an `ApiError` with `status=401`, `code="UNAUTH"`, and an Arabic message containing "الجلسة".
- **`get() surfaces SUBSCRIPTION_EXPIRED with 402 and Arabic message`** — a mocked 402 with body `{ "code": "SUBSCRIPTION_EXPIRED", "state": "Expired" }` produces `status=402`, `state="Expired"`, and an Arabic message containing "انتهت صلاحية".
- **`get() surfaces SUBSCRIPTION_SUSPENDED with 403 and Arabic message`** — a mocked 403 with body `{ "code": "SUBSCRIPTION_SUSPENDED", "state": "Suspended" }` produces `status=403`, `state="Suspended"`, and an Arabic message containing "تعليق" or "إعادة التفعيل".
- **`get() surfaces 429 with Arabic rate-limit message`** — a mocked 429 with body `{ "code": "RATE_LIMITED" }` produces `status=429` and an Arabic message containing "الحد المسموح".
- **`postForm() sends multipart with dev-bypass headers and Content-Type is not set manually`** — verifies that `client.postForm()` does **not** set a manual `Content-Type` (the browser sets the multipart boundary), includes the `X-Dev-School-Id` header, and sends a `FormData` body.
- **`query string builder omits empty values`** — `undefined` and empty-string query parameters are dropped from the URL (matches the Phase 4 backend behavior).

These tests use:
- `node:test` (built-in to Node 24, no new dev dependency).
- A mocked `fetch` implementation (a closure) so the tests are hermetic and do not require the backend.
- TypeScript via Node's `--experimental-strip-types` flag (Node 24 built-in).

### 3.10 Phase 7 manual-validation matrix

The xUnit suite (§2.1–§2.14) and the Node test suite (§2.15) are the source of truth for backend and frontend logic respectively. A live re-verification of the **UI** against a running API can be done with the manual steps in `MANUAL_QA.md` §QA-33..§QA-40. The expected behaviors are:

| # | Scenario | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | Open `http://localhost:5173/upload`, pick 2 valid PDFs and 1 `.exe` | 3 per-file results in order; 2 `Success` (or `Failed` if n8n/Blob are down), 1 `Rejected/EXTENSION_NOT_ALLOWED` | — |
| 2 | Open the Browse page, type a name fragment in the search box | List filtered to the matching rows; pagination reflects the filtered total | — |
| 3 | Open a document details page, click "تنزيل المستند" | A new tab opens with the signed URL; expires-at timestamp shown below the button | — |
| 4 | In the dev settings, click "منتهي الصلاحية" preset, then reload | Every API request returns 402; the placeholder page renders the `Expired` copy | — |
| 5 | In the dev settings, click "موقوف" preset, then reload | Every API request returns 403; the placeholder page renders the `Suspended` copy | — |
| 6 | Set `RateLimit:ReadPerMinute=2`, then refresh the browse page 3 times | 3rd request shows the `429` Arabic message and a retry hint | — |
| 7 | Open the page in a fresh tab, view the page source | `<html lang="ar" dir="rtl">` is set; navigation links are mirrored in RTL order | — |
| 8 | Resize the window below 720 px | Filters collapse to a single column; cards span the full width; nav links stay accessible | — |

### 3.9 Phase 6 live-validation matrix

The xUnit suite (§2.13–§2.14) is the source of truth for Phase 6 enforcement. A live re-verification against a running API can be done with the curl examples in `REQUEST_COLLECTION.md` §28–§30. The expected behaviors are:

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `POST /upload` with dev headers as the `Active` dev school | 200, `Success` (or `Failed` if n8n/Blob are down) | — |
| 2 | `POST /upload` with dev headers as the `GracePeriod` dev school | 200, `Success` (or `Failed` if n8n/Blob are down) | — |
| 3 | `POST /upload` with dev headers as the `Expired` dev school | 402, body `{"code":"SUBSCRIPTION_EXPIRED", ...}` | — |
| 4 | `POST /upload` with dev headers as the `Suspended` dev school | 403, body `{"code":"SUBSCRIPTION_SUSPENDED", ...}` | — |
| 5 | `GET /archives` as the `Expired` dev school | 402, body `{"code":"SUBSCRIPTION_EXPIRED", ...}` | — |
| 6 | `GET /archives/{id}/download` as the `Suspended` dev school (after seeding a row for the `Active` school) | 403, body `{"code":"SUBSCRIPTION_SUSPENDED", ...}` | — |
| 7 | `POST /upload` with no dev headers (no auth) | 401, `WWW-Authenticate: Bearer` (proves the guard runs after auth) | — |
| 8 | `GET /health` (no auth) | 200 (the guard skips `/health`) | — |
| 9 | Inspect the application log after a blocked request | The `ArabicSchoolArchive.Api.Services.AuditLog` category emits a `ForbiddenTenantAccess` record with `reasonCode=SUBSCRIPTION_EXPIRED` (or `SUBSCRIPTION_SUSPENDED`) and the `school_id` of the blocked tenant. | — |

---

## 4. Forward Test Specifications (Pending Implementation)

### Unit Tests
- **File Validation Engine**:
  - Test files with valid extensions (`.pdf`, `.docx`, `.xlsx`, `.png`) are accepted.
  - Test files with forbidden extensions (`.exe`, `.js`, `.php`, `.zip`) are rejected.
  - Test file sizes matching the limit (20MB) are accepted; files larger than 20MB are rejected.
- **Safe Filename Generator**:
  - Assert that generated filenames contain a GUID, timestamp, and sanitized original filename.
  - Assert that spaces, Arabic characters, and special characters in filenames are safely encoded/sanitized.

### Integration & Infrastructure Mocking
- **n8n Webhook Client**:
  - Mock HTTP responses from n8n (Success 200 with metadata payload vs. Failures like 500 Internal Error or 400 Bad Request).
- **Blob Storage Client**:
  - Mock Azure Blob Storage client responses to simulate successful upload vs. storage exceptions.

### Upload Flow Sequence Tests
These tests assert that the sequential upload steps follow the correct order and maintain integrity:
- **Test Case 1: Complete Success**
  - Inputs: Valid file data.
  - Mocks: n8n returns `200 OK`, Blob upload succeeds, DB write succeeds.
  - Assert: DB record exists, Blob was called, response is `success`.
- **Test Case 2: n8n Failure**
  - Inputs: Valid file data.
  - Mocks: n8n returns `500 Server Error`.
  - Assert: Blob upload client was **never called**; DB write was **never called**; response is `failed` with n8n reason.
- **Test Case 3: Blob Upload Failure**
  - Inputs: Valid file data.
  - Mocks: n8n returns `200 OK`, Blob upload fails with storage exception.
  - Assert: DB write was **never called**; response is `failed` with storage error reason.

### Multi-File Partial Success Tests
- Send a batch containing three files: File A (valid), File B (forbidden extension), File C (valid).
- Mocks: File A succeeds; File B fails local validation; File C hits an n8n timeout.
- Assert:
  - Backend iterates through each file independently.
  - File A's metadata is written to the DB.
  - File B is rejected without calling n8n or Blob.
  - File C is aborted after n8n failure.
  - Response array contains three entries mapping original filenames, precise status values, and errors.

### School Isolation Tests (Tenancy Security)
- **Test Case 1: Filter Enforcement**
  - Mock database context with two schools: `school_id = 1` and `school_id = 2`.
  - Execute a search request authenticated as `school_id = 1`.
  - Assert: Returned archive records contain only records where `school_id = 1`.
- **Test Case 2: Cross-Tenant Fetch Prevention**
  - Request file download for Document ID #99 (owned by `school_id = 2`) authenticated as `school_id = 1`.
  - Assert: API returns `403 Forbidden` or `404 Not Found` (never leaks the file path or SAS token).

### Subscription Lock Tests (Future Phase)
- **Test Case 1: Active Status**
  - Auth user school has an active subscription.
  - Assert: Upload and search operations execute successfully.
- **Test Case 2: Grace Period Exceeded**
  - Auth user school subscription expired 10 days ago (grace period is 7 days).
  - Assert: All upload and browse API requests are blocked at the middleware layer (returns `402 Payment Required`).
- **Note**: This section is **superseded by Phase 6** (`SubscriptionGuardMiddleware` + `ISubscriptionStore`). The Phase 6 tests cover Active, GracePeriod, Expired, Suspended, and the middleware-after-auth contract end-to-end. See §2.13 below.

### Security Regression Tests
- **MIME-Spoofing Detection**: Rename `malware.exe` to `report.png` and upload. Assert that binary MIME inspectors reject the file.
- **Path Traversal Prevention**: Upload a file named `../../etc/passwd`. Assert that path sanitize logic converts this to a safe GUID-based format.
