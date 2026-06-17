# DB_SCHEMA_PLAN.md - Database Row Contract

This document specifies the database row contract for the **أرشيف المدرسة** (Arabic School Archive) upload pipeline. It is design-only and contains no DDL, no entity classes, no migration scripts, and no EF Core configuration. Phase 2+ implementation will translate this contract into code.

This document refines the schema hints scattered across `DECISIONS.md` and `DATA_FLOW.md` into a single authoritative row contract.

---

## 1. Scope and Tables

The minimum table set required by the upload pipeline is:

| Logical name | Purpose | Tenant-scoped? |
|:---|:---|:---:|
| `Archives` | One row per successfully uploaded file | Yes |
| `SubscriptionStates` (read-only here, owned by Phase 6) | Subscription status cache | Yes (per school) |

This document specifies the `Archives` row contract. `SubscriptionStates` is referenced only for the future placement of the subscription check (see `UPLOAD_CONTRACT.md` § 10) and is **not** part of the upload pipeline schema in Phase 1.

The `Archives` table is the **only** table written by the upload orchestration. There is no separate `UploadAttempts` or `UploadAudit` table in v1; failures are observable in application logs and structured response payloads.

---

## 2. The `Archives` Row Contract

### 2.1 Column Specification

| # | Column name | SQL type | Nullable | Default | Description |
|:---:|:---|:---|:---:|:---:|:---|
| 1 | `document_id` | `UNIQUEIDENTIFIER` | No | (server-generated) | Primary key. UUID v4 allocated in the backend before the n8n call. |
| 2 | `school_id` | `UNIQUEIDENTIFIER` | No | (none) | Tenant scope. Always equal to the authenticated `schoolId`. Carries EF Core Global Query Filter. |
| 3 | `original_name` | `NVARCHAR(512)` | No | (none) | The exact original filename from the client, **preserved verbatim**. Never sanitized. |
| 4 | `safe_name` | `NVARCHAR(255)` | No | (none) | The sanitized form used inside the Blob object name. Spaces → `_`; non-`[A-Za-z0-9._-]` → `_`; truncated to 100 chars. |
| 5 | `blob_object_name` | `NVARCHAR(1024)` | No | (none) | Full Blob object name: `schools/{schoolId}/archive/{yyyy}/{MM}/{document_id}_{safe_name}`. |
| 6 | `size_bytes` | `BIGINT` | No | (none) | Size in bytes of the original file. Range: 1 to 20 MB (configurable upper bound enforced before insert). |
| 7 | `mime_type` | `NVARCHAR(127)` | No | (none) | Verified MIME type (server-side magic bytes check, Phase 5 will harden). |
| 8 | `category` | `NVARCHAR(127)` | Yes | `NULL` | n8n classification label. Populated from n8n response on success. |
| 9 | `uploaded_by_user_id` | `UNIQUEIDENTIFIER` | No | (none) | Authenticated user id (sub claim) at the time of upload. |
| 10 | `uploaded_at_utc` | `DATETIME2(7)` | No | (none) | Server timestamp at the moment the row is inserted. UTC. |
| 11 | `processing_year` | `INT` | No | (none) | `YEAR(uploaded_at_utc)`. Denormalized for the Blob-path year segment; avoids runtime `FORMAT` cost in queries. |
| 12 | `processing_month` | `TINYINT` | No | (none) | `MONTH(uploaded_at_utc)`. Denormalized for the Blob-path month segment. Range 1–12. |
| 13 | `content_hash_sha256` | `CHAR(64)` | Yes | `NULL` | SHA-256 of the original file bytes. Computed during upload. Optional in v1 (used for future dedup and integrity checks). |
| 14 | `display_name` | `NVARCHAR(512)` | Yes | `NULL` | AI-generated human-friendly title (e.g., "شهادة تقدير للمعلم محمود احمد السعيد"). Populated from n8n response `display_name`. Falls back to `original_name` for display. |
| 15 | `summary` | `NVARCHAR(2048)` | Yes | `NULL` | AI-generated one-line summary of the document. Populated from n8n response `summary`. |
| 16 | `tags_json` | `NVARCHAR(MAX)` | Yes | `NULL` | AI/OCR-derived keyword tags as a JSON-serialized string array. EF Core primitive collection mapping. Populated from n8n response `tags`. Capped at 32 entries × 64 chars each. |
| 17 | `confidence` | `FLOAT` | Yes | `NULL` | AI classification confidence in `[0, 1]`. Populated from n8n response `confidence`. |
| 18 | `needs_review` | `BIT` | No | `0` | Set to `true` if n8n flagged the document for human review (`needs_review` field). Drives a warning badge in the UI. |

### 2.2 Constraints

| Constraint | Definition | Notes |
|:---|:---|:---|
| Primary Key | `PRIMARY KEY (document_id)` | Clustered index. UUID PK is fine at v1 scale; switching to `NONCLUSTERED` + clustered `(school_id, uploaded_at_utc)` is a Phase 4+ concern if write throughput becomes an issue. |
| Default `document_id` | **None** — backend supplies it. | Avoids `NEWID()` default so the same id is known to the Blob and n8n paths. |
| FK on `school_id` | `FOREIGN KEY (school_id) REFERENCES Schools(school_id) ON DELETE RESTRICT` | A school cannot be hard-deleted while it has archives. Cascading deletes are out of v1 scope. |
| FK on `uploaded_by_user_id` | `FOREIGN KEY (uploaded_by_user_id) REFERENCES Users(user_id) ON DELETE RESTRICT` | A user cannot be deleted while they have archives. |
| Check `size_bytes` | `CHECK (size_bytes > 0 AND size_bytes <= 20971520)` | Enforces the 20 MB cap at the DB level as a defense-in-depth measure. The application must reject larger files earlier, but the DB constraint catches any bug. |
| Check `processing_month` | `CHECK (processing_month BETWEEN 1 AND 12)` | Defends against garbage data. |
| Check `mime_type` | `CHECK (mime_type IN (...))` | Optional. If the team wants DB-enforced MIME allowlist, the list mirrors `API_CONTRACTS.md` § 4. Otherwise it is application-enforced. |
| Unique `(school_id, original_name, processing_year, processing_month, safe_name)` | Not enforced in v1 | Same-school can upload two files with the same name in different months; the `document_id` is always unique. A uniqueness constraint would surprise users. |
| NOT NULL `category` | No | n8n may return "Unclassified" but the row accepts NULL if the response is missing the field; UI labels as `غير مصنف`. |

### 2.3 Indexes

| # | Index | Columns | Type | Purpose |
|:---:|:---|:---|:---|:---|
| 1 | `PK_Archives` | `document_id` | Clustered | Primary access path. |
| 2 | `IX_Archives_School_UploadedAt` | `school_id, uploaded_at_utc DESC` | Nonclustered | Per-school recent-first listing (Phase 4 browsing). |
| 3 | `IX_Archives_School_Category` | `school_id, category, uploaded_at_utc DESC` | Nonclustered | Category browsing (Phase 4). |
| 4 | `IX_Archives_School_OriginalName` | `school_id, original_name` | Nonclustered | Name search (Phase 4). |
| 5 | `IX_Archives_ContentHash` | `content_hash_sha256` WHERE `content_hash_sha256 IS NOT NULL` | Nonclustered filtered | Optional future dedup. |
| 6 | `IX_Archives_School_DisplayName` | `school_id, display_name` | Nonclustered | AI-title search (Phase 7.9+). |
| 7 | `IX_Archives_School_Summary` | `school_id, summary` | Nonclustered | Summary search (Phase 7.9+). |

All nonclustered indexes are composite-prefixed by `school_id` to ensure index seeks never scan across tenants.

#### 2.3.1 Smart Search Behavior (Phase 7.9+)

The browse search filter (`OriginalNameContains`) performs a `LIKE '%needle%'` against **three** columns simultaneously, OR-combined:

1. `original_name` (the raw upload filename)
2. `display_name` (the AI-generated title)
3. `summary` (the AI-generated one-liner)

This makes the search robust: a user can find a شهادة تقدير by typing "معلم" even when the file was uploaded as `IMG_2034.PNG`.

### 2.4 EF Core Global Query Filter

The `Archives` DbSet must register a global query filter:

```
modelBuilder.Entity<Archive>().HasQueryFilter(a => a.SchoolId == _currentSchoolContext.SchoolId);
```

`_currentSchoolContext.SchoolId` is the request-scoped `ICurrentSchoolContext` resolved at the auth boundary. Bypasses (e.g., admin tooling) must use `IgnoreQueryFilters()` and be restricted to a separate, audited DbContext role.

---

## 3. The `SubscriptionStates` Reference Contract (Phase 6)

Documented for future placement only. Not part of the upload pipeline in Phase 1.

| Column | Type | Description |
|:---|:---|:---|
| `school_id` | `UNIQUEIDENTIFIER` PK | Tenant scope. |
| `status` | `NVARCHAR(20)` | One of: `Active`, `GracePeriod`, `Expired`, `Suspended`, `Canceled`. |
| `start_date_utc` | `DATE` | Subscription period start. |
| `end_date_utc` | `DATE` | Subscription period end. |
| `grace_period_days` | `INT` | Configurable per school; default 7. |
| `last_updated_utc` | `DATETIME2(7)` | Audit field. |

The `SubscriptionGuard` middleware reads this row (cached per request) and short-circuits with `402` when:
- `status = Suspended` → always locked.
- `status = Canceled` → always locked.
- `status = Expired` AND `today_utc > end_date_utc + grace_period_days` → locked.
- `status = Active` OR (`status = Expired` AND within grace period) OR `status = GracePeriod` → allowed.

The default `grace_period_days` is 7, configurable in application settings (`Subscription:DefaultGracePeriodDays`).

---

## 4. Row Insertion Contract (Step 4 of the Orchestration)

The DB insert for a single file is performed via the backend repository. The insert must be wrapped in the default EF Core transaction (READ COMMITTED). The insert uses server-allocated `document_id` (no DB default). The insert is the **last** step in the orchestration.

```
INSERT INTO Archives (
  document_id, school_id, original_name, safe_name, blob_object_name,
  size_bytes, mime_type, category,
  uploaded_by_user_id, uploaded_at_utc,
  processing_year, processing_month,
  content_hash_sha256,
  display_name, summary, tags_json, confidence, needs_review
) VALUES (
  @documentId, @schoolId, @originalName, @safeName, @blobObjectName,
  @sizeBytes, @mimeType, @category,
  @userId, SYSUTCDATETIME(),
  YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()),
  @contentHash,
  @displayName, @summary, @tagsJson, @confidence, @needsReview
);
```

The insert returns the persisted row. The response builder then composes the per-file result object (see `UPLOAD_CONTRACT.md` § 6.2).

**On insert failure:**
- The whole transaction is rolled back. No row.
- The Blob object remains an orphan. A `Failed` result with `reasonCode = DB_FAILED` is appended to the response.
- A log entry with `documentId`, `schoolId`, and the SQL error is emitted.

---

## 5. Row Update Contract (Out of Scope for v1)

Phase 1 does not design update semantics. The only write performed by the upload pipeline is INSERT. Any future UPDATE must:
- Be tenant-scoped (a WHERE clause that always includes `school_id = @currentSchoolId`).
- Be auditable (Phase 5 audit log).
- Not change `document_id`, `school_id`, or `uploaded_at_utc`.

These are forward-looking constraints only; no UPDATE is part of the upload contract.

---

## 6. Row Deletion Contract (Out of Scope for v1)

Phase 1 does not design delete semantics. The upload pipeline never deletes. If a row is ever deleted in the future, both the DB row and the Blob object must be removed in a coordinated way (a deferred concern). For now, archives are write-only.

---

## 7. Cross-Table Integrity Rules

- **Blob object existence vs DB row existence**: The DB row is the source of truth. A Blob object without a DB row is an orphan (failure residue). A DB row without a Blob object is a critical bug (must never happen because the DB write is gated on Blob success).
- **Per-school row count is uncapped in v1.** A future phase may add quota enforcement.
- **Per-school `original_name` is not unique.** Users may upload `report.pdf` multiple times in the same month.

---

## 8. Sample Rows (Illustrative, Not SQL)

### Successful row
```
document_id        : 4a3b1d2e-07d7-4729-996b-66b002e885d9
school_id          : 11111111-1111-1111-1111-111111111111
original_name      : "تقرير_الغياب_2026.pdf"
safe_name          : "تقرير_الغياب_2026.pdf"
blob_object_name   : "schools/11111111-1111-1111-1111-111111111111/archive/2026/06/4a3b1d2e-07d7-4729-996b-66b002e885d9_تقرير_الغياب_2026.pdf"
size_bytes         : 184234
mime_type          : "application/pdf"
category           : "تقرير إداري"
uploaded_by_user_id: 22222222-2222-2222-2222-222222222222
uploaded_at_utc    : 2026-06-16T10:15:30.1234567Z
processing_year    : 2026
processing_month   : 6
content_hash_sha256: "9b2c..."
display_name       : "تقرير غياب الفصل 3-أ - 16 يونيو 2026"
summary            : "تقرير يوضح نسب الغياب اليومية لطلاب الفصل 3-أ خلال الأسبوع الأول من يونيو 2026"
tags_json          : "[\"تقرير\",\"غياب\",\"طلاب\",\"فصل 3-أ\"]"
confidence         : 0.92
needs_review       : false
```

### Multi-file batch (three rows in the same batch, all success)
The `request_id` (from the response envelope) is **not** stored in `Archives` in v1. It is logged in the application log only. A future audit table may denormalize it.

---

## 9. Tenancy Invariants (Summary)

These invariants are enforced by the row contract, the query filter, and the controller. Bypassing any is a critical security incident.

1. Every row's `school_id` matches the authenticated `schoolId` of the request that inserted it.
2. Every query that reads `Archives` automatically filters by the current `schoolId` (Global Query Filter).
3. No code path can write a row with a `school_id` different from the controller-resolved value.
4. No code path can write a Blob object whose name does not start with `schools/{currentSchoolId}/`.
5. `document_id` is unique across the entire table (PK constraint), preventing cross-school collisions.

---

## 10. Out-of-Scope (Deferred)

- Soft-delete column (`is_deleted`, `deleted_at_utc`) — Phase 4 or later.
- Audit log table — Phase 5.
- Quota counters table — Phase 6.
- Tag/Category join tables — Phase 4 (browsing).
- File content storage in DB — explicitly forbidden (see `DECISIONS.md` § 2).
