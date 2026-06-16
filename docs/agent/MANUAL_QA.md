# MANUAL_QA.md - Manual QA Validation Scenarios

This document provides step-by-step scripts and checklists for manual QA testing of the **الأرشيف المدرسي العربي** (Arabic School Archive) application.

---

## QA Scenario Index

| ID | Scenario Title | Objective | Expected Result | Pass/Fail |
|:---:|:---|:---|:---|:---:|
| **QA-01** | Single File Upload Success | Verify standard single-file upload path. | File archived, metadata in DB. | — |
| **QA-02** | Single File n8n Failure | Verify backend aborts if n8n classification fails. | No blob uploaded, no DB metadata row. | — |
| **QA-03** | Single File Blob Storage Failure | Verify backend aborts if Blob Storage fails. | No DB metadata row. | — |
| **QA-04** | DB Write Failure After Blob Success | Verify `DB_FAILED` returned, orphan flagged in logs. | Response is `Failed` with `DB_FAILED`. | — |
| **QA-05** | Unsupported Type Rejection | Upload restricted extensions (e.g., `.exe`). | API returns `Rejected` with `EXTENSION_NOT_ALLOWED`. | — |
| **QA-06** | Oversized File Rejection | Upload a 21 MB file. | API returns `Rejected` with `SIZE_EXCEEDED`. | — |
| **QA-07** | Cross-Tenant Read Check | Attempt to access another school's document ID. | Access denied (`403 Forbidden`). | Pending (Phase 4) |
| **QA-08** | Multi-File Mixed Upload | Verify batch uploads return granular statuses. | Successes saved, failures reported. | Pending (Phase 3) |
| **QA-09** | Expirations UX Placeholder | Verify UI lock screen when subscription expired. | Display renewal screen, block access. | Pending (Phase 6) |

---

## Detailed Scenario Scripts

### QA-01: Single File Upload Success
1. Configure the API to point at a real n8n endpoint and Azure Blob container.
2. Issue a JWT carrying the `school_id` and `sub` claims for School A.
3. `curl -F file=@official_report.pdf -H "Authorization: Bearer <jwt>" http://localhost:5000/api/v1/archive/upload`
4. Assert HTTP 200 with body:
   ```json
   {
     "originalName": "official_report.pdf",
     "status": "Success",
     "category": "...",
     "documentId": "...",
     "blobUri": "schools/{schoolId}/archive/{yyyy}/{MM}/{guid}_official_report.pdf"
   }
   ```
5. Verify the file is present in Azure Blob under the path above.
6. Verify the `Archives` SQL table has a row with the matching `document_id`, `school_id`, and `category`.

### QA-02: Single File n8n Failure
1. Configure n8n to return HTTP 500 (or use a mock that returns 500).
2. Issue a valid JWT for School A and POST a small `.pdf`.
3. Assert HTTP 200 with body:
   ```json
   { "status": "Failed", "reasonCode": "N8N_HTTP_ERROR", "documentId": "..." }
   ```
4. Assert the Azure Blob container has no new object for this attempt.
5. Assert the `Archives` table has no new row.

### QA-03: Single File Blob Storage Failure
1. Configure a real n8n returning `200 OK` with a `category`.
2. Configure the Blob connection to point at an invalid container or invalid credentials so the upload throws.
3. POST a small `.pdf`.
4. Assert HTTP 200 with `status: "Failed"`, `reasonCode: "BLOB_FAILED"`, `category` present (from n8n), `blobUri: null`.
5. Assert the `Archives` table has no new row.

### QA-04: DB Write Failure After Blob Success
1. Configure a real n8n and a working Blob container.
2. Force the DB insert to fail (e.g. set a unique-constraint conflict, drop the connection mid-call).
3. POST a small `.pdf`.
4. Assert HTTP 200 with `status: "Failed"`, `reasonCode: "DB_FAILED"`, `category` present, `blobUri` populated.
5. Inspect logs for the line containing "Blob orphan possible" so the operator can sweep the orphan in a later maintenance job.
6. (Acceptance) The response must **not** report `Success`. The Blob object is now orphaned and is expected to be cleaned by a future sweep job (not in v1).

### QA-05: Unsupported Type Rejection
1. Issue a valid JWT for School A.
2. POST a `.exe` file (any size > 0).
3. Assert HTTP 200 with `status: "Rejected"`, `reasonCode: "EXTENSION_NOT_ALLOWED"`, `documentId: null`.
4. Assert the Blob container has no new object.
5. Assert the `Archives` table has no new row.

### QA-06: Oversized File Rejection
1. Issue a valid JWT for School A.
2. POST a 21 MB `.pdf` (Kestrel will reject the entire request at the body limit).
3. Assert HTTP 400 with `code: "BODY_TOO_LARGE"` (request-level rejection).
4. (Variant) POST a 19.5 MB `.pdf` plus a multipart wrapper that nudges the body over the 25 MB cap. Assert HTTP 400 `BODY_TOO_LARGE`.

### QA-07: Cross-Tenant Read Check
Pending Phase 4. The download endpoint is not yet built.

### QA-08: Multi-File Mixed Upload
Pending Phase 3. The current controller binds a single `IFormFile` and ignores additional parts.

### QA-09: Expirations UX Placeholder
Pending Phase 6.
