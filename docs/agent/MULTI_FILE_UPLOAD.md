# MULTI_FILE_UPLOAD.md - Multi-File Upload Orchestration

This document details the application-layer orchestration designed to handle multiple file uploads within the **الأرشيف المدرسي العربي** (Arabic School Archive) system.

---

## 1. The Multi-File Challenge & Solution

- **Infrastructure Limitation**: The n8n automation webhook receives and processes exactly **one** file per HTTP request (via `multipart/form-data` with a form field named `file`).
- **Application Orchestrator**: The ASP.NET Core backend is responsible for receiving the client-submitted multi-file collection, looping through them one-by-one, and coordinating separate sequential requests to n8n, storage, and database.
- **No Global Transactions**: There is no all-or-nothing transaction covering the entire batch. If a user uploads five files and two fail classification, the three successful uploads are retained and saved in the archive. The two failures are reported back to the user with exact details.

---

## 2. Concrete API Response Shape

The endpoint `POST /api/v1/archive/upload` must return a structured JSON response containing overall batch metrics and a detailed array of results for every file submitted.

```json
{
  "totalFiles": 3,
  "successfulFiles": 2,
  "failedFiles": 1,
  "results": [
    {
      "originalName": "تقرير_الغياب_2026.pdf",
      "status": "Success",
      "message": "تم أرشفة الملف بنجاح وتصنيفه كـ 'تقرير إداري'",
      "documentId": "4a3b1d2e-07d7-4729-996b-66b002e885d9",
      "category": "تقرير إداري"
    },
    {
      "originalName": "كشف_الدرجات.xlsx",
      "status": "Success",
      "message": "تم أرشفة الملف بنجاح وتصنيفه كـ 'كشف درجات الطلاب'",
      "documentId": "9f8e7d6c-5b4a-3c2b-1a09-87654321fedc",
      "category": "كشف درجات الطلاب"
    },
    {
      "originalName": "برنامج_ملغوم.exe",
      "status": "Rejected",
      "message": "فشل التحميل: نوع الملف غير مدعوم (EXE)",
      "documentId": null,
      "category": null
    }
  ]
}
```

### Response Property Rules
- **Total Metrics**: Must explicitly output:
  - `totalFiles`: The integer count of all files received in the upload request.
  - `successfulFiles`: The integer count of files successfully classification-uploaded-and-DB-saved.
  - `failedFiles`: The integer count of files rejected or failed during sequential flow steps.
  - `results`: The array of objects containing detailed results per file.
- **Filename Preservation**: **The original filename must always be preserved in the per-file result object.** The value of `originalName` must exactly match the original string sent by the client.
- **Status Key**: One of these states: `Success`, `Rejected` (failed validation), or `Failed` (failed runtime processing like n8n timeout or storage error).
- **Message Key**: User-friendly Arabic text explaining the result or the precise failure reason.

---

## 3. Per-File Lifecycle States

```
[Pending] ──> [Validating] ──┬──(Fails Validation)──> [Rejected]
                             └──(Passes) ──> [Processing n8n] ──┬──(n8n Fails) ──> [Failed]
                                                                └──(n8n Success) ──> [Uploading Blob] ──┬──(Blob Fails)──> [Failed]
                                                                                                        └──(Blob Success) ──> [Saving DB] ──┬──(DB Fails)──> [Failed]
                                                                                                                                            └──(DB Success) ──> [Success]
```

---

## 4. Execution Ordering & Concurrent Limits
- **Loop Strategy**: To prevent server thread exhaustion, the sequential loop is asynchronous.
- **Client UX Expectation**:
  - The React frontend displays a list of selected files.
  - During upload, a detailed progress list shows status indicators next to each file.
  - Upon receiving the backend response array, the frontend maps the `status` and `message` properties back to the visual list by matching the `originalName` key.
  - Files with `Success` display with a green checkmark.
  - Files with `Rejected` or `Failed` show with a red warning, displaying the exact Arabic `message` return value so the user knows exactly why the file was rejected (e.g. file size exceeded or invalid file type).
