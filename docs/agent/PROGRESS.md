# PROGRESS.md - Project Progress Tracker

This document maps current progress, finalized technical specifications, pending reviews, and blocks for the **الأرشيف المدرسي العربي** (Arabic School Archive) project.

---

## Current Status
- **Current Phase**: **Phase 2 (Single-File Upload Implementation)**
- **Status**: **Phase 2 implementation complete. xUnit suite green (23/23). Awaiting Phase 2 review.**
- **Completion Percentage**: 
  - Phase 0: 100% (approved)
  - Phase 1 design: 100% (approved)
  - Phase 2 implementation: 100% (built, tested, pending review)

---

## Milestone Progress

| Phase | Milestone Name | Status | Target Date | Completed Date |
|:---:|:---|:---:|:---:|:---:|
| **0** | **Inspection, Governance & Safety Lock** | **APPROVED** | 2026-06-16 | 2026-06-16 |
| **1** | Upload Orchestration Design | **APPROVED** | 2026-06-16 | 2026-06-16 |
| **2** | Single-File Upload Implementation | **COMPLETE - AWAITING REVIEW** | 2026-06-16 | 2026-06-16 |
| **3** | Multi-File Upload & Partial Success | Pending | — | — |
| **4** | Archive Browsing, Search & Retrieval | Pending | — | — |
| **5** | Security Hardening | Pending | — | — |
| **6** | Subscription Enforcement | Pending | — | — |
| **7** | Gulf-School UI/UX Polish | Pending | — | — |

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
| Configuration | `Configuration/UploadOptions.cs`, `N8nOptions.cs`, `BlobOptions.cs` |
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

**Test result:** 23 of 23 passing (`dotnet test`).

### Phase 2 Implementation Notes
- DB layer: `UseSqlServer` when `ConnectionStrings:AzureSql` is set; otherwise `UseInMemoryDatabase` for local dev. No migration scripts in v1 — `EnsureCreated` is not invoked. Phase 3+ will add migrations.
- Auth: `[Authorize]` on the controller. `schoolId` is read from the `school_id` or `schoolId` claim; `userId` from `sub` / `NameIdentifier`. In Phase 2 a real JWT issuer is not configured — auth setup is a Phase 3+ concern.
- Blob path: built exclusively by `BlobStorageService.BuildObjectName`, which asserts the tenant prefix. The orchestrator never supplies a name from client input.
- Safe-name allowlist in code: `[A-Za-z0-9._-]` plus the Arabic Unicode block `U+0600`–`U+06FF` so Arabic filenames round-trip. This refines the Phase 1 `STORAGE_CONTRACT.md` allowlist text (which read as ASCII-only but the example showed Arabic preserved). Spec should be updated in a Phase 2 follow-up note to match.
- n8n timeout: 15 s for the classification call. Blob upload timeout: 30 s. Both match the Phase 1 contracts.
- DB write is the final action inside the orchestrator. Any exception from `SaveChangesAsync` produces a `DB_FAILED` result and an error log explicitly mentions "Blob orphan possible" so an operator can sweep the orphan.
- Multi-file support is intentionally not wired up. The controller binds a single `IFormFile`. A multi-file batch request will bind only one file. The Phase 3 loop will iterate `IFormFileCollection`.

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

---

## Open/Unresolved Questions
- **Spec drift (low severity)**: `STORAGE_CONTRACT.md` §2.2 lists the allowlist as `[A-Za-z0-9._-]` while §2.3 example preserves Arabic. Code implements both. Spec should be amended in a Phase 2 follow-up edit to read "ASCII + Arabic Unicode block `U+0600`–`U+06FF`".
- **Migrations**: No EF Core migrations created in Phase 2. Schema is created implicitly by EF Core at first run (via `EnsureCreated` if added) or manually via SQL. Phase 3 must add a proper migration.
- **Auth provider**: Controller expects a JWT with `school_id` and `sub` claims. No JWT issuer, no Key Vault wiring yet. Deferred to a later phase per the ROADMAP.

---

## Blocked Items
- **Phase 2 Gate**: Phase 3 multi-file loop is blocked until Phase 2 is reviewed.
