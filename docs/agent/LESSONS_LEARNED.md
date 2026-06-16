# LESSONS_LEARNED.md - Lessons Learned Log

This document serves as a repository of knowledge, pattern guidelines, and architectural lessons learned during the lifecycle of the **الأرشيف المدرسي العربي** (Arabic School Archive) project.

---

## Standard Lesson Format

Every new lesson added to this document should adhere to the following structure:
```markdown
### [L-XX] [Short Title]
- **Context**: The situation or phase where this lesson was discovered.
- **Problem/Risk**: The negative impact or architectural issue encountered/planned for.
- **Resolution/Practice**: The design decision or standard pattern adopted to address it.
```

---

## Initial Lessons Log

### [L-01] Avoid High-Cost Per-School Physical Deployments in MVP
- **Context**: Phase 0 architectural planning regarding multi-tenancy.
- **Problem/Risk**: Creating isolated resource groups (individual Web Apps, SQL DBs, and storage accounts) for every Gulf school results in prohibitively high starting costs and makes system maintenance/updates unmanageable.
- **Resolution/Practice**: Implement logical tenancy. Host a single ASP.NET Core application and n8n instance, using `school_id` partitioning in database tables and folder routing in Azure Blob Storage. Defer physical/dedicated deployments to premium tiers.

### [L-02] Keep n8n Tasks Single-File and Loop in Application Layer
- **Context**: Handling multi-file batch uploads.
- **Problem/Risk**: Sending multiple files in a single payload to n8n increases schema complexity, leads to payload timeouts, and complicates error handling for partial failures (where some files classify successfully and others do not).
- **Resolution/Practice**: Keep the n8n endpoint focused on classifying exactly one file per request using a standard `multipart/form-data` payload. Let the ASP.NET Core backend loop through files one-by-one, handling network connections and validation failures sequentially.

### [L-03] Save Metadata in Database Last in the Flow
- **Context**: Ensuring transactional consistency without distributed transaction coordinators.
- **Problem/Risk**: Saving metadata to SQL before n8n classification or Blob storage upload results in orphaned DB records if the subsequent steps fail. Conversely, uploading to Blob storage and writing to the DB first could leave orphaned files in Blob storage if n8n subsequently rejects the upload.
- **Resolution/Practice**: Execute the sequence in order of dependency: validate locally -> execute n8n classification -> write physical file to Blob storage -> write metadata row to SQL DB. If any preceding step fails, do not write to SQL DB.

### [L-04] Enforce Document-First and Plan-First Governance
- **Context**: Developer agent onboarding and codebase lifecycle.
- **Problem/Risk**: Proposing code edits without documenting architectural impacts leads to design drift, database schema inconsistencies, and broken security boundaries.
- **Resolution/Practice**: Adhere strictly to the Phase rules. Do not begin coding (Phase 2+) until Phase 1 schemas are defined and signed off in `docs/agent/`. Always update Progress, Bugs, and Decisions alongside code changes.

### [L-05] Centralize Blob Path Construction Behind a Single Service
- **Context**: Phase 2 implementation of the upload orchestrator.
- **Problem/Risk**: If multiple components build Blob object names, an inconsistency in prefix formatting or sanitization will leak across schools. Path-traversal filenames (`../../etc/passwd`) or wrong tenant prefixes are silent correctness bugs.
- **Resolution/Practice**: A single `IBlobStorageService` owns the `BuildObjectName` and `BuildSafeName` methods. The orchestrator only passes the schoolId, documentId, original name, and timestamp. The service asserts the resulting path begins with `schools/{schoolId}/` and refuses to upload anything that does not. Phase 5 will add a unit test that pins this guard.

### [L-06] Inject a TimeProvider for Testable Timestamps
- **Context**: Phase 2 implementation of `UploadOrchestrator` and DB row insertion.
- **Problem/Risk**: Hard-coding `DateTime.UtcNow` makes the orchestrator's year/month denormalized columns and Blob object name non-deterministic in tests. Path and row behavior cannot be asserted.
- **Resolution/Practice**: Inject `TimeProvider` (registered as `TimeProvider.System` in `Program.cs`). Tests use the default `System` time provider but can swap to a fake in future tests. The orchestrator reads `_timeProvider.GetUtcNow().UtcDateTime` for the row and the Blob object name.

### [L-07] Use a Per-Test InMemoryDatabase Name to Isolate Test DB State
- **Context**: Phase 2 xUnit tests against `ArchiveDbContext`.
- **Problem/Risk**: `UseInMemoryDatabase("ArchiveDb")` with a fixed name causes test interference — rows from one test leak into another and produce flaky assertions.
- **Resolution/Practice**: Pass `Guid.NewGuid().ToString()` as the InMemory database name in the test fixture so each test instance has its own store. No shared state between tests.

### [L-08] Arabic Filename Preservation Requires the Sanitizer to Allow Arabic Unicode
- **Context**: Phase 2 `BlobStorageService` sanitizer implementation.
- **Problem/Risk**: The Phase 1 spec listed the allowlist as `[A-Za-z0-9._-]`, but the same spec's example preserved Arabic characters. A literal implementation of the allowlist strips every Arabic character and produces object names like `2026.pdf` for `تقرير الغياب 2026.pdf`. This corrupts the round-trip identity of archived files.
- **Resolution/Practice**: Implementation accepts the ASCII allowlist plus the Arabic Unicode block `U+0600`–`U+06FF`. The spec text in `STORAGE_CONTRACT.md` should be amended in a Phase 2 follow-up to match. Spec drift logged in `PROGRESS.md` open issues.

### [L-09] Tag DB-Failure Logs Explicitly as "Blob Orphan Possible"
- **Context**: Phase 2 `UploadOrchestrator` handling of repository exceptions.
- **Problem/Risk**: A `DB_FAILED` outcome is the only path in the orchestrator that leaves a Blob object behind. An operator triaging logs cannot tell apart "DB failed, blob is clean" from "DB failed, blob is orphaned" without reading stack traces.
- **Resolution/Practice**: The error log line for DB failure includes the literal phrase "Blob orphan possible" and the `documentId` and `objectName` so a future sweep job (Phase 4+) can grep for it. The orphan-sweep job itself is out of scope for v1.
