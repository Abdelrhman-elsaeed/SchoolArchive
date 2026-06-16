# BUGS.md - Bug & Risk Registry

This document registers active bugs, logs bug histories, and tracks critical architectural and operational risks for the **الأرشيف المدرسي العربي** (Arabic School Archive) system.

---

## Bug Template

When reporting a new bug, please use the following structure:

```markdown
### [BUG-XX] [Short Title]
- **Status**: [Open / In Progress / Resolved]
- **Severity**: [Critical / High / Medium / Low]
- **Found In Phase**: [Phase X]
- **Description**: Detailed description of the defect.
- **Steps to Reproduce**:
  1. Action 1
  2. Action 2
- **Expected Behavior**: What should have happened.
- **Actual Behavior**: What actually happened.
- **Root Cause**: Explanation of why the bug occurred (if investigated).
- **Resolution / Fix Notes**: Details of the code changes made to resolve the bug.
```

---

## Active Bugs
*No active bugs registered.* (System is in Phase 0: planning and documentation only, no executable code exists yet).

---

## Known Risks & Expected Architecture/Workflow Risks

This section documents structural risks identified during Phase 0 that require mitigations in subsequent design phases.

### [R-01] Orphaned Database Rows on Transient Failures
- **Risk**: If the sequential upload flow executes out of order (e.g. database metadata saved before storage is confirmed), a transient storage failure leaves orphaned rows in SQL DB pointing to missing files.
- **Severity**: Medium
- **Mitigation Requirement**: Under no circumstances should an n8n-success / Blob-failed transient state generate SQL database rows. The database write must be the final action, executed only when storage returns success.

### [R-02] school_id Leakage in Database Queries
- **Risk**: Developers writing queries in the repository layer may forget to append `WHERE school_id = X` filters, allowing one school to read or download documents belonging to another school.
- **Severity**: Critical
- **Mitigation Requirement**: Must employ automated EF Core Global Query Filters scoped to the authenticated tenant. Manual controller fetches must execute verification assertions. Any boundary leakage is treated as a Critical Security incident.

### [R-03] n8n Webhook Latency & Thread Blocking
- **Risk**: Calling n8n synchronously over HTTP inside the sequential upload loop blocks backend worker threads. If n8n runs slow (due to CPU load or network bottleneck), requests will pile up, leading to app-wide response timeouts.
- **Severity**: Medium
- **Mitigation Strategy**:
  - Configure tight HTTP client timeouts (e.g. max 15 seconds) when calling n8n.
  - Ensure the sequential loop executes asynchronously to free up worker threads during network I/O.
