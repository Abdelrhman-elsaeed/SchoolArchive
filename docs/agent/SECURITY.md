# SECURITY.md - Security Baseline & Guidelines

This document establishes the security principles, isolation parameters, file validation constraints, and threat mitigation procedures for the **الأرشيف المدرسي العربي** (Arabic School Archive) system.

---

## 1. School Isolation Enforcement Rules

To ensure complete tenancy data protection, the following isolation rules are enforced programmatically. 

- **Database Row Scoping**: Every business record in the application database (e.g. `Archives`, `Categories`, `Tags`, `AuditLogs`) MUST be scoped by a `school_id` foreign key column. There will be no global un-scoped school tables.
- **Protected Queries Scoping**: Every database query executed by the application backend must explicitly filter by the authenticated user's `school_id`.
  - *EF Core Implementation*: Global Query Filters must be configured on all tenant-specific entities to automatically append `WHERE school_id = context.CurrentSchoolId` to all generated SQL queries.
  - *Bypass Prevention*: Raw SQL execution or direct repository access must include assertions to verify that filtering is applied.
- **Blob Storage Path Scoping**: All physical files stored in Azure Blob Storage must reside inside a directory structure prefixed by the school's ID:
  `schools/{schoolId}/archive/{yyyy}/{MM}/{guid}_{safeFileName}`
  Paths that bypass the `schools/{schoolId}/` namespace are strictly prohibited.
- **No Public Blob Access**: The Azure Blob Storage container access level must be configured to **Private** (no public access allowed). 
- **Server-Side Access Authorization**:
  - The actions of opening or downloading archived documents must be validated and authorized server-side on every request.
  - The backend must confirm the requesting user's `school_id` matches the document record's `school_id` database field before issuing a transient Shared Access Signature (SAS) token.
  - SAS tokens must expire in 5–15 minutes and grant read-only permissions.

---

## 2. Safe File Validation Pipeline

All uploaded files must pass a multi-stage validation check on the application server before invoking n8n or writing to storage:

```
[Upload Request]
       │
       ▼
[Extension Allowlist Check] ──(Fails)──> [Abort 400]
       │
       ▼
[Size Validation (Max 20MB)] ──(Fails)──> [Abort 400]
       │
       ▼
[MIME-Type Verification] ──(Fails)──> [Abort 400]
       │
       ▼
[Filename Sanitization] ───> [Proceed to n8n]
```

1. **Extension Allowlist**:
   - Only these extensions are accepted: `.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`, `.jpeg`.
   - All other extensions (including `.exe`, `.dll`, `.bat`, `.js`, `.zip`, `.tar.gz`) are strictly rejected.
2. **Size Validation**:
   - Files are rejected immediately if they exceed the maximum configured threshold (Default: 20 MB).
3. **MIME-Type Verification**:
   - The server must read the file header stream to verify MIME type headers instead of relying solely on the file extension.
   - Example mapping:
     - `.pdf` must have MIME `application/pdf`
     - `.docx` must have MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
4. **Filename Sanitization & Randomization**:
   - User-supplied filenames are never used as physical storage keys.
   - Filenames are randomized at rest using: `guid_safeFileName` where `safeFileName` is regex-cleaned of spaces and non-alphanumeric characters.

---

## 3. Server-Side Gatekeeping

- **Zero Client Trust**: All authorization, subscription validations, and business logic limits are computed and enforced **server-side only**.
- **Subscription Checks**: The API gateway/middleware verifies the school's billing status before running any route logic. If a subscription is expired and the 7-day grace period has elapsed, the request is hard-blocked at the middleware layer. Client-side state indicators are used purely for presentation.

---

## 4. Audit Logging & Secrets Handling

- **Audit Log Contract**: Every security-critical action must write a record to the system audit log (saved in a read-only table):
  - Action (e.g., File Upload, SAS Token Generated, File Deleted, Tenant Change)
  - Execution timestamp
  - Performing User ID and School ID
  - Target Document ID
  - Source IP Address
- **Secrets Management**: Credentials, database connection strings, Azure storage accounts, and n8n webhook secrets must **never** be hardcoded in code files or committed to Git.
  - Local development: Handled in environment settings.
  - Production: Managed through Azure Key Vault and injected via Azure Container App configuration bindings.
- **Least Privilege Principle**:
  - The application database user must be restricted from DDL commands at runtime (no `DROP TABLE` or schema modifications).
  - The storage connection credentials must be scoped down strictly to actions within the archive container, not full storage account administration.

---

## 5. Future Hardening Hook: Malware Scanning
- We plan to integrate a malware scan hook in Phase 5. The sequential workflow allows inserting an Azure Defender for Storage check or a custom Antivirus container API call (e.g. ClamAV) directly after the file passes MIME-type checks and before it is uploaded to Azure Blob.
