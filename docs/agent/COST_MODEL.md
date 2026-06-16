# COST_MODEL.md - Economical Infrastructure Blueprint

This document details the cost-aware infrastructure choices and tenancy hosting models for the **الأرشيف المدرسي العربي** (Arabic School Archive) project.

---

## 1. Approved Cost-Aware Architecture (v1 MVP)

To offer a competitive annual subscription price to Gulf schools, the system is designed to minimize baseline hosting costs. A dedicated environment per school is not financially viable in the initial phase. The MVP employs a **Shared Infrastructure** strategy:

```
                  ┌───────────────────────────────┐
                  │      Shared Frontend Client   │
                  │        (React Static CDN)     │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │    Shared Application Host    │
                  │   (Azure Container Apps ACA)  │
                  └───────────────┬───────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
┌───────────┐               ┌───────────┐               ┌───────────┐
│Shared n8n │               │Shared SQL │               │Shared Blob│
│  Cluster  │               │ Database  │               │  Storage  │
└───────────┘               └───────────┘               └───────────┘
```

- **Shared Application Instance**: A single running deployment of the ASP.NET Core Web API processes requests for all school tenants.
- **Shared n8n Cluster**: A single n8n execution worker handles the classification flows for all school uploads.
- **Shared Azure SQL Database**: All school records are kept in a single database, isolated using SQL indexes and queries filtered by `school_id`.
- **Shared Azure Blob Storage Account**: A single storage container hosts archived files, partitioned using virtual folders labeled by school identifier keys.

---

## 2. Serverless & Consumption Tiers

To align costs directly with application usage, the following hosting platforms are selected:
- **Azure Container Apps (Consumption Plan)**:
  - Charges are based on CPU and memory consumption per second.
  - Can scale to zero replicas when no traffic is active (e.g., during school holidays and late nights), reducing baseline idle costs to $0.
- **Azure SQL Database (Serverless Tier)**:
  - Automatically scales compute resources based on workload demand.
  - Automatically pauses compute resources during inactive periods, charging only for storage.
- **Azure Blob Storage (Cool/Hot Tier Routing)**:
  - Archived school documents are rarely accessed once processed. Files can be automatically transitioned to Azure Blob **Cool Tier** or **Archive Tier** storage using lifecycle policies, saving up to 80% on storage costs compared to Hot tier.

---

## 3. Premium / Enterprise Isolation Upgrade Path

While the shared infrastructure is the approved model for the standard annual subscription tier, some large educational ministries or private school networks may demand strict physical isolation. The system architecture supports this path:
- **Premium Tier Offering**:
  - The deployment scripts (Terraform/Bicep) are structured to allow provisioning a dedicated Azure SQL Database or a dedicated Azure Storage Account for specific high-value tenants.
  - Since the application code relies on abstraction layers (interfaces for storage clients and repositories), pointing a specific school tenant to their own connection string or container endpoint requires configuration changes only, not source code modifications.
- **Scope Boundary**: This upgrade path is documented for planning only. No infrastructure provisioning scripts or multi-tenant database router middleware will be written during Phase 0 or Phase 1.
