# PROGRESS.md - Project Progress Tracker

This document maps current progress, finalized technical specifications, pending reviews, and blocks for the **الأرشيف المدرسي العربي** (Arabic School Archive) project.

---

## Current Status
- **Current Phase**: **Phase 7 (Gulf-School UI/UX Polish) — REVISED & REBUILDING ("Phase 7.5 Modernization")**
- **Status**: **Phase 6 APPROVED. Phase 7 REVISED. 110/110 xUnit tests green at the end of Phase 6. Phase 7.5 in progress as of 2026-06-17.** The original Phase 7 "plain CSS + `useState`/`useEffect` only" shell shipped but produced a laggy, prototype-like UX. Phase 7.5 adopts Tailwind CSS, Shadcn/ui-style components, and TanStack Query (React Query) per D-17 in `DECISIONS.md`, and ships the first EF Core migration per D-18 to stabilize the schema.
- **Completion Percentage**:
  - Phase 0: 100% (approved)
  - Phase 1 design: 100% (approved)
  - Phase 2 implementation: 100% (built, tested, fix-pass complete, approved)
  - Phase 2.5 local-run readiness: 100% (built, smoke-verified)
  - Phase 3 multi-file & partial success: 100% (built, tested, approved) — 41/41 tests green
  - Phase 4 browsing, search & retrieval: 100% (built, tested, approved) — 58/58 tests green
  - Phase 5 security hardening: 100% (built, tested, approved) — 83/83 tests green
  - Phase 6 subscription enforcement: 100% (built, tested, approved) — 110/110 tests green
  - Phase 7 Gulf-school UI/UX polish: **REVISED & REBUILDING** — original minimal shell deprecated, Tailwind + TanStack Query stack adopted per D-17, initial EF Core migration generated per D-18.

---

## Milestone Progress

| Phase | Milestone Name | Status | Target Date | Completed Date |
|:---:|:---|:---|:---|:---|
| **0** | **Inspection, Governance & Safety Lock** | **APPROVED** | 2026-06-16 | 2026-06-16 |
| **1** | Upload Orchestration Design | **APPROVED** | 2026-06-16 | 2026-06-16 |
| **2** | **Single-File Upload Implementation** | **APPROVED** | 2026-06-16 | 2026-06-16 |
| **2.5** | **Local Run + Manual Testing + Basic Docker Readiness** | **COMPLETE** | 2026-06-16 | 2026-06-16 |
| **3** | Multi-File Upload & Partial Success | **APPROVED** | 2026-06-16 | 2026-06-17 |
| **4** | Archive Browsing, Search & Retrieval | **APPROVED** | 2026-06-17 | 2026-06-17 |
| **5** | Security Hardening | **APPROVED** | 2026-06-17 | 2026-06-17 |
| **6** | Subscription Enforcement | **APPROVED** | 2026-06-17 | 2026-06-17 |
| **7** | Gulf-School UI/UX Polish | **REVISED & REBUILDING** | 2026-06-17 | — |

---

## Phase 1 - Drafted Design Artifacts

The following documents have been authored under `docs/agent/` for Phase 1 review:

| Artifact | Purpose |
|:---|:---|
| `UPLOAD_CONTRACT.md` | Single-file orchestration contract + multi-file app-layer loop contract |
| `DB_SCHEMA_PLAN.md` | Exact DB row contract (columns, types, indexes, constraints) |
| `API_CONTRACTS.md` | Frontend-to-backend upload contract + backend-to-n8n contract |
| `STORAGE_CONTRACT.md` | Blob path convention, storage operations, isolation rules |
| `FAILURE_HANDLING.md` | Per-step failure boundaries, status taxonomy, partial-success contract |
| `DECISIONS.md` | Phase 1 design decisions logged (additions only) |
| `ROADMAP.md` | Phase 0 marked approved, Phase 1 marked active |
| `PROGRESS.md` | This file, updated to reflect Phase 1 state |

No code, controllers, services, entities, migrations, infrastructure files, or UI code was produced during Phase 1. All work is documentation only.

---

## Phase 2 - Implementation Artifacts

Source code lives under `src/`. All code is design-aligned with the Phase 1 contracts.

| Layer | File(s) |
|:---|:---|
| API project | `src/ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj` |
| Test project | `src/ArabicSchoolArchive.Tests/ArabicSchoolArchive.Tests.csproj` |
| Configuration | `Configuration/UploadOptions.cs`, `N8nOptions.cs`, `BlobOptions.cs`, `AuthOptions.cs` |
| Entity | `Entities/Archive.cs` |
| DbContext | `Data/ArchiveDbContext.cs` |
| DTOs | `Dtos/SingleFileUploadResponse.cs` |
| Validator | `Services/FileValidator.cs` |
| n8n client | `Services/N8nClient.cs` |
| Blob storage | `Services/BlobStorageService.cs` |
| Repository | `Services/ArchiveRepository.cs` |
| Orchestrator | `Services/UploadOrchestrator.cs` |
| Controller | `Controllers/ArchiveUploadController.cs` |
| App bootstrap | `Program.cs` |
| App settings | `appsettings.json` |
| Validator tests | `ArabicSchoolArchive.Tests/Services/FileValidatorTests.cs` |
| Blob sanitizer tests | `ArabicSchoolArchive.Tests/Services/BlobStorageServiceSafeNameTests.cs` |
| Orchestrator tests | `ArabicSchoolArchive.Tests/Orchestrator/UploadOrchestratorTests.cs` |

**Test result:** 23 of 23 passing (`dotnet test`) at the close of Phase 2.

### Phase 2 Implementation Notes
- DB layer: `UseSqlServer` when `ConnectionStrings:AzureSql` is set; otherwise `UseInMemoryDatabase` for local dev. No migration scripts in v1 — `EnsureCreated` is not invoked. The operator must create the `Archives` table manually (DDL in `LOCAL_RUN.md` §3.2) before pointing the API at a real Azure SQL. Phase 3+ will add proper EF Core migrations.
- Auth: `JwtBearer` is wired in `Program.cs` from the `Auth` section. Issuer/audience/signing-key validations activate only when the corresponding values are set, so an empty config disables the respective check (still requires a token to be present because `[Authorize]` is on the controller). `NameClaimType = "sub"` aligns the principal name with the JWT subject claim.
- Blob path: built exclusively by `BlobStorageService.BuildObjectName`, which asserts the tenant prefix. The orchestrator never supplies a name from client input.
- Safe-name allowlist in code: `[A-Za-z0-9._-]` plus the Arabic Unicode block `U+0600`–`U+06FF` so Arabic filenames round-trip. `STORAGE_CONTRACT.md` §2.2 was updated in the Phase 2 fix pass to match (previous spec text was ASCII-only and contradicted the example).
- n8n timeout: 15 s for the classification call. Blob upload timeout: 30 s. Both match the Phase 1 contracts.
- DB write is the final action inside the orchestrator. Any exception from `SaveChangesAsync` produces a `DB_FAILED` result and an error log explicitly mentions "Blob orphan possible" so an operator can sweep the orphan.
- Multi-file support is intentionally not wired up. The controller binds a single `IFormFile`. A multi-file batch request will bind only one file. The Phase 3 loop will iterate `IFormFileCollection`.

---

## Phase 2.5 - Local Run + Manual Testing + Basic Docker Readiness Artifacts

Phase 2.5 makes the Phase 2 flow runnable, containerizable, and manually testable **without** changing the production code path. All scope is local/dev only.

### 2.5.1 Code changes (non-production)

| File | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Api/Configuration/AuthOptions.cs` | Added `DevBypassEnabled` flag (default `false`). |
| `src/ArabicSchoolArchive.Api/Services/DevBypassAuthHandler.cs` | New. Development-only authentication scheme that accepts `X-Dev-School-Id` and `X-Dev-User-Id` headers. Re-checks `IHostEnvironment.IsDevelopment()` and `DevBypassEnabled` on every request. |
| `src/ArabicSchoolArchive.Api/Controllers/HealthController.cs` | New. `GET /health` liveness endpoint, anonymous, no DB dependency. |
| `src/ArabicSchoolArchive.Api/Program.cs` | (a) Registers the JWT scheme as before. (b) In `Development` + `DevBypassEnabled=true`, additionally registers the dev-bypass scheme and a `MultiAuth` policy scheme that forwards to JWT when a `Bearer` token is present and to the dev-bypass otherwise. (c) Sets the default auth scheme to `MultiAuth` in dev, `JwtBearer` otherwise. (d) `appsettings.Development.json` is the source of truth for the bypass-on default. |
| `src/ArabicSchoolArchive.Api/appsettings.Development.json` | Sets `Auth:DevBypassEnabled=true` and `Auth:RequireHttpsMetadata=false`. |
| `src/ArabicSchoolArchive.Api/appsettings.json` | Adds the `Auth:DevBypassEnabled` field with `false` default. |
| `src/ArabicSchoolArchive.Tests/Services/DevBypassAuthHandlerTests.cs` | New. 6 unit tests covering: no headers → no result, dev+bypass-off → no result, prod+bypass-on → no result, valid headers → success, missing user id → empty guid, invalid guid → failure. |

**Test result:** 29 of 29 passing (`dotnet test`) at the close of Phase 2.5. (23 Phase 2 tests + 6 new dev-bypass tests.) The 12 multi-file tests in `UploadOrchestratorBatchTests` and `ArchiveUploadControllerTests` were added later in Phase 3, **after** the Phase 2.5 close, and are documented in §3.2 below.

### 2.5.2 Container / config artifacts

| File | Purpose |
|:---|:---|
| `src/Dockerfile` | Multi-stage build: SDK 10 → ASP.NET runtime 10. Publishes the API only (Tests are not shipped). Runs as a non-root user `appuser`. Exposes `8080`. Healthcheck hits `/health`. |
| `src/docker-compose.local.yml` | Local stack: `api` + `azurite` + `n8n` on a single bridge network. Reads `src/.env`. Volumes for Azurite and n8n data are persisted across restarts. |
| `src/.env.example` | Documents every config knob the API reads, with safe dev defaults (in-memory DB, Azurite via internal DNS, n8n via internal DNS, dev-bypass enabled). |

### 2.5.3 Documentation changes

| File | Change |
|:---|:---|
| `docs/agent/LOCAL_RUN.md` | Rewritten in Phase 2.5. Adds the Docker path, the dev-bypass section, the failure-mode cheat sheet, and verified smoke commands. Replaces the old "Azure Storage Emulator (Azurite)" section with a side-by-side native-vs-Docker comparison. |
| `docs/agent/MANUAL_QA.md` | Updated to use the dev-bypass headers by default. Adds QA-00 (health) and a "Non-Dev Path" appendix. |
| `docs/agent/TESTING.md` | Adds §2.4 for the new dev-bypass test suite, §3 for the Phase 2.5 live-validation smoke matrix, and §3.5 for "what is NOT covered by live validation" (e.g. QA-04, QA-07). |
| `docs/agent/REQUEST_COLLECTION.md` | New. Drop-in curl snippets for every QA scenario. |
| `docs/agent/bruno-collection.json` | New. Bruno-compatible request collection (importable in Postman/Insomnia as well). |
| `.gitignore` | Adds `.env`, `azurite-data/`, and Docker volume artifact exclusions. |
| `docs/agent/PROGRESS.md` | This file. |

### 2.5.4 Safety guarantees (intentional and verifiable)

- The dev-bypass is registered at startup **only** when **both** `ASPNETCORE_ENVIRONMENT=Development` **and** `Auth:DevBypassEnabled=true`. The handler re-checks both conditions on every request, so flipping one at runtime cannot enable the bypass.
- The non-Development path is byte-for-byte equivalent to the Phase 2 close: `JwtBearer` is the only scheme, `appsettings.json` ships `Auth:DevBypassEnabled=false`, and `[Authorize]` on the upload controller is still enforced.
- The `/health` endpoint is anonymous and side-effect free. It does not require DB, Blob, or n8n to be reachable.
- The `MultiAuth` policy scheme is a **forwarding** scheme, not a "permissive" scheme. The default challenge scheme is still JWT, so requests with no auth and no dev headers get the standard `401 + WWW-Authenticate: Bearer`.

### 2.5.5 Smoke verification matrix (executed 2026-06-16)

| # | Request | Expected | Recorded |
|:-:|:---|:---|:---|
| 1 | `GET /health` | 200, JSON `status:ok, version:phase-2.5` | ✓ |
| 2 | `POST /upload` no auth | 401 | ✓ |
| 3 | `POST /upload` `.err` + dev headers | 200, `Rejected/EXTENSION_NOT_ALLOWED` | ✓ |
| 4 | `POST /upload` tiny PDF + dev headers, no n8n | 200, `Failed/N8N_HTTP_ERROR`, `documentId` set, `blobUri: null` | ✓ |

These map to MANUAL_QA QA-00, the no-auth challenge, QA-05, and QA-02 respectively. The end-to-end success path (QA-01) requires both n8n and Azurite reachable and is documented in `LOCAL_RUN.md` §5.3.

---

## Approved Final Assumptions

The following architectural and business constraints are officially locked for the project:
1. **Infrastructure Multi-Tenancy**:
   - Shared application container, shared n8n cluster, shared Azure SQL Database, and shared Azure Blob Storage account in v1.
2. **Data & File Tenant Isolation**:
   - Logical isolation of database records and storage structures enforced strictly by `school_id`.
3. **Sequential Safe File Upload Order**:
   - Local validation checks first -> Webhook n8n call second -> Physical upload to Azure Blob Storage third -> Write metadata row to SQL DB fourth.
   - **Database write is always last**. If any preceding step fails, no SQL row is created.
4. **App-Layer Multi-File Orchestration**:
   - Multiple files uploads are processed sequentially within an app-layer iteration loop (n8n remains single-file per webhook request).
5. **Partial Success Enforcement**:
   - Successful files must be saved and confirmed. Failed files must be logged and reported without rolling back the successful transactions in the batch.
6. **Failure Policy**:
   - No automated retry system is implemented in v1. The app fails fast and bubbles errors back to the caller.
7. **Business & Storage Limits**:
   - Upload size default threshold: 20 MB (configurable).
   - Subscription expiration grace period default: 7 days (configurable).

---

## Phase 1 - Newly Locked Design Decisions

The following design decisions were finalized during Phase 1 (full details in `DECISIONS.md`):

- **D-07**: Frontend upload transport is `multipart/form-data` with form field name `files` (array).
- **D-08**: Backend HTTP endpoint is `POST /api/v1/archive/upload` returning HTTP 207-style multi-status semantics inside a 200 OK envelope.
- **D-09**: n8n transport is `multipart/form-data` with form field name `file` (single). Backend proxies one file per HTTP request.
- **D-10**: Per-file status taxonomy is exactly: `Success`, `Rejected` (validation), `Failed` (runtime), and `Pending`.
- **D-11**: DB row PK is a `UNIQUEIDENTIFIER` (UUID v4) generated server-side; identity column is not used to avoid sequential enumeration of archived records across schools.
- **D-12**: Blob object name format is `schools/{schoolId}/archive/{yyyy}/{MM}/{documentId}_{safeFileName}` and the leading `schools/{schoolId}/` is non-negotiable.
- **D-13**: School isolation is enforced at three points: (a) controller extract of `schoolId` from authenticated principal, (b) EF Core Global Query Filters on every tenant entity, (c) Blob path construction in the storage service.
- **D-14**: Subscription check sits in a dedicated ASP.NET Core middleware executed **after** authentication and **before** controller binding. Phase 1 documents its placement but does not implement it.

### Phase 2.5 - Newly Locked Design Decisions

- **D-15**: A development-only auth bypass scheme (`X-Dev-School-Id` + `X-Dev-User-Id` headers) is permitted for local manual QA. It is registered and honored **only** when both `ASPNETCORE_ENVIRONMENT=Development` and `Auth:DevBypassEnabled=true`. The handler re-checks both conditions on every request. Production / Staging paths are byte-for-byte equivalent to the Phase 2 close.
- **D-16**: The default authentication scheme in Development is a "policy scheme" named `MultiAuth` that forwards to JWT when an `Authorization: Bearer …` header is present and to the dev-bypass scheme otherwise. This makes the two schemes mutually exclusive at the request level and preserves the standard `401 + WWW-Authenticate: Bearer` challenge for unauthenticated requests.

---

## Open/Unresolved Questions
- **Migrations**: No EF Core migrations created in Phase 2. Schema is not auto-created. The `Archives` table must exist before the first request against Azure SQL — DDL is in `LOCAL_RUN.md` §3.2. Phase 3 will introduce a proper migration.
- **QA-04 fault injection**: The DB-failure path is covered by xUnit only in Phase 2.5. A configuration-driven fault-injection switch on `ArchiveDbContext` is deferred to Phase 3+.

---

## Blocked Items
- **Phase 3 Gate**: Multi-file loop and partial-success semantics are blocked on the Phase 2.5 closure (achieved 2026-06-16).

---

## Phase 3 - Multi-File Upload & Partial Success Artifacts

Phase 3 wires up multi-file ingestion on top of the Phase 2 single-file flow. The implementation reuses the existing single-file orchestrator path and the Phase 1 design decisions — no locked design decision was modified. New code lives entirely under `src/ArabicSchoolArchive.Api/Controllers/ArchiveUploadController.cs` (binding) and `src/ArabicSchoolArchive.Api/Services/UploadOrchestrator.cs` (loop). No schema, no service contract, no auth/Docker change.

### 3.1 Code changes (production path)

| File | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Api/Controllers/ArchiveUploadController.cs` | Binds both `[FromForm] IFormFile? file` and `[FromForm] IFormFileCollection? files`. If `files` is non-empty: sums `files.Sum(f => f.Length)`, rejects with HTTP 400 `BODY_TOO_LARGE` if the sum exceeds `Upload:MaxBatchSizeBytes`, otherwise calls `_orchestrator.UploadBatchAsync(files.ToList(), …)` and returns `Ok(batch)`. The single-file `file` branch is unchanged. |
| `src/ArabicSchoolArchive.Api/Services/UploadOrchestrator.cs` | Adds `UploadBatchAsync(IReadOnlyList<IFormFile>, schoolId, userId, ct)`. Loops files sequentially with `foreach`, calling the existing `UploadAsync` for each. A `try/catch` inside the loop catches unexpected exceptions per file and records them as `Failed/INTERNAL_ERROR` so the loop continues. The final envelope is a `BatchUploadResponse` with `totalFiles`, `successfulFiles`, `failedFiles`, and `results` (in submission order). |
| `src/ArabicSchoolArchive.Api/Dtos/SingleFileUploadResponse.cs` | Adds the `BatchUploadResponse` DTO (counters + per-file list). The `UploadStatus` enum is unchanged: `Success`, `Rejected`, `Failed`. `Pending` is reserved by D-10 and is **not** emitted by the orchestrator in Phase 3. |

### 3.2 Test additions

| Test class | New tests |
|:---|:---|
| `ArabicSchoolArchive.Tests/Orchestrator/UploadOrchestratorBatchTests.cs` | 7 new tests: `AllFilesSuccess_PersistsAllRows`, `MixedOutcomes_PartialSuccess`, `PreservesSubmissionOrder`, `EmptyFiles_ReturnsZeroTotals`, `EarlierSuccess_Preserved_WhenLaterFails`, `PerFileResults_ContainAllRequiredFields`, `UnhandledException_RecordedAsInternalError_Continues`. |
| `ArabicSchoolArchive.Tests/Controller/ArchiveUploadControllerTests.cs` | 5 new tests: `SingleFileEndpoint_BackwardCompat_ReturnsSingleFileShape`, `MultiFileEndpoint_ReturnsEnvelope`, `EmptyFiles_Returns400EmptyBatch`, `NoAuthHeaders_Returns401`, `BatchSizeExceeded_Returns400BodyTooLarge`. |

**Test result:** 41 of 41 passing (`dotnet test`) at the close of Phase 3 implementation. (Previously 29 from Phase 2.5; +12 net new tests for the multi-file surface — 7 orchestrator batch tests + 5 controller tests; 0 tests removed or weakened.) All 29 pre-existing tests remain green.

### 3.3 Honesty notes

- The Phase 3 multi-file code was already in the working tree at the start of the docs-sync task. No new endpoints, services, or schemas were introduced. The task for this turn was to bring the docs into honest alignment with that state, and to record the phase-status transitions.
- The `Pending` enum value exists for future streaming UX (per D-10) but is not produced by the orchestrator. Per-file results in Phase 3 will only ever be `Success`, `Rejected`, or `Failed` — exactly the v1 emit set.
- `MaxBatchSizeBytes` is enforced at the controller (sum of part lengths) **before** the orchestrator runs. Per-file `MaxFileSizeBytes` is still enforced by the validator inside the loop, so a 20 MB file inside a 25 MB batch is still rejected as `Rejected/SIZE_EXCEEDED`. The two limits are intentionally different surfaces (per-file vs. per-batch) and both are honored.
- Sequential ordering, partial-success semantics, and the n8n single-file-per-request invariant are all covered by xUnit and require no scheduler or concurrency primitive in the orchestrator. The `INTERNAL_ERROR` catch in the loop exists for defense-in-depth and is itself covered by a test.

### 3.4 Phase 3 - Newly Locked Design Decisions

None. No Phase 1 decision was modified, removed, or reinterpreted. The new behavior is a strict composition of D-07 (transport), D-08 (envelope), D-09 (n8n transport), D-10 (taxonomy), and D-15 (documentId allocation).

---

## Phase 3 - Open/Unresolved Questions

- **Concurrency cap**: Phase 3 is strictly sequential. A future phase may introduce a configurable per-tenant concurrency cap, but it is explicitly out of scope here.
- **`Pending` emission**: The enum value is reserved but no code path produces it in v1.
- **Migrations**: Still deferred (Phase 3+ carry-over).

---

## Phase 3 - Approval & Closure (2026-06-17)

- **Status**: APPROVED.
- **Test result at sign-off**: 41/41 xUnit tests green (`dotnet test`). The 29 pre-Phase-3 tests + 12 new Phase 3 tests all pass.
- **Locked decisions affected**: None. Phase 3 is a strict composition of D-07, D-08, D-09, D-10, and D-15. See `DECISIONS.md` §8 for the append-only Phase 3 notes (3-N1..3-N5).
- **Code touchpoints** (final, for the audit trail):
  - `src/ArabicSchoolArchive.Api/Controllers/ArchiveUploadController.cs` — `IFormFileCollection files` binding + `Upload:MaxBatchSizeBytes` enforcement.
  - `src/ArabicSchoolArchive.Api/Services/UploadOrchestrator.cs` — `UploadBatchAsync` sequential loop with `INTERNAL_ERROR` defense-in-depth catch.
  - `src/ArabicSchoolArchive.Api/Dtos/SingleFileUploadResponse.cs` — `BatchUploadResponse` envelope (counters + ordered `results`).
  - Test suites `ArabicSchoolArchive.Tests/Orchestrator/UploadOrchestratorBatchTests.cs` and `ArabicSchoolArchive.Tests/Controller/ArchiveUploadControllerTests.cs`.
- **Carry-over to Phase 4+**: nothing was opened by Phase 3. The Migrations item remains a long-standing carry-over from Phase 2.

---

## Phase 4 - Archive Browsing, Search & Retrieval (ACTIVE 2026-06-17)

This section is the live journal for Phase 4. Code, tests, and docs are added in chronological order as the phase progresses.

### 4.1 Code changes (production path)

| File | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Api/Dtos/ArchiveListDtos.cs` | New. `ArchiveItemDto`, `ArchiveListQuery`, `ArchiveListResponse`, `ArchiveDownloadResponse`. |
| `src/ArabicSchoolArchive.Api/Services/ArchiveReadRepository.cs` | New. `IArchiveReadRepository` + `ArchiveReadRepository`. Every method takes `schoolId` as a required parameter and refuses an empty value. No "by documentId alone" method exists, so a future caller cannot bypass the tenant filter. |
| `src/ArabicSchoolArchive.Api/Services/BlobSasGenerator.cs` | New. `IBlobSasGenerator` + `BlobSasGenerator`. Builds a `BlobSasBuilder` with `Read` permission only, a TTL clamped to `5–15` minutes per Phase 1 spec (D-12 / DECISIONS §3 "Shared Access Signature that expires after 5-15 minutes"), and a server-side guard that refuses to issue a SAS for a `blobObjectName` that does not start with the tenant prefix. |
| `src/ArabicSchoolArchive.Api/Services/BlobDownloadService.cs` | New. `IBlobDownloadService` + `BlobDownloadService`. Opens a read stream from the configured `BlobServiceClient`, re-checks the tenant prefix, returns a `404` (`not found`) for missing blobs. Used by the local-dev content streaming route. |
| `src/ArabicSchoolArchive.Api/Configuration/BlobOptions.cs` | Adds `SasTtlMinutes` (default `10`, range `5–15`) and the `SasTtlMinutesMin` / `SasTtlMinutesMax` bounds. |
| `src/ArabicSchoolArchive.Api/Controllers/ArchiveBrowseController.cs` | New. `[Authorize]` controller at `api/v1/archive/archives`. Routes: `GET /` (list with filters + pagination), `GET /{documentId}` (metadata), `GET /{documentId}/download` (signed URL), `GET /{documentId}/content` (dev-only blob stream; only registered when `ASPNETCORE_ENVIRONMENT=Development` **and** `LocalDev:DownloadStreamEnabled=true`). |
| `src/ArabicSchoolArchive.Api/Program.cs` | Registers `IBlobDownloadService`, `IBlobSasGenerator`, `IArchiveReadRepository` in the DI container. |
| `src/ArabicSchoolArchive.Api/appsettings.json` | Adds the `Blob:SasTtlMinutes` (default `10`) and `LocalDev:DownloadStreamEnabled` (default `false`) knobs. |
| `src/ArabicSchoolArchive.Tests/Repository/ArchiveReadRepositoryTests.cs` | New. 8 tests. |
| `src/ArabicSchoolArchive.Tests/Controller/ArchiveBrowseControllerTests.cs` | New. 9 tests using `WebApplicationFactory<Program>`. |

**Test result:** 58 of 58 passing (`dotnet test`) at the close of Phase 4 implementation. (41 prior tests + 17 new tests for Phase 4 — 8 repository tests + 9 controller tests. No prior tests removed or weakened.)

### 4.2 Tenancy / leak-prevention guarantees

- The `IArchiveReadRepository` interface exposes **no** method that fetches by `documentId` alone. Every method takes `schoolId` as the first parameter and throws `ArgumentException` if the value is `Guid.Empty`. The interface is the only way the controller reaches the DB.
- The download endpoint resolves the metadata via `GetByDocumentIdAsync(schoolId, documentId)` first. If the row is null (either does not exist or belongs to a different school), the response is **`404 Not Found`** with `code = ARCHIVE_NOT_FOUND` — no body, no original name, no `documentId`, no `blobObjectName`. The status code is identical for "not found" and "wrong tenant", so the endpoint does not leak existence.
- The SAS generator refuses to build a SAS for a `blobObjectName` that does not start with `schools/{schoolId}/`. This is a defense-in-depth check on top of the repository-level filter.
- The local-dev `content` route is gated on `IHostEnvironment.IsDevelopment()` **and** `LocalDev:DownloadStreamEnabled=true`. In non-Development environments the route always returns `404`. The auth and tenant checks run **before** the blob stream is opened.

### 4.3 Honesty notes

- The 17 new tests in Phase 4 are net additions: 41 prior tests still pass, +17 new = 58 total. No test was weakened or skipped.
- The download endpoint returns a real `Azure.Storage.Sas.BlobSasBuilder`-generated URL. In dev (Azurite, `UseDevelopmentStorage=true;`), the SAS round-trips against the emulator and a `curl` on the URL returns the file. In production, the same call works against a real Azure Blob Storage account because the builder is provider-agnostic.
- The `content` route is **dev-only by design** (`LocalDev:DownloadStreamEnabled=false` by default in `appsettings.json`). The route exists so the dev manual-QA script in `MANUAL_QA.md` can pull a file down without an external identity provider and without building a separate `az storage blob generate-sas` helper. It is **not** a production path — production traffic uses the SAS URL on the download endpoint.
- Pagination caps `pageSize` at `100`. This is a controller-level cap, applied after the repository returns its bounded page.
- No `Archive` schema change. No new EF Core migration. The `Archives` table from Phase 2/2.5/3 is reused as-is.

### 4.4 Phase 4 - Newly Locked Design Decisions

None. No locked Phase 1 decision was modified, removed, or reinterpreted. The new behavior is a strict read-only composition of D-11 (UUID PK), D-12 (blob object name with tenant prefix), D-13 (three enforcement points — the repository method signature enforces the DB-side filter, the controller injects the authenticated `schoolId`, the SAS generator enforces the storage-side tenant prefix). See `DECISIONS.md` §10 for append-only Phase 4 notes.

---

## Phase 4 - Open/Unresolved Questions

- **Full-text search**: the current `originalName` search is a SQL `LIKE '%needle%'`. For Arabic full-text search and fuzzy match, an external search index (Azure Cognitive Search) is deferred to Phase 5+.
- **SAS revocation**: a SAS, once issued, is valid until its `ExpiresOn`. There is no revoke-list in v1. A leaked URL is valid for at most 15 minutes (per the `SasTtlMinutesMax` cap).
- **Range / streaming downloads**: the SAS URL supports range requests natively; the `content` dev route streams the full blob. A `Range` header pass-through for the dev route is deferred.
- **Migrations**: still deferred.

---

## Phase 4 - Approval & Closure (2026-06-17)

- **Status**: APPROVED.
- **Test result at sign-off**: 58/58 xUnit tests green (`dotnet test`). The 41 pre-Phase-4 tests + 17 new Phase 4 tests all pass.
- **Locked decisions affected**: None. Phase 4 is a strict read-only composition of D-11, D-12, and D-13. See `DECISIONS.md` §10 for the append-only Phase 4 notes (4-N1..4-N6).
- **Code touchpoints** (final, for the audit trail):
  - `src/ArabicSchoolArchive.Api/Dtos/ArchiveListDtos.cs`
  - `src/ArabicSchoolArchive.Api/Services/ArchiveReadRepository.cs` + interface
  - `src/ArabicSchoolArchive.Api/Services/BlobSasGenerator.cs` + interface
  - `src/ArabicSchoolArchive.Api/Services/BlobDownloadService.cs` + interface
  - `src/ArabicSchoolArchive.Api/Configuration/BlobOptions.cs` (added `SasTtlMinutes`)
  - `src/ArabicSchoolArchive.Api/Controllers/ArchiveBrowseController.cs`
  - `src/ArabicSchoolArchive.Api/Program.cs` (DI registrations)
  - `src/ArabicSchoolArchive.Api/appsettings.json` (added `Blob:SasTtlMinutes`, `LocalDev:DownloadStreamEnabled`)
  - Test suites `ArabicSchoolArchive.Tests/Repository/ArchiveReadRepositoryTests.cs` and `ArabicSchoolArchive.Tests/Controller/ArchiveBrowseControllerTests.cs`.
- **Carry-over to Phase 5+**: nothing was opened by Phase 4. Full-text search and SAS revocation remain in the Phase 5+ backlog.

---

## Phase 5 - Security Hardening (ACTIVE 2026-06-17)

This section is the live journal for Phase 5. Code, tests, and docs are added in chronological order as the phase progresses.

### 5.1 Code changes (production path)

| File | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Api/Services/FileSignatureValidator.cs` | New. `IFileSignatureValidator` + `FileSignatureValidator`. Reads up to 16 bytes from the open `IFormFile` stream, matches against the magic-byte signatures of PDF (`25 50 44 46 2D`), PNG (`89 50 4E 47 …`), JPG (`FF D8 FF`), and Office Open XML (`50 4B 03 04` / `05 06` / `07 08`). On success the stream `Position` is reset to 0 so the n8n step is unchanged. |
| `src/ArabicSchoolArchive.Api/Services/LogScrubber.cs` | New. Static helper that strips SAS query parameters, `Authorization: Bearer …` headers, `AccountKey=…` / `SharedAccessKey=…` / `SharedAccessSignature=…` connection-string segments, and JWT-shaped tokens. Used by the audit logger and available to the rest of the codebase. |
| `src/ArabicSchoolArchive.Api/Services/AuditLog.cs` | New. `IAuditLog` + `AuditLog`. Single `Record(AuditEvent)` method that writes a structured `ILogger` entry under the `ArabicSchoolArchive.Api.Services.AuditLog` category. The audit enum covers `Success`, `Rejected`, `Failed`, `ForbiddenTenantAccess`, `RateLimited`. Every emitted entry is run through `LogScrubber` so secrets, raw paths, and SAS query strings never reach the log. |
| `src/ArabicSchoolArchive.Api/Configuration/RateLimitOptions.cs` | New. `RateLimit:Enabled` (default `true`), `UploadPerMinute` (default `30`), `ReadPerMinute` (default `300`), `CleanupIntervalSeconds` (default `60`), `IdleEntryTtlSeconds` (default `600`). |
| `src/ArabicSchoolArchive.Api/Configuration/CorsOptions.cs` | New. `Cors:AllowedOrigins` (default `[]` — no CORS), `AllowCredentials`, `AllowedMethods`, `AllowedHeaders`, `PreflightMaxAgeSeconds`. |
| `src/ArabicSchoolArchive.Api/Middleware/RateLimitMiddleware.cs` | New. Per-tenant token-bucket. Reads the authenticated `school_id` claim; falls back to a per-IP key for unauthenticated requests. Classifies the request as `Upload` (POST with `/upload` in the path) or `Read` (everything else, including the `/health` skip). On overflow returns `429 RATE_LIMITED` with a `Retry-After` header. Emits an `AuditOutcome.RateLimited` audit entry. |
| `src/ArabicSchoolArchive.Api/Services/UploadOrchestrator.cs` | Adds `IFileSignatureValidator` and `IAuditLog` dependencies. Magic-bytes check runs after the existing extension + MIME validation; an `audit:upload.rejected` entry is written on every rejection (extension, MIME, magic, signature-unreadable). Success, n8n-failure, blob-failure, db-failure, and unhandled-exception paths each emit one audit record. |
| `src/ArabicSchoolArchive.Api/Services/BlobSasGenerator.cs` | Adds an explicit path-traversal guard: any `blobObjectName` containing `..`, `\`, or a NUL byte is rejected with `ArgumentException`. The existing tenant-prefix check is preserved. |
| `src/ArabicSchoolArchive.Api/Controllers/ArchiveBrowseController.cs` | Wires `IAuditLog` into `List`, `GetById`, `Download`, and `Content`. Cross-tenant attempts are recorded as `AuditOutcome.ForbiddenTenantAccess` even though the response is `404`. |
| `src/ArabicSchoolArchive.Api/Program.cs` | Registers the new options + services in DI. Adds CORS middleware (only when `Cors:AllowedOrigins` is non-empty — wildcard origins are rejected at config-load time). Inserts the rate-limit middleware **after** `UseAuthentication`/`UseAuthorization` and **before** `MapControllers`. `IAuditLog` is registered as `Singleton` (stateless logger) so the middleware (also singleton) can resolve it. |
| `src/ArabicSchoolArchive.Api/appsettings.json` | Adds `RateLimit` and `Cors` sections with safe defaults. |
| `src/ArabicSchoolArchive.Tests/Services/FileSignatureValidatorTests.cs` | New. 10 tests covering the 5 supported formats, the cross-format mismatch rejections, the zero-byte rejection, and the stream-position reset. |
| `src/ArabicSchoolArchive.Tests/Services/FileValidatorTests.cs` | Adds 2 Phase 5 tests asserting that the existing zero-byte / oversize / MIME-mismatch behavior is unchanged. |
| `src/ArabicSchoolArchive.Tests/Services/BlobStorageServiceSafeNameTests.cs` | Adds 1 Phase 5 test asserting that the SAS generator refuses non-tenant-prefix paths and any `..` segment. |
| `src/ArabicSchoolArchive.Tests/Orchestrator/UploadOrchestratorTests.cs` | `BuildOrchestrator` and the throwing-DB context helper updated to pass the new `IFileSignatureValidator` and `IAuditLog` dependencies. The `MakeFile` helper now prepends a real PDF magic-byte signature (`25 50 44 46 2D`) for PDF-named files so the success-path test data is realistic. |
| `src/ArabicSchoolArchive.Tests/Orchestrator/UploadOrchestratorBatchTests.cs` | Same constructor / `MakeFile` updates. |
| `src/ArabicSchoolArchive.Tests/Middleware/RateLimitAndAuditTests.cs` | New. 12 tests covering upload rate limit, read rate limit, audit-on-upload, audit-on-rejected-upload, audit-on-forbidden-cross-tenant, CORS not configured for non-allowlisted origin, and 4 `LogScrubber` unit tests. |

**Test result:** 83 of 83 passing (`dotnet test`) at the close of Phase 5 implementation. (58 pre-Phase-5 + 25 new Phase 5 tests: 10 signature + 2 validator + 1 SAS + 12 rate-limit/audit. No prior tests removed or weakened.)

### 5.2 Hardening guarantees

- **Magic bytes cross-check** — extension, declared MIME, and the first 16 bytes of the file must all agree. Any disagreement (e.g. `application/pdf` extension with PNG bytes) is rejected with `Rejected/MAGIC_BYTES_MISMATCH`. Zero-byte or unreadable streams are rejected with `Rejected/MAGIC_BYTES_UNREADABLE`.
- **Path traversal** — `BlobSasGenerator` refuses any `blobObjectName` containing `..`, `\`, or a NUL byte, in addition to the existing tenant-prefix check. The cross-tenant test (`Phase5_SasRefusesNonTenantPrefix`) covers this end-to-end.
- **Rate limit** — the middleware applies **after** authentication, so a missing/invalid `school_id` is caught first and returns 401/403, not 429. The `/health` endpoint is exempt. Default caps (`UploadPerMinute=30`, `ReadPerMinute=300`) are well above the test request counts, so the existing 58 tests do not trip the limit.
- **Audit log** — emits one structured record per audited event under the `AuditLog` category. Every field is run through `LogScrubber`; secrets, JWTs, SAS query strings, and `Authorization` headers are replaced with `***` before they reach the logger.
- **CORS** — wildcard origins are rejected at config-load time (`InvalidOperationException` on startup). The middleware is only registered when `Cors:AllowedOrigins` is non-empty, so a misconfigured production deploy defaults to "no CORS" rather than "wildcard CORS".
- **Backward compatibility** — every Phase 2/2.5/3/4 endpoint keeps its response shape. The new magic-bytes rejection is a new `reasonCode` in the existing envelope. The new rate-limit response is `429` with body `{ "code": "RATE_LIMITED", "scope": "...", "retryAfterSeconds": N }`. The dev-bypass handler, JWT scheme, health endpoint, and Docker image are unchanged.

### 5.3 Honesty notes

- The 25 new tests are net additions: 58 prior tests still pass, +25 new = 83 total. No test was weakened or skipped.
- The `AuditLog_RecordsUploadAction` test asserts that an `action=Upload` audit record is written. The orchestrator writes one such record on every code path (success, n8n failure, blob failure, db failure, magic-bytes rejection, extension rejection). A separate test (`AuditLog_RecordsUploadSuccess_WhenN8nReturnsCategory`) uses a `WithMockedN8nFactory` and a mocked `IBlobStorageService` to drive the full pipeline to `Success` and assert that specific outcome is recorded.
- The rate-limit middleware is **in-process**. A multi-instance deployment would undercount because the buckets are per-process. This is acceptable for v1 and is documented in `LOCAL_RUN.md` §2.
- `CORS` is **off** by default in `appsettings.json`. The dev manual-QA script does not need CORS, and a production deploy must explicitly set `Cors:AllowedOrigins` to be CORS-enabled.
- No EF Core migration was added. The `Archives` table from Phase 2/2.5/3/4 is reused as-is.
- `IAuditLog` is registered as `Singleton` (not `Scoped`) because the rate-limit middleware (also singleton) depends on it. The audit log is a thin logger wrapper; it has no per-request state.

### 5.4 Phase 5 - Newly Locked Design Decisions

None. No locked Phase 1–4 decision was modified, removed, or reinterpreted. Phase 5 is a strict **additive** hardening layer: magic-bytes validation, rate limiting, audit logging, CORS allowlist, and secret scrubbing. The Phase 1–4 contracts (D-07..D-15) are honored unchanged. See `DECISIONS.md` §11 for the append-only Phase 5 notes.

---

## Phase 5 - Open/Unresolved Questions

- **Persistent audit table**: the audit log is currently a structured `ILogger` channel. A persistent `AuditLog` table is deferred to a future phase; the public `IAuditLog` interface is stable so the storage backend can be swapped without touching the call sites.
- **Distributed rate limiter**: the in-process token bucket is sufficient for a single instance. A multi-instance deployment would need a shared store (Redis or similar) for accurate limits. This is deferred to Phase 6+.
- **CORS preflight caching**: the `PreflightMaxAgeSeconds` is set to 600. The preflight response is short-lived by default to avoid stale CORS configuration in clients.
- **Migrations**: still deferred.

---

## Phase 5 - Approval & Closure (2026-06-17)

- **Status**: APPROVED.
- **Test result at sign-off**: 83/83 xUnit tests green (`dotnet test`). The 58 pre-Phase-5 tests + 25 new Phase 5 tests (10 signature + 2 validator + 1 SAS + 12 rate-limit/audit) all pass.
- **Locked decisions affected**: None. Phase 5 is a strict additive hardening layer; no Phase 1–4 decision was modified, removed, or reinterpreted. See `DECISIONS.md` §11 for the append-only Phase 5 notes (5-N1..5-N6).
- **Code touchpoints** (final, for the audit trail):
  - `src/ArabicSchoolArchive.Api/Services/FileSignatureValidator.cs` + interface (magic-bytes validation)
  - `src/ArabicSchoolArchive.Api/Services/LogScrubber.cs` (SAS / Bearer / AccountKey / JWT scrubbing)
  - `src/ArabicSchoolArchive.Api/Services/AuditLog.cs` + interface + enums (`AuditAction`, `AuditOutcome`)
  - `src/ArabicSchoolArchive.Api/Configuration/RateLimitOptions.cs`
  - `src/ArabicSchoolArchive.Api/Configuration/CorsOptions.cs`
  - `src/ArabicSchoolArchive.Api/Middleware/RateLimitMiddleware.cs`
  - `src/ArabicSchoolArchive.Api/Services/UploadOrchestrator.cs` (Phase 5 wiring: signature + audit)
  - `src/ArabicSchoolArchive.Api/Services/BlobSasGenerator.cs` (path-traversal guard)
  - `src/ArabicSchoolArchive.Api/Controllers/ArchiveBrowseController.cs` (audit on read paths)
  - `src/ArabicSchoolArchive.Api/Program.cs` (DI + CORS + middleware ordering)
  - `src/ArabicSchoolArchive.Api/appsettings.json` (added `RateLimit` and `Cors` sections)
  - Test suites `FileSignatureValidatorTests`, the additions in `FileValidatorTests` and `BlobStorageServiceSafeNameTests`, and the new `Middleware/RateLimitAndAuditTests`.
- **Carry-over to Phase 6**: nothing was opened by Phase 5. The persistent audit table, the distributed rate limiter, and the migrations carry-over remain on the Phase 5+ backlog.
- **Phase 6 dependencies satisfied**: yes. Phase 6 (Subscription Enforcement) is now ACTIVE per `ROADMAP.md`.

---

## Phase 6 - Subscription Enforcement (ACTIVE 2026-06-17)

This section is the live journal for Phase 6. Code, tests, and docs are added in chronological order as the phase progresses.

### 6.1 Code changes (production path)

| File | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionState.cs` | New. `enum SubscriptionState { Active, GracePeriod, Expired, Suspended }`. |
| `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionStatus.cs` | New. Per-tenant status record with `IsAllowed()` helper. Static factories for `Active`, `GracePeriod`, `Expired`, `Suspended`. |
| `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionOptions.cs` | New. Bound to `Subscriptions` section. `Enabled` (default `true`), `DefaultGracePeriodDays` (default `7`), `Schools[]` (per-school config). |
| `src/ArabicSchoolArchive.Api/Subscriptions/ISubscriptionStore.cs` | New. Single `GetAsync(schoolId, ct)` method. |
| `src/ArabicSchoolArchive.Api/Subscriptions/ConfigSubscriptionStore.cs` | New. Reads from `SubscriptionOptions.Schools[]`. Materializes state with grace-period transition logic: an `Active` entry whose `ExpiresAtUtc` is in the past is auto-promoted to `GracePeriod` if the current time is within `GraceUntilUtc` (or `ExpiresAtUtc + DefaultGracePeriodDays`), otherwise demoted to `Expired`. Unknown school ids default to `Active`. |
| `src/ArabicSchoolArchive.Api/Middleware/SubscriptionGuardMiddleware.cs` | New. Runs **after** `UseAuthentication`/`UseAuthorization` and **before** the rate-limit middleware. Reads `school_id` claim, calls `ISubscriptionStore.GetAsync`, blocks with `402 SUBSCRIPTION_EXPIRED` or `403 SUBSCRIPTION_SUSPENDED` for blocked states. Skips `/health` and routes without an authenticated school. Emits an `AuditOutcome.ForbiddenTenantAccess` audit record for every rejection. |
| `src/ArabicSchoolArchive.Api/Program.cs` | Adds `Configure<SubscriptionOptions>` + DI registration for `ISubscriptionStore` (singleton). Wires `app.UseMiddleware<SubscriptionGuardMiddleware>()` between `UseAuthorization` and the rate-limit middleware. |
| `src/ArabicSchoolArchive.Api/appsettings.json` | Adds the `Subscriptions` section with safe defaults (`Enabled=true`, empty `Schools[]`). |
| `src/ArabicSchoolArchive.Api/appsettings.Development.json` | Adds the four dev tenant states (Active / GracePeriod / Expired / Suspended) bound to the well-known dev school ids. |
| `src/ArabicSchoolArchive.Tests/Subscriptions/ConfigSubscriptionStoreTests.cs` | New. 13 unit tests for the config store (active / grace / expired / suspended, grace auto-promotion, expired auto-demotion, empty / invalid entries, `IsAllowed` predicate, fixed-time provider). |
| `src/ArabicSchoolArchive.Tests/Middleware/SubscriptionGuardMiddlewareTests.cs` | New. 14 `WebApplicationFactory<Program>` integration tests covering all 10 required scenarios plus boundary checks (active browse, expired get-by-id, suspended list, unknown school fallback, health exempt). |
| `src/ArabicSchoolArchive.Tests/Middleware/RateLimitAndAuditTests.cs` | Adds `Subscriptions:Enabled=false` to both `Factory` and `WithMockedN8nFactory` so the prior 12 Phase 5 tests run with the guard off. |
| `src/ArabicSchoolArchive.Tests/Controller/ArchiveUploadControllerTests.cs` | Adds `Subscriptions:Enabled=false` to the test factory so the 5 Phase 3 controller tests run with the guard off. |
| `src/ArabicSchoolArchive.Tests/Controller/ArchiveBrowseControllerTests.cs` | Adds `Subscriptions:Enabled=false` to the test factory so the 9 Phase 4 controller tests run with the guard off. |

**Test result:** 110 of 110 passing (`dotnet test`) at the close of Phase 6 implementation. (83 pre-Phase-6 + 27 new Phase 6 tests: 13 config-store + 14 middleware. No prior tests removed or weakened.)

### 6.2 Hardening guarantees

- **Server-side authority** — the check lives in middleware. The frontend can display whatever it wants; the backend is the only source of truth.
- **Auth-first ordering** — `SubscriptionGuardMiddleware` runs **after** `UseAuthentication`/`UseAuthorization`. An unauthenticated request never reaches the subscription check; the JWT/dev-bypass scheme rejects it as `401` first. This is the test contract `Unauthenticated_Remains401_Not402Or403` enforces.
- **State resolved by `school_id`, not `user_id`** — the middleware reads the `school_id` claim from the principal. The `TenantStateResolvedBySchoolId_NotUserId` test proves two different users of the same `Suspended` school are both blocked.
- **All protected routes are enforced** — the middleware matches on the request path: `POST /upload` (upload), `GET /archives/{id}/download` (download), `GET /archives/{id}/content` (content), `GET /archives/{guid}` (get-by-id), everything else under `/api/v1/` is treated as browse. The `AuditAction` enum is reused to classify the rejected request in the audit log.
- **Dev-bypass is honored, but the guard still runs** — a dev tenant whose `school_id` is mapped to `Suspended` is hard-blocked. The dev-bypass's only effect is to populate the `school_id` claim from `X-Dev-School-Id`; the guard then evaluates that claim against the configured `Schools[]` table.
- **Unknown school ids default to `Active`** — the config store returns `Active` when the `school_id` is not present in `Schools[]`. This is a deliberate safe default: a misconfigured prod deploy with no `Subscriptions:Schools[]` table will not lock out every tenant. The `UnknownSchool_FallsBackToActive_AndCanBrowse` test pins this behavior.
- **Response shape** — `402 Payment Required` for `Expired` with body `{ "code": "SUBSCRIPTION_EXPIRED", "state": "Expired", "schoolId": "..." }`. `403 Forbidden` for `Suspended` with body `{ "code": "SUBSCRIPTION_SUSPENDED", "state": "Suspended", "schoolId": "..." }`. The `X-Subscription-State` response header is set so the client can react without parsing the body.
- **`/health` is exempt** — the middleware skips the `/health` path so liveness probes continue to work regardless of subscription state.

### 6.3 Honesty notes

- The 27 new tests are net additions: 83 prior tests still pass, +27 new = 110 total. No test was weakened or skipped. The three existing test factories were updated with `Subscriptions:Enabled=false` to keep the prior 83 tests deterministic; this is a defensive config flip, not a behavior change.
- The middleware is **stateless** (no in-process cache). Every request consults the store. A future phase can wrap the store with a short-TTL cache without changing the middleware, because the only public surface is `ISubscriptionStore`.
- The `ConfigSubscriptionStore` evaluates an `Active` entry against the current UTC time to auto-promote to `GracePeriod` (if `now <= GraceUntilUtc`) or demote to `Expired` (otherwise). The `DefaultGracePeriodDays` is `7`, matching `SECURITY.md` §3 and the locked Phase 0 assumption.
- The middleware writes one audit record per rejection with `outcome=ForbiddenTenantAccess` and `reasonCode=SUBSCRIPTION_EXPIRED` or `SUBSCRIPTION_SUSPENDED`. The `LogScrubber` defense from Phase 5 still applies, so the structured log line never contains secrets.
- No new EF Core migration. The subscription state is config-driven; a real database-backed `Subscriptions` table is deferred to a future phase (the `ISubscriptionStore` interface is stable).
- The `Active` and `GracePeriod` states are both treated as `IsAllowed() == true`. The difference is observable only in the audit log; no extra API surface is added in v1.
- The `Pending` enum value from D-10 is not produced anywhere; the same is true for subscriptions — `Suspended` and `Canceled` (from `SUBSCRIPTIONS.md` §1) are not the same. Phase 6 implements `Active / GracePeriod / Expired / Suspended` per the user prompt; `Canceled` is a future-phase add.

### 6.4 Phase 6 - Newly Locked Design Decisions

None. Phase 6 is a strict **additive** enforcement layer that implements D-14 (`SubscriptionGuardMiddleware` placed after auth, before controller binding) and honors D-13 (the tenant boundary is the `school_id` claim). No Phase 1–5 decision was modified, removed, or reinterpreted. See `DECISIONS.md` §13 for the append-only Phase 6 notes.

---

## Phase 6 - Approval & Closure (2026-06-17)

- **Status**: APPROVED.
- **Test result at sign-off**: 110/110 xUnit tests green (`dotnet test`). The 83 pre-Phase-6 tests + 27 new Phase 6 tests (13 config-store + 14 middleware) all pass. No prior test was weakened or skipped.
- **Locked decisions affected**: None. Phase 6 is a strict additive enforcement layer; no Phase 1–5 decision was modified, removed, or reinterpreted. See `DECISIONS.md` §13 for the append-only Phase 6 notes (6-N1..6-N6).
- **Code touchpoints** (final, for the audit trail):
  - `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionState.cs`
  - `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionStatus.cs`
  - `src/ArabicSchoolArchive.Api/Subscriptions/SubscriptionOptions.cs`
  - `src/ArabicSchoolArchive.Api/Subscriptions/ISubscriptionStore.cs`
  - `src/ArabicSchoolArchive.Api/Subscriptions/ConfigSubscriptionStore.cs`
  - `src/ArabicSchoolArchive.Api/Middleware/SubscriptionGuardMiddleware.cs`
  - `src/ArabicSchoolArchive.Api/Program.cs` (DI + middleware ordering)
  - `src/ArabicSchoolArchive.Api/appsettings.json` (added `Subscriptions` section)
  - `src/ArabicSchoolArchive.Api/appsettings.Development.json` (added four dev tenant states)
  - Test suites `ConfigSubscriptionStoreTests` and `Middleware/SubscriptionGuardMiddlewareTests`.
- **Carry-over to Phase 7**: nothing was opened by Phase 6. The persistent subscription table, per-tenant cache, and migrations remain on the Phase 7+ backlog.
- **Phase 7 dependencies satisfied**: yes. Phase 7 (Gulf-School UI/UX Polish) is now ACTIVE per `ROADMAP.md`.

---

## Phase 6 - Open/Unresolved Questions

- **Persistent subscription table**: the current store is config-driven. A real `Subscriptions` table in SQL with admin write paths is deferred to a future phase; the `ISubscriptionStore` interface is stable so the implementation can be swapped without touching the middleware.
- **Per-tenant cache**: a per-tenant cache with a short TTL (e.g. 30 s) would reduce the per-request cost. Deferred.
- **Grace-period UI banner**: the Phase 0 spec mentions a "renewal required" banner in `SUBSCRIPTIONS.md` §2. The API now surfaces the state; the React UI is deferred to Phase 7.
- **`Canceled` state**: not in the Phase 6 scope. The `SubscriptionState` enum is `Active / GracePeriod / Expired / Suspended` only.
- **Migrations**: still deferred.

---

## Phase 7 - Gulf-School UI/UX Polish (REVISED & REBUILDING 2026-06-17 — "Phase 7.5 Modernization")

This section is the live journal for Phase 7.5. No backend business-logic file was rewritten; the only additive API change is the generated `Data/Migrations/InitialArchiveSchema` folder. The frontend at `src/ArabicSchoolArchive.Web/` is being rebuilt per D-17 (Tailwind CSS, Shadcn/ui-style components, TanStack Query). The original "plain CSS + `useState`/`useEffect` only" shell is deprecated.

### 7.1 Stack & decision (revised per D-17)

| Concern | Choice | Rationale |
|:---|:---|:---|
| Build tool | **Vite 5** | Fast dev server, simple `vite build`, well-known local proxy for `/api` to the backend. |
| UI framework | **React 18** + TypeScript | The locked frontend runtime. |
| Styling | **Tailwind CSS** (utility-first, RTL-aware) | Robust RTL styling without a heavy custom stylesheet. Logical properties + `dir="rtl"`. |
| UI components | **Shadcn/ui-style components** (or clean hand-authored Tailwind components) | Calm Gulf-school palette, accessible by default. No MUI, no Ant Design. |
| State / data | **TanStack Query (React Query) v5** | Every API call wrapped in `useQuery` / `useMutation`. Loading, error, pagination, debouncing are managed by the library. No manual `useEffect` chains. |
| Icons | **Lucide React** | Tree-shakeable, modern, widely used with Shadcn. |
| Routing | **Hash routing** in-app (preserved) | One small `parseHash` function. Saves a dependency. |
| Type-checking | **`tsc -b` strict** | `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. |
| Frontend tests | **Node `node:test` + TypeScript** (preserved) | Existing 7 unit tests on `ApiClient` remain; new hooks are exercised manually. |

### 7.2 Code changes (frontend only)

| File | Purpose |
|:---|:---|
| `src/ArabicSchoolArchive.Web/package.json` | Dependencies: `react`, `react-dom`. Dev: `@types/react`, `@types/react-dom`, `@types/node`, `@vitejs/plugin-react`, `typescript`, `vite`. |
| `src/ArabicSchoolArchive.Web/tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.test.json` | Strict TS config. Test config includes `src` + `tests` and sets `jsx: react-jsx`. |
| `src/ArabicSchoolArchive.Web/vite.config.ts` | Dev server on `:5173`; proxies `/api` and `/health` to `http://localhost:5132`. |
| `src/ArabicSchoolArchive.Web/index.html` | `<html lang="ar" dir="rtl">`. |
| `src/ArabicSchoolArchive.Web/src/main.tsx` | React 18 `createRoot` entry point. |
| `src/ArabicSchoolArchive.Web/src/api/contracts.ts` | TypeScript types matching the locked backend DTOs (single upload, batch, list, item, download, error). |
| `src/ArabicSchoolArchive.Web/src/api/ApiClient.ts` | `fetch` wrapper with `get<T>()` and `postForm<T>()`. `ApiError` carries `status`, `code`, `state`, `message` (Arabic), `body`. Derives Arabic messages for 401, 402, 403, 404, 429, 5xx. |
| `src/ArabicSchoolArchive.Web/src/api/ApiClientContext.tsx` | React context that wires the dev-bypass headers from `DevBypassContext` into the `ApiClient`. |
| `src/ArabicSchoolArchive.Web/src/api/ArchiveService.ts` | Typed service with `uploadBatch`, `list`, `getById`, `getDownloadUrl`. |
| `src/ArabicSchoolArchive.Web/src/config/DevBypassContext.tsx` | In-app dev-bypass config (school id, user id, enabled). Persisted in `localStorage` under `asa.devBypass.v1`. |
| `src/ArabicSchoolArchive.Web/src/ui/App.tsx` | Hash-routed shell. Routes: `#/upload`, `#/archives`, `#/archives/{documentId}`, `#/blocked/expired`, `#/blocked/suspended`, `#/blocked/grace`. |
| `src/ArabicSchoolArchive.Web/src/ui/components/StatusBadge.tsx` | Per-file `Success / Rejected / Failed / Pending` badge with Arabic labels. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Alert.tsx` | Reusable alert with `info / success / warning / error` variants. |
| `src/ArabicSchoolArchive.Web/src/ui/components/EmptyState.tsx` | Calm empty state. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Loading.tsx` | Spinner + Arabic label. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Pagination.tsx` | Server-driven pagination (page indicator + prev/next). |
| `src/ArabicSchoolArchive.Web/src/ui/components/DevSettingsPanel.tsx` | Dev-only panel: presets for Active / GracePeriod / Expired / Suspended tenants, free-form UUIDs, reset button. |
| `src/ArabicSchoolArchive.Web/src/ui/components/index.ts` | Re-exports. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/UploadPage.tsx` | Multi-file picker, summary line, per-file `StatusBadge`, success/rejected/failed/pending states, 401/402/403/404/429/validation alerts. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/BrowsePage.tsx` | Search + filters (`originalNameContains`, `category`, `processingYear`, `processingMonth`), pagination, empty / loading states. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/DocumentDetailsPage.tsx` | Read-only metadata + "تنزيل المستند" action that opens the backend's signed URL in a new tab. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/SubscriptionBlockedPage.tsx` | Three variants: `Expired`, `Suspended`, `GracePeriod`. Calm, no payment, no admin subscription management. |
| `src/ArabicSchoolArchive.Web/src/ui/styles/global.css` | Single hand-authored stylesheet. Calm palette, RTL-first, responsive (single column on mobile, 5-column filters on desktop). |
| `src/ArabicSchoolArchive.Web/tests/apiClient.test.ts` | 7 frontend unit tests for `ApiClient`. |

### 7.3 Frontend quality gate

| Command | Result |
|:---|:---|
| `npm install` (in `src/ArabicSchoolArchive.Web`) | 70 packages installed; no peer-dep warnings of substance. |
| `npm run typecheck` | Passes (`tsc -b --noEmit`, strict mode). |
| `npm run build` | Passes. Vite emits `dist/index.html` (0.47 kB), `dist/assets/index-*.css` (11.77 kB), `dist/assets/index-*.js` (166.89 kB / 53.34 kB gzip). |
| `npm test` | 7 of 7 frontend unit tests green. |
| `dotnet test` (full solution) | **110 of 110 backend xUnit tests still green.** No backend file was modified in Phase 7. |

### 7.4 Honesty notes

- No backend file was touched. The diff in `src/ArabicSchoolArchive.Api/` between Phase 6 sign-off and Phase 7 sign-off is empty.
- The frontend dev server proxies `/api/*` and `/health` to `http://localhost:5132` (the dotnet run port). No CORS change is needed in dev; in production the API and the SPA would share a single origin.
- The Arabic copy is intentionally formal and administration-appropriate (e.g. "الأرشيف المدرسي العربي" in the header, "تنزيل المستند" on the download button, "تجديد الاشتراك" on the blocked page). No Gulf-school-specific imagery or emblems; the feel comes from typography, color, and spacing.
- RTL is set in the markup (`<html lang="ar" dir="rtl">`) and the CSS uses logical properties (`padding-inline-start`) so the layout flips correctly. The dev-bypass `schoolId` / `userId` inputs are forced to `dir="ltr"` because UUIDs are left-to-right tokens.
- The frontend deliberately does **not** render the subscription state on the protected routes — the backend's `SubscriptionGuardMiddleware` (Phase 6) is the single source of truth. The frontend just maps the 402 / 403 + `state` body to a calm placeholder page. This honors the user prompt's "Do not rewrite subscription middleware".
- The frontend has no tests for components (only `ApiClient`). The user prompt allows "lightweight frontend tests if the stack already supports them easily; otherwise document manual QA thoroughly". 7 unit tests on the `ApiClient` exercise every documented HTTP error path the UI consumes; manual QA covers the rest.

### 7.5 Phase 7 - Newly Locked Design Decisions

None. Phase 7 is a strict **additive** UI layer that consumes the locked Phase 1–6 backend contracts. No Phase 1–6 decision was modified, removed, or reinterpreted. The backend `school_id` / `user_id` claim convention (D-15, Phase 2.5) and the subscription error response shape (Phase 6, 6-N3) are honored unchanged. See `DECISIONS.md` §15 for the append-only Phase 7 notes.

### 7.6 Phase 7.5 Modernization (2026-06-17)

The original Phase 7 "plain CSS + `useState`/`useEffect` only" shell shipped but produced a laggy, prototype-like UX: typing in the search box could freeze the UI, every page had to hand-roll its own loading/error state, and there was no way to debounce keystrokes against the backend. Phase 7.5 Modernization corrects this without touching the backend business logic.

#### 7.6.1 Code changes (Phase 7.5)

| Area | Change |
|:---|:---|
| `src/ArabicSchoolArchive.Web/package.json` | Adds `tailwindcss`, `postcss`, `autoprefixer`, `@tanstack/react-query`, `lucide-react`, and the Shadcn-style helper packages (`class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/*` primitives as needed). |
| `src/ArabicSchoolArchive.Web/tailwind.config.js` | New. `content` globs, RTL plugin (or `dir="rtl"` + logical-property utilities), color palette aligned with the Gulf-school calm tones (deep primary, gold accent, off-white background). |
| `src/ArabicSchoolArchive.Web/postcss.config.js` | New. Standard Tailwind + autoprefixer pipeline. |
| `src/ArabicSchoolArchive.Web/src/styles/global.css` | Replaces the hand-authored `global.css` with the Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) plus a tiny set of base resets. |
| `src/ArabicSchoolArchive.Web/src/main.tsx` | Wraps the app in `<QueryClientProvider>`. Configures `defaultOptions.queries` (stale time, retry, refetch on window focus off). |
| `src/ArabicSchoolArchive.Web/src/api/hooks/useArchives.ts` | New. `useArchiveList(query)` for browse/search/pagination, `useArchiveById(id)` for details, `useArchiveDownloadUrl(id)` for the signed URL. All built on `useQuery`. |
| `src/ArabicSchoolArchive.Web/src/api/hooks/useUploadArchive.ts` | New. `useUploadBatch()` mutation. Built on `useMutation`. Handles per-file `Success` / `Rejected` / `Failed` / `Pending` status mapping. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/BrowsePage.tsx` | Rewritten. Debounced search input, filter dropdowns, paginated list — all driven by `useArchiveList`. No more manual `useEffect` chain on keystrokes. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/UploadPage.tsx` | Rewritten. Multi-file picker + per-file `StatusBadge` styled with Tailwind. Premium look. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/SubscriptionBlockedPage.tsx` | Rewritten. Three variants (`Expired`, `Suspended`, `GracePeriod`) styled beautifully with Tailwind. |
| `src/ArabicSchoolArchive.Web/src/ui/pages/DocumentDetailsPage.tsx` | Rewritten. Read-only metadata + "تنزيل المستند" action. |
| `src/ArabicSchoolArchive.Web/src/ui/components/StatusBadge.tsx` | Tailwind-styled badge. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Alert.tsx` | Tailwind-styled alert. |
| `src/ArabicSchoolArchive.Web/src/ui/components/EmptyState.tsx` | Tailwind-styled empty state. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Loading.tsx` | Tailwind-styled spinner. |
| `src/ArabicSchoolArchive.Web/src/ui/components/Pagination.tsx` | Tailwind-styled pagination. |
| `src/ArabicSchoolArchive.Web/src/ui/components/DevSettingsPanel.tsx` | Tailwind-styled dev panel (preserved, restyled). |
| `src/ArabicSchoolArchive.Api/Data/Migrations/InitialArchiveSchema.*.cs` | New. First EF Core migration. Generated by `dotnet ef migrations add InitialArchiveSchema -o Data/Migrations`. |
| `docs/agent/ROADMAP.md` | Phase 7 rewritten as REVISED & REBUILDING; tech stack permissions updated. |
| `docs/agent/DECISIONS.md` | D-17 (Phase 7.5 Modernization) and D-18 (Initial EF Core Migration) appended. |
| `docs/agent/LOCAL_RUN.md` | §3.2 and §4.1.1 updated with `dotnet ef database update` steps. |
| `docs/agent/PROGRESS.md` | This file. |

#### 7.6.2 Backend (D-18) — initial EF Core migration

- Generated with `dotnet ef migrations add InitialArchiveSchema -o Data/Migrations` in `src/ArabicSchoolArchive.Api/`.
- `Program.cs` does **not** call `Database.Migrate()`. Migrations are applied manually via `dotnet ef database update --project ArabicSchoolArchive.Api`.
- The migration creates the `Archives` table and the three indexes (`IX_Archives_School_UploadedAt`, `IX_Archives_School_Category`, `IX_Archives_School_OriginalName`).
- The xUnit suite uses `UseInMemoryDatabase` and is unaffected. **All 110 existing tests continue to pass without modification.**

#### 7.6.3 Frontend (D-17) — Tailwind + TanStack Query

- **Tailwind CSS** is installed, configured for RTL, and replaces the hand-authored `global.css`.
- **TanStack Query** wraps every API call. Custom hooks (`useArchives`, `useUploadArchive`, …) return `{ data, isLoading, isError, error }` and handle caching, background refetching, and pagination automatically.
- **Browse page search** uses a debounced input — typing does not freeze the UI.
- **Subscription blocked pages** are styled beautifully with Tailwind (`Expired` 402, `Suspended` 403, `GracePeriod`).
- **Upload page** uses Tailwind for the multi-file picker and the `Success` / `Rejected` / `Failed` / `Pending` status badges.
- **No backend file** outside the `Data/Migrations/` folder is rewritten.
- **No API contract** changes. The frontend consumes the exact same endpoints as before.

#### 7.6.4 Honesty notes

- No backend business-logic file is touched. The only API change is the additive `Data/Migrations/` folder.
- No xUnit test is modified. The 110/110 green bar is preserved.
- The `global.css` rewrite removes the hand-authored Gulf-school palette in favor of Tailwind utility classes. The visual tone is preserved (calm, formal, administration-appropriate) but expressed through Tailwind tokens, not custom CSS rules.
- Debouncing on the search input uses TanStack Query's built-in input + a small `useDebouncedValue` hook (no extra library). The 300 ms debounce keeps the backend query volume low without making the UI feel sluggish.

---

## Phase 7 - Open/Unresolved Questions

- **Component tests**: a small RTL or Vitest setup was intentionally not added. If a future phase wants deeper UI coverage, it can add `vitest` + `@testing-library/react` without rewriting the existing pages.
- **Production build deploy**: the `vite build` output (`dist/`) is a static SPA. Production deploy is a future concern; the dev story is `npm run dev` against the local API.
- **Frontend subscription state display**: Phase 7 does not yet call a "GET /me/subscription" endpoint. The placeholder pages are only reached after a 402/403. A future phase can add a banner on the protected routes that pre-warns a tenant in `GracePeriod` — this requires a new server endpoint and is out of scope for v1.
- **Migrations**: still deferred.

---

## Dev-Run Notes (post-Phase 7 cleanup)

These notes capture a small, **non-phase** cleanup of the local dev-run path. No business logic changed; no locked decision was modified. The changes are local-dev-only and do not affect production.

### Stack

- `src/docker-compose.local.yml` now starts **only** the `api` and `azurite` services. The local `n8n` container is removed. n8n is hosted externally and is reached via `N8N_WEBHOOK_URL` in `.env`. The compose form uses `${N8N_WEBHOOK_URL:?N8N_WEBHOOK_URL is required in .env}` so a missing value fails loud at startup.
- `src/.env.example` and `src/.env` use the **compose-style canonical names** (`N8N_WEBHOOK_URL`, `BLOB_CONNECTION_STRING`, `AUTH_DEV_BYPASS_ENABLED`, …) without duplicate `__`-form mirrors. docker-compose translates them to the ASP.NET Core `__`-form before the API sees them.
- The Azurite default key in `.env` / `.env.example` was corrected to the canonical well-known dev key (`Eby8vdM02xNOcq…`) to match `BlobSasGenerator.GetAccountKey()`. The previous placeholder key was wrong and would have caused SAS signature mismatches in dev.

### Host-browser download path (Azurite DNS caveat)

- The signed URL the API produces from `GET /archives/{id}/download` points at `http://azurite:10000/...` — the **internal** Docker DNS name. The host browser **cannot resolve `azurite`**. The user noticed this and asked for the minimal local-dev-safe fix.
- The fix is **option (a)** from the user prompt: when `LocalDev:DownloadStreamEnabled=true` AND `ASPNETCORE_ENVIRONMENT=Development`, the Vite frontend's download button calls the dev-only `GET /api/v1/archive/archives/{id}/content` route (already implemented in Phase 4) instead of opening the SAS URL. The dev-only content route enforces the same auth + tenant + subscription checks as the SAS path. **No security is weakened. No production behavior changes.** In production / staging the same button opens the signed URL.
- A tiny `GET /api/v1/local-dev/info` endpoint was added so the frontend can detect the dev mode without hard-coding. The endpoint returns 404 in non-Development environments so it cannot be probed in production.

### CORS for the Vite dev server

- `docker-compose.local.yml` now sets `Cors__AllowedOrigins__0=http://localhost:5173` by default, so a fresh `docker compose up` works with `npm run dev` in `src/ArabicSchoolArchive.Web/` without any extra configuration. The `Cors:AllowedOrigins` empty-by-default / wildcard-rejected behavior (Phase 5) is unchanged.
- `CORS_ALLOWED_ORIGIN` in `.env` lets you override the Vite origin (e.g. for a non-default port or a remote dev box).

### Validation

- `dotnet build src/ArabicSchoolArchive.slnx` → 0 errors.
- `dotnet test  src/ArabicSchoolArchive.Tests` → **110 / 110** green (no test modified).
- `npm run typecheck && npm run build && npm test` (in `src/ArabicSchoolArchive.Web/`) → all green; **9 / 9** frontend tests (added two `getBlob` cases).
- `docker compose up` was **not** run from this environment (no Docker daemon in the sandbox); the YAML was validated with `pyyaml` (services = `['api', 'azurite']`, `depends_on = { 'azurite': … }` only, no `n8n` service, no `n8n-data` volume).
- The actual `docker compose up -d --build`, `curl http://localhost:8080/health`, an upload smoke, and an Azurite blob verification are run by the user on their WSL / Ubuntu host (their already-running `asa-api` and `azurite` containers will be replaced when the new compose file is applied).

---

## Phase 7.7 - Real SQL Server Integration for Local Dev (2026-06-17)

- **Status**: COMPLETE: Integrated real SQL Server into local dev stack.
- **Description**: Permanently deprecated the `InMemory` database provider fallback for local manual QA and transitioned to a REAL SQL Server database inside the docker-compose stack.
- **Key Changes**:
  - Added a containerized SQL Server (`sqlserver`) running `mcr.microsoft.com/mssql/server:2022-latest` on port `1433:1433` with data persistence to the local docker-compose stack (`src/docker-compose.local.yml`).
  - Added the canonical connection string to `src/.env.example` as `CONNECTIONSTRINGS__AZURESQL`.
  - Added a local connection string override to `appsettings.Development.json` for host-side `dotnet run` runs targeting the docker-exposed SQL Server port (`localhost,1433`).
  - Updated documentation in `docs/agent/DECISIONS.md` (D-19) and `docs/agent/LOCAL_RUN.md` detailing the migration, deprecation of `InMemory` for QA, and how to manually run the EF Core database updates.
- **Integrity**: No C# business logic changed, no xUnit tests modified. All 110 xUnit tests remain green as they use independent in-memory databases.

---

## Phase 7.8 - Premium Saudi/Arabic UI Redesign (2026-06-17)

- **Status**: COMPLETE.
- **Description**: A wholesale, production-grade visual rebrand of the Web app onto the Hijazi / Date Palm / Diriyah / Ink / Oud / Sadu / Warm Gray system. Replaces the cool "Gulf academic navy + gold" tone with a warm, materially-rooted Saudi identity. Strictly frontend — no backend code or API contract is touched.
- **Why**: The Phase 7.5 design used stock SaaS aesthetics (glassmorphism sidebar, slate background, generic `rose/blue/emerald/violet` file-type tints, gradient hero tiles, `Loader2` spinner). That look read as a generic admin template, not as a premium Saudi-school product. The brief for this phase required an Arabic/Saudi identity with confidence, restraint, and editorial composition.
- **Token system** (`tailwind.config.js`):
  - **Canvas**: `#F6F1E7` Hijazi Cream background; `#FFFDF8` warm-white surface; `#EFE7D6` muted surface; `#E8DCC2` sunken well; warm borders (`#E1D6BC`, `#ECE2C9`, `#C7B891`).
  - **Ink**: `#11314A` Ink Navy (text/graph/icons base) with `#0B2236` (strong), `#5A6878` (muted), `#8A847B` (soft).
  - **Accents**: `#0E5A46` Date Palm Green; `#C8A46A` Diriyah Tan; `#5C4532` Oud Brown; `#7A2E2E` Sadu Maroon (rare, for destructive / formal moments); `#8A847B` Warm Gray.
  - **Status semantics** re-anchored: success → palm, warning → tan, danger → maroon, info → ink. No more stock tints.
  - **Type families**: `display` → "Saudi" → "Al-Awwal" → IBM Plex Sans Arabic → fallbacks; `body` → IBM Plex Sans Arabic → Noto Kufi Arabic → fallbacks; `kufi` → Noto Kufi Arabic; `mono` → IBM Plex Mono.
  - **Display sizes** `display-xl/lg/md/sm`; `eyebrow` and `section` 0.6875–0.75 rem with 0.16–0.22 em tracking for the small geometric section labels.
  - **Radii** tightened (`sm: 4`, `md: 6`, `lg: 8`, `xl: 12`); removed the `rounded-2xl` everywhere default to fight the "toy-like" feel.
  - **Shadows** rewritten as warm-tinted, low-spread (`flat`, `card`, `soft`, `elevated`, `overlay`, `palm-line`, `tan-line`, `ink-ring`, `focus-ring`).
  - **Motion** tokenised: a single easing `cubic-bezier(0.22, 1, 0.36, 1)` (aliased as `ease-out-expo`), durations `180/220/320ms`, no more `transition-all` defaults.
  - **Backgrounds**: `sand-grain` (warm radial wash fixed to the viewport), `saudi-pattern` (1px dot grid for very low-contrast ornament), `warm-divider` / `ink-divider`, `skeleton` (shimmer).
- **CSS layer** (`src/ui/styles/global.css`):
  - Mirrors every token as a CSS custom property on `:root` so plain CSS (focus rings, skeletons, custom backgrounds) reads from the same source of truth.
  - Body now uses the warm sand-grain background as a fixed attachment layer.
  - Typography hierarchy locked in `@layer base`. `font-display` is the Saudi/IBM Plex stack; `font-kufi` is the Noto Kufi stack.
  - Focus: 2 px cream outer + 4 px palm-tinted outer ring. Calm, accessible, no neon.
  - Custom scrollbar tinted in warm gray.
  - New component classes: `.asa-surface`, `.asa-surface-sunken`, `.asa-divider`, `.asa-divider-ink`, `.asa-eyebrow`, `.asa-section-label`, `.asa-underline`, `.asa-rule`, `.asa-skeleton`.
- **New primitives**:
  - `Button` — five variants (`primary`/`secondary`/`ghost`/`danger`/`link`), three sizes, leading/trailing icon slots, loading state, no gradients. Single source of truth for every button in the app.
  - `BrandMark` — an abstract geometric monogram (palm-toned tile, two open-book arcs, tan baseline rule) used in the sidebar. No literal heritage symbols.
  - `Tag` — six tones (`neutral`, `palm`, `tan`, `ink`, `oud`, `maroon`) for status pills.
  - `SectionHeading` — reusable page header with optional kufi eyebrow.
  - `Skeleton` / `SkeletonText` — elegant brand-tinted skeletons. The brief explicitly bans cheap spinners; the `Loader2` spinner is removed from the production UI.
- **Pages updated**:
  - `App.tsx` — sidebar uses the BrandMark, warm surface, palm left-rule for active item, and a 3px palm-tan gradient divider. The glassmorphism backdrop is gone. Top bar is calm, single-height, with a kufi-tracked monogram mark beside the title. Footer uses the new tokens.
  - `BrowsePage.tsx` — view toggle rebuilt as a real segmented control (no more `translate-x-[-96%]` hack). Document cards use the `asa-surface` primitive, palm hover state, and a tan hairlines divider. File-type tints re-mapped to the brand palette (PDF → maroon, DOCX → navy, XLSX → palm, IMG → oud).
  - `UploadPage.tsx` — dropzone is warm cream/sunken, not a glowing SaaS card. The "AI" icon was removed from the primary button (kept the Sparkles icon as a subtle action affordance). Summary pills use the new status semantics.
  - `DocumentDetailsPage.tsx` — hero card uses a 1px palm-tan-tan600 top rail (architectural), palm-tinted primary button via `Button`. Summary card uses a vertical palm-tan side rule instead of a stock `border-r-4 border-blue-500`. Detail rows use a kufi-tracked label.
  - `SubscriptionBlockedPage.tsx` — three reasons share one calm hero with a 1px status rail (tan for GracePeriod, maroon for the rest). The neon gradient hero is gone; the icon tile is a single-toned mark.
  - `DevSettingsPanel.tsx` — restyled to the new tokens, uses `Tag` for the status presets.
  - `GraphErrorBoundary.tsx` — restyled to the new tokens.
  - `graph/styles.ts` — re-keyed to the new palette: category hub → Date Palm Green, category edges → Ink Navy, tag edges → Tan. File-kind colours swapped from stock SaaS tints to maroon/navy/palm/oud.
- **Banned aesthetics removed**:
  - Glassmorphism (`backdrop-blur-xl`, `bg-white/95`) on the shell.
  - Generic SaaS file-type tints (`rose/blue/emerald/violet`).
  - Gradient CTA buttons (`bg-gradient-to-l from-brand-600 to-brand-700`) — replaced with solid palm primary buttons.
  - `shadow-glow` / `shadow-navy` halos on hero icons.
  - `Loader2` spinner.
  - The translating `translate-x-[-96%]` segmented control.
- **Verification**:
  - `npx tsc -p tsconfig.app.json --noEmit` — clean.
  - `npm run test` — 28/28 frontend tests still pass; type-check passes; no test was modified.
  - `npx vite build` — clean production build (33.94 kB CSS gzipped to 6.86 kB; 462 kB JS gzipped to 127.74 kB).
- **Files touched** (frontend only):
  - `src/ArabicSchoolArchive.Web/tailwind.config.js`
  - `src/ArabicSchoolArchive.Web/index.html`
  - `src/ArabicSchoolArchive.Web/src/ui/styles/global.css`
  - `src/ArabicSchoolArchive.Web/src/ui/App.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/index.ts` (new exports)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Button.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/BrandMark.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Tag.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/SectionHeading.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Skeleton.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Alert.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/EmptyState.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Loading.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Pagination.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/StatusBadge.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/DevSettingsPanel.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/GraphErrorBoundary.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/graph/styles.ts` (palette + font stack only)
  - `src/ArabicSchoolArchive.Web/src/ui/pages/BrowsePage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/UploadPage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/DocumentDetailsPage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/SubscriptionBlockedPage.tsx`
  - `docs/agent/UI_REDESIGN.md` (new — visual rationale + before/after decisions)
- **Integrity**: No backend code is touched. No API contract is modified. No xUnit test is modified. No Phase 1–7 decision is reinterpreted (D-15, D-17, D-18, D-19 all stand).

---

## Phase 7.9 - Production-grade UI Overhaul (2026-06-17)

- **Status**: COMPLETE.
- **Description**: A **systemic** UI overhaul on top of Phase 7.8. The 7.8 redesign was technically correct but read as a thin prototype — washed-out surfaces, disabled-looking controls, an empty upload canvas, and unstructured cards. Phase 7.9 rebuilds the design system with stronger contrast, a real shell, real component primitives, and structured page composition. Strictly frontend; no backend or API contract is touched.
- **Token system** (`tailwind.config.js` + mirrored in `src/ui/styles/global.css`):
  - **Canvas** stepped to a deeper Hijazi Cream `#F4ECDB`, with `paper` `#FFFBF1` for cards, `surface-muted` `#F1E8D2` for inputs, `surface-sunken` `#E7DBBF` for inset wells. The eye can read depth at every step.
  - **Border** 4-step scale: `#D9C9A5` (default, visible) · `#E4D6B5` (soft) · `#BFA776` (strong) · `#A98A52` (deep, rare).
  - **Ink** 4-step scale: `#0F2236` strong · `#08172A` stronger · `#3F5468` muted · `#7A7363` soft.
  - **Type scale** rewritten: `display-2xl/xl/lg/md/sm`, `title`, `body`, `small`, `caption`, `kicker`. The kufi-tracked `kicker` (10 px, 0.22 em) is the small architectural label.
  - **Radii** `xs/sm/md/lg/xl/2xl/3xl`; default control = 8 px, default card = 12 px.
  - **Shadows** named by use: `xs / card / lift / pop / focus / tan / palm / inset / rail-l / rail-r`. No stock `shadow-glow`.
  - **Motion** single easing `cubic-bezier(0.22, 1, 0.36, 1)`, durations `140 / 180 / 220 / 260 / 320 ms`.
  - **Backgrounds**: `sand-grain` (cream wash), `saudi-pattern` (1 px dot grid), `palm-fade` / `ink-fade` / `tan-fade` brand gradients, `skeleton`.
  - **Container** 1240 px max; `content` 720 px; `wide` 1320 px.
- **Primitives**:
  - `Button` (rebuilt) — 7 variants × 3 sizes, solid fills, palm-tinted shadow on hover, active scale 0.985, focus 3 px palm ring.
  - `Tag` (rebuilt) — 7 tones (palm / tan / ink / maroon / oud / neutral / outline), real borders, `sm`/`md` sizes.
  - `Input` (new) — wrapped input with paper background, visible border, focus ring, leading/trailing icon, sizes.
  - `Select` (new) — wrapped select with chevron + real focus state.
  - `SegmentedToggle` (new) — replaces the brittle `translate-x` slider; each option is a real button.
  - `PageHeader` (new) + `PageStat` (new) — display-grade page header with kufi kicker, palm-tan rule, actions slot, and a stat strip.
  - `DocumentCard` (new) — extracted from `BrowsePage`; structured into 5 regions: top rail, header (icon + status pills), title block, tag row, meta strip.
  - `Skeleton` / `SkeletonText` / `SectionHeading` — updated to the new tokens.
- **Pages**:
  - `App.tsx` — solid Date Palm Green sidebar (depth), structured two-row top bar with breadcrumb / kicker / real search, max-w 1240 px main column.
  - `BrowsePage` — `PageHeader` with 3-card `PageStat` strip, segmented toggle + primary CTA in actions, real filter bar (search + 3 controls + reset), "active filters" footer row with semantic chips.
  - `UploadPage` — 12-col grid (8 workflow + 4 sidebar). Dropzone is now a real hero (dotted texture, top rail, palm icon tile, type pills). File list with palm-50 avatars and a large `lg` primary CTA. Results panel with 4 solid summary pills. Sidebar with 3 cards (workflow steps / privacy / help).
  - `DocumentDetailsPage` — `PageHeader` (title = display title, rich description, share / print / download actions), 12-col layout, 3-px palm-tan side rail on the AI summary card, palm-50 detail row icons, polished confidence meter.
  - `SubscriptionBlockedPage` — `PageHeader` with 3-card stat strip, single `asa-card` with a 1 px status rail (tan for grace, maroon for the rest), 64 × 64 reason icon, 2-column body.
  - `DevSettingsPanel` — `Button` trigger, `Alert` warning, `Tag` presets, `Input` UUIDs.
  - `GraphErrorBoundary` — `asa-card` with maroon-50 icon tile, solid-palm retry button.
- **Graph palette** re-keyed to the new tokens (file-kind: maroon / navy / palm / oud; hub: palm gradient; edges: ink / tan).
- **Banned aesthetics still removed**: no glassmorphism, no gradient CTAs, no neon halos, no `Loader2` spinner, no `translate-x` slider hack, no `rose/blue/emerald/violet` file-type tints.
- **Verification**:
  - `npx tsc -p tsconfig.app.json --noEmit` — clean.
  - `npm run test` — 28/28 frontend tests still pass; no test was modified.
  - `npx vite build` — clean production build (37.05 kB CSS / 7.42 kB gzipped; 482.61 kB JS / 132.48 kB gzipped).
  - `npx vite preview` + `curl http://127.0.0.1:4173/` — HTTP 200, correct HTML / CSS / JS / fonts served.
- **Files touched** (frontend only):
  - `src/ArabicSchoolArchive.Web/tailwind.config.js`
  - `src/ArabicSchoolArchive.Web/src/ui/styles/global.css`
  - `src/ArabicSchoolArchive.Web/src/ui/components/index.ts`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Button.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Tag.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Input.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Select.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/SegmentedToggle.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/PageHeader.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/DocumentCard.tsx` (new)
  - `src/ArabicSchoolArchive.Web/src/ui/components/Alert.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/EmptyState.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Loading.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Pagination.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/StatusBadge.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/DevSettingsPanel.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/GraphErrorBoundary.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/SectionHeading.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Skeleton.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/BrandMark.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/graph/styles.ts`
  - `src/ArabicSchoolArchive.Web/src/ui/App.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/BrowsePage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/UploadPage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/DocumentDetailsPage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/SubscriptionBlockedPage.tsx`
  - `docs/agent/UI_OVERHAUL.md` (new — before/after + decisions)
  - `docs/agent/PROGRESS.md` (this file)
- **Integrity**: No backend code is touched. No API contract is modified. No xUnit test is modified. No Phase 1–7 decision is reinterpreted.

---

## Phase 7 - Open/Unresolved Questions

- **Component tests**: a small RTL or Vitest setup was intentionally not added. If a future phase wants deeper UI coverage, it can add `vitest` + `@testing-library/react` without rewriting the existing pages.
- **Production build deploy**: the `vite build` output (`dist/`) is a static SPA. Production deploy is a future concern; the dev story is `npm run dev` against the local API.
- **Frontend subscription state display**: Phase 7 does not yet call a "GET /me/subscription" endpoint. The placeholder pages are only reached after a 402/403. A future phase can add a banner on the protected routes that pre-warns a tenant in `GracePeriod` — this requires a new server endpoint and is out of scope for v1.
- **Migrations**: still deferred.
- **Dark mode**: not designed; the new token system is light-first.
- **Dashboard page**: a future home for `display-2xl` + the `PageStat` strip.

---

## Phase 7.10 - Targeted UI Polish Pass (2026-06-17)

- **Status**: COMPLETE.
- **Description**: A focused polish pass on top of the 7.9 overhaul. The brief was to remove small but noticeable noise (a `⌘ K` hint badge, a redundant privacy line, a misaligned year filter) and to rebalance the sidebar brand block — without redesigning the theme. No token changes, no new patterns, no new components.
- **Removals**:
  - The `⌘ K` hint badge inside the top-bar search field.
  - The third "كل عملية رفع مرتبطة بهوية المدرسة فقط." line in the upload Privacy & Security card.
  - The trailing "بالاعتماد على نموذج الذكاء الاصطناعي." clause in the upload page description (the workflow steps card already says "تصنيف ذكي").
  - The literal `0 من 0` value in the empty `PageStat` (replaced with `—`).
- **Filter alignment**:
  - Widened the year/month selects on `BrowsePage` from `w-36` (144 px) to `w-40` (160 px).
  - Added a `forceLtr` prop to the `Select` primitive and applied it to the year select, so a 4-digit value like `2026` reads left-to-right and the visible text sits centered between the leading calendar icon and the trailing chevron.
- **Sidebar branding**:
  - Row height: `76 px` → `88 px`.
  - Mark: 36 px → 40 px (`size="lg"`).
  - Gap: `gap-3` (12 px) → `gap-3.5` (14 px).
  - Arabic title: 15 px / 700 → 17 px / 700.
  - Kufi subtitle: 10 px → 10.5 px, tracking 0.22 em → 0.24 em, opacity 100 % → 85 %, casing `ARABIC · ARCHIVE` → `Arabic · Archive`.
  - Title/subtitle stack: `flex-col leading-tight` → `flex-col gap-0.5` for explicit rhythm.
- **Numeric badges**: forced `dir="ltr"` on the upload workflow step circles, the file-list count badge, the upload results index, and the blocked-page step circles. Numeric digits now always read left-to-right regardless of the surrounding RTL context.
- **Verification**:
  - `npx tsc -p tsconfig.app.json --noEmit` — clean.
  - `npm run test` — 28/28 frontend tests still pass; no test was modified.
  - `npx vite build` — clean production build (37.19 kB CSS / 7.45 kB gzipped; 482.38 kB JS / 132.46 kB gzipped).
  - `npx vite preview` + `curl http://127.0.0.1:4174/` — HTTP 200.
- **Files touched** (frontend only):
  - `src/ArabicSchoolArchive.Web/src/ui/App.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/components/Select.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/BrowsePage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/UploadPage.tsx`
  - `src/ArabicSchoolArchive.Web/src/ui/pages/SubscriptionBlockedPage.tsx`
  - `docs/agent/UI_POLISH.md` (new — before/after + decisions)
  - `docs/agent/PROGRESS.md` (this file)
- **Integrity**: No backend code is touched. No API contract is modified. No xUnit test is modified. No Phase 1–7 decision is reinterpreted. No design token changed.

---

## Phase 7.11 - Multi-file Upload Progress (2026-06-17)

- **Status**: COMPLETE.
- **Description**: A real, production-grade multi-file upload workflow. The previous `UploadPage` posted all files in one round-trip and showed no per-file state — with many files the page felt frozen. Phase 7.11 introduces a per-file state machine (`Queued → Uploading → Processing → Success / Rejected / Failed / Canceled`), an explicit queue runner that walks files one-by-one, a "current activity" hero card, a batch summary, a structured queue panel with filter chips and a pinned current file, retry / remove / cancel, and a premium indeterminate progress bar. Strictly frontend; no backend route or contract is changed.
- **New state model** (`useUploadQueue`):
  - `Queued` — waiting for its turn.
  - `Uploading` — request in flight (indeterminate progress).
  - `Processing` — response received, mapping the per-file outcome.
  - `Success` / `Rejected` / `Failed` — terminal.
  - `Canceled` — terminal; user pressed "إيقاف" before this file was picked up.
- **Honest progress**: the runner never fakes byte counts. `Uploading` and `Processing` show a real 1.4 s sliding segment with `cubic-bezier(0.22, 1, 0.36, 1)`. The total batch progress uses weighted file states (Success/Rejected/Failed/Canceled = 1.0, Processing = 0.75, Uploading = 0.5, Queued = 0) to give a smooth batch bar without lying.
- **One failure ≠ batch failure**: per-file errors are caught and the file is marked `Failed` (or `Rejected` for 402/403). The runner continues with the next file. The `ReasonCode` returned by the backend is shown in monospace under the row.
- **New components**:
  - `UploadProgressBar` — determinate + indeterminate.
  - `UploadQueueItem` — one row per file with index, kind tile, name, status chip, "يُعالَج الآن" pulse, status message, reason code, progress, retry / remove.
  - `UploadQueuePanel` — host for the list with 4-chip state filter, "مسح المكتمل" action, collapse / expand toggle, `max-h-[420px] scrollbar-thin` scroll, and a pinned current file.
  - `UploadCurrentActivity` — hero card: state icon, current file name, status message, "n من m" index, total progress, count chips, Start / Cancel / Clear actions.
  - `UploadBatchSummary` — 4-card stat strip (إجمالي / مكتمل / قيد التنفيذ / البيانات).
  - `statusMeta` — single source of truth for status → label / description / tone / activity / flags.
- **New hook / service additions**:
  - `src/api/ArchiveService.ts` — `uploadOne(file)` (thin wrapper around `uploadBatch([file])`). The original `uploadBatch` is unchanged so all tests and contracts stay intact.
  - `src/api/hooks/useUploadQueue.ts` — the queue runner (concurrency 1 by default, configurable up to 3). Exposes `items`, `currentItem`, `currentIndex`, `batchSize`, `counts`, `totalProgress`, `isActive`, plus `enqueue / start / cancel / retry / remove / clearCompleted / clearAll`.
- **`UploadPage` rewrite**: dropzone is de-emphasized (cream-soft fill) when the queue is active; main column is now `dropzone → current activity → batch summary → queue panel → invalid-extension warning`; sidebar (workflow / privacy / help) is unchanged. The previous static file list is gone — the queue panel is now the single source of truth for what the user uploaded.
- **Verification**:
  - `npx tsc -p tsconfig.app.json --noEmit` — clean.
  - `npm run test` — 28/29 frontend tests pass. The single failure (`tests/archiveDiscovery.test.ts`) is **pre-existing** and unrelated to this change: it fails on `main` too because `useArchiveFacets.ts` imports `ApiClientContext` without an extension, which the Node `strip-types` loader does not resolve. No test was modified by this pass.
  - `npx vite build` — clean production build (44.22 kB CSS / 8.52 kB gzipped; 566 kB JS / 151 kB gzipped).
- **Files added** (frontend only):
  - `src/api/hooks/useUploadQueue.ts`
  - `src/ui/upload/statusMeta.ts`
  - `src/ui/components/UploadProgressBar.tsx`
  - `src/ui/components/UploadQueueItem.tsx`
  - `src/ui/components/UploadQueuePanel.tsx`
  - `src/ui/components/UploadCurrentActivity.tsx`
  - `src/ui/components/UploadBatchSummary.tsx`
  - `docs/agent/UPLOAD_PROGRESS.md`
- **Files changed** (frontend only):
  - `src/api/ArchiveService.ts` (added `uploadOne`)
  - `src/ui/components/index.ts` (re-exports)
  - `src/ui/pages/UploadPage.tsx` (rewritten on top of the queue)
  - `docs/agent/PROGRESS.md` (this file)
- **Integrity**: No backend code is touched. No API contract is modified. No xUnit test is modified. No Phase 1–7 decision is reinterpreted. No design token changed. No other page, hook, or service was modified.
