# TESTING.md - Testing Strategy

This document details the testing strategy, test suites, and validation steps for the **الأرشيف المدرسي العربي** (Arabic School Archive) project. Phase 2 has implemented the first slice of automated tests under `src/ArabicSchoolArchive.Tests/`. The remaining test categories are described here for forward planning and remain pending per the ROADMAP.

---

## 1. Test Architecture Overview

We will implement a testing hierarchy utilizing standard .NET testing frameworks (e.g., xUnit, Moq) and React testing libraries (e.g., Jest, React Testing Library) when the UI is added in Phase 3+.

```
[Unit Tests]          --> Validate individual business functions (e.g. extension filters, path generators)
[Integration Tests]   --> Test DB interactions, mock n8n webhook HTTP calls, mock Azure Blob Client
[System / Flow Tests] --> Verify sequential multi-file loops, tenancy boundary locks, and subscription gates
```

---

## 2. Phase 2 Implemented Tests

`dotnet test` in `src/ArabicSchoolArchive.Tests/` runs the following suites (23 tests, all green as of Phase 2 close).

### 2.1 `FileValidatorTests` (`Services/FileValidatorTests.cs`)
- Valid PDF passes.
- Empty filename rejected with `FILENAME_INVALID`.
- Filename with NUL byte rejected with `FILENAME_INVALID`.
- `.exe` rejected with `EXTENSION_NOT_ALLOWED`.
- Size above 20 MB rejected with `SIZE_EXCEEDED`.
- Zero-byte file rejected with `SIZE_EXCEEDED`.
- Disallowed MIME (e.g. `application/x-msdownload`) rejected with `MIME_MISMATCH`.
- `.docx` with correct MIME passes.
- `.png` image passes.

### 2.2 `BlobStorageServiceSafeNameTests` (`Services/BlobStorageServiceSafeNameTests.cs`)
- Arabic filename with spaces: spaces replaced with `_`, Arabic characters preserved.
- Special characters (e.g. `<>:"/\|?`) replaced with `_`.
- Multiple underscores collapsed.
- Leading dots stripped.
- Empty input falls back to `file`.
- Long filename truncated to ≤ 100 characters.
- `BuildObjectName` produces a path starting with `schools/{schoolId}/archive/{yyyy}/{MM}/{documentId}_`.

### 2.3 `UploadOrchestratorTests` (`Orchestrator/UploadOrchestratorTests.cs`)
- **Complete success path** — n8n OK, Blob OK, DB OK. Asserts: response `Success`, row exists in `Archives`, `category` and `originalName` echoed, `blobUri` non-null.
- **Validation failure** — `.exe` rejected. Asserts: response `Rejected`, `documentId` is null, n8n never called, Blob never called, no DB row.
- **n8n failure** — n8n returns `N8N_TIMEOUT`. Asserts: response `Failed` with `N8N_TIMEOUT`, Blob never called, no DB row.
- **Blob failure** — n8n OK, Blob returns failure. Asserts: response `Failed` with `BLOB_FAILED`, no DB row.
- **DB failure after Blob success** — n8n OK, Blob OK, repository throws. Asserts: response `Failed` with `DB_FAILED`.
- **Original name preserved** — Arabic filename round-trips into `originalName` field untouched.
- **Blob URI has tenant prefix** — `blobUri` starts with `schools/{authenticatedSchoolId}/`.

These tests use:
- `InMemoryDatabase` for the DB layer (per-test isolated database name).
- `Moq` for `IN8nClient` and `IBlobStorageService`.
- A test-only `ThrowingDbContext` for the DB-failure test.

---

## 3. Forward Test Specifications (Pending Implementation)

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

### Security Regression Tests
- **MIME-Spoofing Detection**: Rename `malware.exe` to `report.png` and upload. Assert that binary MIME inspectors reject the file.
- **Path Traversal Prevention**: Upload a file named `../../etc/passwd`. Assert that path sanitize logic converts this to a safe GUID-based format.
