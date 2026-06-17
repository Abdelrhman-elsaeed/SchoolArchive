# LOCAL_RUN.md - Local Development Setup Guide

This document describes the environment and configuration setup required to run the **الأرشيف المدرسي العربي** (Arabic School Archive) backend locally for Phase 7 development. The frontend is a Vite + React + TypeScript shell under `src/ArabicSchoolArchive.Web/` (added in Phase 7). See §8 for the frontend run / build steps.

Phase 2.5 adds:
- A multi-stage `Dockerfile` for containerized local runs.
- A `docker-compose.local.yml` that brings up **API + Azurite + n8n** in a single network.
- A `.env.example` covering every configuration knob.
- A development-only auth bypass (`X-Dev-School-Id` / `X-Dev-User-Id` headers) so manual QA can be done with plain `curl` / Postman / Bruno — no JWT minting required.
- A `/health` endpoint for liveness checks.

The non-development behaviour of the API is unchanged. The dev-bypass is gated on **both** `ASPNETCORE_ENVIRONMENT=Development` **and** `Auth:DevBypassEnabled=true`; flipping either switch alone cannot enable it.

---

## 1. Summary of Run Paths & Success Path Dependencies

To successfully run and test the Arabic School Archive API, you can choose between two paths:

*   **Native Path (no Docker):** Runs the API as a process on the host (e.g., via `dotnet run`). You must manually run or mock the dependencies (Azurite + n8n + SQL Server) if you want to complete the success-path verification.
*   **Docker Path (containerized):** Runs the API and its dependencies in Docker.

### Required Dependencies for the Success Path
To achieve a `Success` status on file upload, the following three components must be active:
1.  **Azurite (Blob Emulator):** Required to store the uploaded physical file. If unreachable, the API aborts with `BLOB_FAILED`.
2.  **n8n (Classification Webhook):** Required to classify the document category. If unreachable or inactive, the API aborts with `N8N_HTTP_ERROR`.
3.  **Database (SQL Server):** Required to persist document metadata. The `InMemory` database provider fallback is deprecated for manual QA and end-to-end local runs. The local environment stack provisions a real, containerized Microsoft SQL Server database (`sqlserver` service) to accurately mirror production constraints.

---

## 2. Prerequisites

*   **.NET 10 SDK** (required for Native Path; verified with `dotnet --version` returning `10.0.x`).
*   **Docker Engine / Desktop** (required for Docker Path).
*   **Azurite:** Shipped automatically in the Docker Compose stack. For the Native Path, run via npm (`npm install -g azurite` followed by `azurite`) or standalone Docker.
*   **n8n:** Shipped automatically in the Docker Compose stack. For the Native Path, ensure a reachable n8n instance is configured.
*   **SQL Server:** Required for local development. Shipped automatically in the Docker Compose stack. The `InMemory` provider fallback is deprecated for QA and end-to-end runs.

---

## 2. Configuration Surface

All configuration is read from `src/ArabicSchoolArchive.Api/appsettings.json` and can be overridden by environment variables using the standard ASP.NET Core double-underscore syntax (e.g. `ConnectionStrings__AzureSql`, `N8N__WebhookUrl`).

The Docker path additionally reads `src/.env` (see `src/.env.example`).

| Section | Keys | Notes |
|:---|:---|:---|
| `ConnectionStrings:AzureSql` | A SQL Server connection string | When set, the API uses SQL Server. When empty, falls back to in-memory. |
| `Upload:MaxFileSizeBytes` | Integer (default `20971520` = 20 MB) | Per-file cap. |
| `Upload:MaxBatchSizeBytes` | Integer (default `26214400` = 25 MB) | Total request cap. |
| `Upload:AllowedExtensions` | Comma-separated list (default `.pdf,.docx,.xlsx,.png,.jpg,.jpeg`) | Phase 2 allowlist. |
| `Upload:AllowedMimeTypes` | Comma-separated list | Mirror of the extension allowlist at the MIME layer. |
| `N8N:WebhookUrl` | Full URL | The classification endpoint. |
| `N8N:TimeoutSeconds` | Integer (default `15`) | Per-call timeout. |
| `N8N:SharedSecret` | Bearer token (optional) | Sent as `Authorization: Bearer …` to n8n. |
| `Blob:ConnectionString` | Azurite or Azure connection string | Empty string triggers the `UseDevelopmentStorage=true;` default. |
| `Blob:ContainerName` | Default `school-archives` | |
| `Blob:UploadTimeoutSeconds` | Default `30` | Per-call timeout. |
| `Blob:SasTtlMinutes` | Integer (default `10`, clamped to `5–15`) | TTL for the SAS URL returned by `GET /archives/{id}/download`. |
| `LocalDev:DownloadStreamEnabled` | `true` / `false` (default `false`) | **Dev only.** Registers `GET /archives/{id}/content` that streams the blob through the API. Honored only when `ASPNETCORE_ENVIRONMENT=Development`. |
| `Auth:Issuer` | JWT issuer | When empty, issuer validation is disabled. |
| `Auth:Audience` | JWT audience | When empty, audience validation is disabled. |
| `Auth:SigningKey` | Symmetric key string | When empty, signature validation is disabled. **Do not** disable in production. |
| `Auth:RequireHttpsMetadata` | `true` / `false` | Defaults to `true`. Set to `false` for local Azurite / non-TLS dev only. |
| `Auth:ClockSkewSeconds` | Default `30` | Symmetric clock skew window. |
| `Auth:DevBypassEnabled` | `true` / `false` | **Dev only.** Enables the `X-Dev-School-Id` / `X-Dev-User-Id` header scheme. Honored only when `ASPNETCORE_ENVIRONMENT=Development`. See §4.2. |
| `RateLimit:Enabled` | `true` / `false` (default `true`) | Master switch for the per-tenant rate-limit middleware. |
| `RateLimit:UploadPerMinute` | Integer (default `30`) | Per-tenant cap for the upload route. |
| `RateLimit:ReadPerMinute` | Integer (default `300`) | Per-tenant cap for the browse / search / download routes. |
| `RateLimit:CleanupIntervalSeconds` | Integer (default `60`) | Idle-bucket sweep interval. |
| `RateLimit:IdleEntryTtlSeconds` | Integer (default `600`) | How long an idle tenant entry is kept in the in-process bucket. |
| `Cors:AllowedOrigins` | String array (default `[]`) | Explicit CORS allowlist. Empty → CORS middleware not registered. Wildcard `*` is rejected at startup. For the Vite dev server, set this to `["http://localhost:5173"]`. |
| `Cors:AllowCredentials` | `true` / `false` (default `false`) | When `true`, the configured origins are allowed to send credentials. Requires explicit origins. |
| `Cors:AllowedMethods` | String array | HTTP methods the CORS middleware allows. |
| `Cors:AllowedHeaders` | String array | HTTP headers the CORS middleware allows. |
| `Cors:PreflightMaxAgeSeconds` | Integer (default `600`) | `Access-Control-Max-Age` for the preflight response. |
| `LocalDev:DownloadStreamEnabled` | `true` / `false` (default `false`) | When `true` AND `ASPNETCORE_ENVIRONMENT=Development`, the dev-only content stream route is registered at `GET /api/v1/archive/archives/{id}/content`. The frontend uses this route in local dev so the browser does not have to resolve the internal Azurite DNS name. Production behavior is unchanged (signed URL). |
| `Subscriptions:Enabled` | `true` / `false` (default `true`) | Master switch for the `SubscriptionGuardMiddleware`. When `false`, the middleware passes every request through (useful for hermetic tests). |
| `Subscriptions:DefaultGracePeriodDays` | Integer (default `7`) | Default grace-period window for an `Active` config entry whose `ExpiresAtUtc` is in the past. Honored only when `GraceUntilUtc` is absent. |
| `Subscriptions:Schools[]` | Array of `SchoolId` / `State` / `ExpiresAtUtc` / `GraceUntilUtc` / `Reason` entries | Per-school config-driven subscription state. An unknown `school_id` falls back to `Active`. State values: `Active`, `GracePeriod`, `Expired`, `Suspended`. See `appsettings.Development.json` for an example. |

---

## 3. Database Behavior

### 3.1 Two modes

The API supports two database modes, selected at startup based on the `ConnectionStrings:AzureSql` value.

| Mode | Trigger | Used for |
|:---|:---|:---|
| **Azure SQL (real)** | `ConnectionStrings:AzureSql` is set to a valid connection string | Production, docker-compose local stack, and host-side runs against the docker-exposed SQL Server. |
| **In-Memory (fallback)** | `ConnectionStrings:AzureSql` is empty or missing | **Deprecated** for manual QA and local dev-run path. Used only by the xUnit test suite (`dotnet test`) to keep execution fast and isolated. |

The `Program.cs` selection is:

```csharp
var connectionString = builder.Configuration.GetConnectionString("AzureSql");
if (!string.IsNullOrEmpty(connectionString))
    builder.Services.AddDbContext<ArchiveDbContext>(o => o.UseSqlServer(connectionString));
else
    builder.Services.AddDbContext<ArchiveDbContext>(o => o.UseInMemoryDatabase("ArchiveDb"));
```

### 3.2 Migrations & Local Schema Initialization (EF Core Migrations)

- The first EF Core migration, **`InitialArchiveSchema`**, lives under `src/ArabicSchoolArchive.Api/Data/Migrations/`. It is the source of truth for the database schema.
- The SQL Server mode does **not** call `Database.Migrate()` at runtime. Migrations are an explicit, manual operator step driven by `dotnet ef database update --project ArabicSchoolArchive.Api`.
- **CRITICAL STEP**: Starting the API against SQL Server without first applying migrations will fail on the first DB write (with an invalid-object-name error).
- Before making the first API request, developers **MUST** run the EF migrations locally against the exposed port `localhost,1433`.

To apply the migrations against the containerized SQL Server:

```bash
cd src

# Set the connection string targeting the docker-exposed SQL Server port (localhost,1433)
# Windows (PowerShell):
$env:ConnectionStrings__AzureSql = "Server=localhost,1433;Database=ArabicSchoolArchiveDb;User Id=sa;Password=YourStrong!Passw0rd;TrustServerCertificate=True;"

# Linux / macOS:
export ConnectionStrings__AzureSql="Server=localhost,1433;Database=ArabicSchoolArchiveDb;User Id=sa;Password=YourStrong!Passw0rd;TrustServerCertificate=True;"

# Run the update
dotnet ef database update --project ArabicSchoolArchive.Api
```

The migration creates the `Archives` table and the three indexes (`IX_Archives_School_UploadedAt`, `IX_Archives_School_Category`, `IX_Archives_School_OriginalName`) that match the DDL. The hand-authored DDL below is retained only for the audit trail — do not run it; the migration is authoritative.

The (now-superseded) minimum DDL the operator previously had to run on the target database:

```sql
CREATE TABLE [dbo].[Archives] (
    [document_id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [school_id]   UNIQUEIDENTIFIER NOT NULL,
    [original_name]   NVARCHAR(512) NOT NULL,
    [safe_name]       NVARCHAR(255) NOT NULL,
    [blob_object_name] NVARCHAR(1024) NOT NULL,
    [size_bytes]     BIGINT NOT NULL,
    [mime_type]      NVARCHAR(127) NOT NULL,
    [category]       NVARCHAR(127) NULL,
    [uploaded_by_user_id] UNIQUEIDENTIFIER NOT NULL,
    [uploaded_at_utc]     DATETIME2(7) NOT NULL,
    [processing_year]     INT NOT NULL,
    [processing_month]    TINYINT NOT NULL,
    [content_hash_sha256] CHAR(64) NULL
);
CREATE INDEX [IX_Archives_School_UploadedAt]     ON [dbo].[Archives]([school_id], [uploaded_at_utc] DESC);
CREATE INDEX [IX_Archives_School_Category]       ON [dbo].[Archives]([school_id], [category], [uploaded_at_utc] DESC);
CREATE INDEX [IX_Archives_School_OriginalName]   ON [dbo].[Archives]([school_id], [original_name]);
```

The full contract still lives in `docs/agent/DB_SCHEMA_PLAN.md`. The migration files are the executable form of that contract.

### 3.3 Local-only mode (In-Memory) — Deprecated

Day-to-day manual QA and local runs must use the containerized SQL Server to accurately validate DB constraints. Leaving `ConnectionStrings:AzureSql` empty triggers the in-memory provider fallback, which is now deprecated for end-to-end scenarios.

---

## 4. Native Path (no Docker) — Verified Steps

The native path runs the API as a plain dotnet process on the host. Azurite and n8n are still needed externally if you want the success path to complete; otherwise the orchestrator will return `N8N_HTTP_ERROR` (after step 1) or `BLOB_FAILED` (after step 2) and the failure scenarios from `MANUAL_QA.md` are still fully exercisable.

### 4.1 Build and run

```bash
cd src
dotnet build
dotnet test                # runs 110 xUnit tests (Phase 2 + 2.5 + 3 + 4 + 5 + 6)
dotnet run --project ArabicSchoolArchive.Api
```

The Phase 7 frontend has its own test runner; see §8.

The API listens on the standard ASP.NET Core ports (from `Properties/launchSettings.json`):
- `http://localhost:5132` (default — `http` profile)
- `https://localhost:7198;http://localhost:5132` (`https` profile, when the dev cert is installed)

### 4.1.1 Apply the EF Core migration (Native Path)

The first EF Core migration (`InitialArchiveSchema`) is generated under `src/ArabicSchoolArchive.Api/Data/Migrations/` (see D-18 in `DECISIONS.md`). `Program.cs` does **not** call `Database.Migrate()` at runtime — migrations are an explicit, manual operator step.

To bring up the schema against a local SQL Server (or an Azure SQL database) before the first request:

```bash
cd src

# One-time per machine: install the EF Core CLI (skip if `dotnet ef` already works).
dotnet tool install --global dotnet-ef --version 10.*

# Set the connection string the migration will target. The CLI reads
# ConnectionStrings:AzureSql from the API project's appsettings.
# Two options:
#   (a) environment variable (no file edits needed):
#       Windows (PowerShell):  $env:ConnectionStrings__AzureSql = "Server=(localdb)\mssqllocaldb;Database=ArabicSchoolArchive;Trusted_Connection=True;TrustServerCertificate=True;"
#       Linux / macOS:         export ConnectionStrings__AzureSql="Server=(localdb)\mssqllocaldb;Database=ArabicSchoolArchive;Trusted_Connection=True;TrustServerCertificate=True;"
#   (b) edit src/ArabicSchoolArchive.Api/appsettings.Development.json and set "AzureSql".

# Apply the migration (idempotent — safe to re-run).
dotnet ef database update --project ArabicSchoolArchive.Api
```

The migration creates the `Archives` table and the three indexes (`IX_Archives_School_UploadedAt`, `IX_Archives_School_Category`, `IX_Archives_School_OriginalName`) that match the DDL previously documented in §3.2. **That section is now superseded** — the migration is the source of truth.

If you want to keep using the in-memory database (the default when `ConnectionStrings:AzureSql` is empty), you do **not** need to run `dotnet ef database update`. The xUnit suite uses the in-memory provider and is unaffected by the migration.

To generate a new migration in the future (after a model change):

```bash
cd src
dotnet ef migrations add <Name> --project ArabicSchoolArchive.Api -o Data/Migrations
dotnet ef database update    --project ArabicSchoolArchive.Api
```

### 4.2 Dev-only auth bypass

When `ASPNETCORE_ENVIRONMENT=Development` **and** `Auth:DevBypassEnabled=true`, the upload endpoint accepts the following headers in place of a real JWT:

| Header | Required | Meaning |
|:---|:---|:---|
| `X-Dev-School-Id` | yes | UUID. Becomes the `school_id` claim. |
| `X-Dev-User-Id` | no | UUID. Becomes the `sub` claim. Defaults to `00000000-0000-0000-0000-000000000000` if omitted. |

**Safety guarantees:**
- The `DevBypassAuthHandler` re-checks `IHostEnvironment.IsDevelopment()` and `AuthOptions.DevBypassEnabled` on **every** request. The scheme is registered at startup **only** when both conditions are met, so flipping one of them at runtime cannot enable the bypass.
- The default authentication scheme is `MultiAuth`, a policy scheme that forwards to the JWT scheme when a `Bearer` token is supplied and to the dev-bypass scheme otherwise. Requests with no auth and no `X-Dev-School-Id` return `401` (the JWT challenge is triggered, as expected).
- The non-development path (Staging, Production, any custom env name) keeps `JwtBearer` as the **only** registered scheme. The dev-bypass is not registered at all.

A minimal smoke command (uses the dotnet run port):

```bash
curl -sS -X POST http://localhost:5132/api/v1/archive/upload \
  -H "X-Dev-School-Id: 11111111-1111-1111-1111-111111111111" \
  -H "X-Dev-User-Id:  22222222-2222-2222-2222-222222222222" \
  -F "file=@/path/to/sample.pdf"
```

### 4.3 Health check

```bash
curl -sS http://localhost:5132/health
```

Expected:
```json
{ "status": "ok", "time": "...", "service": "ArabicSchoolArchive.Api", "version": "phase-2.5" }
```

### 4.4 Storage Emulator Execution (Azurite)

The default `Blob:ConnectionString` is empty, which causes `Program.cs` to register a `BlobServiceClient` against `UseDevelopmentStorage=true;`. For that to actually serve requests, run Azurite:

```bash
# In a separate terminal
azurite --silent --location /tmp/azurite --debug /tmp/azurite/debug.log
```

If Azurite is not running, Blob uploads will fail and the orchestrator will return `BLOB_FAILED`. n8n will not be called, and no DB row will be written.

### 4.5 n8n Local Setup

Point `N8N:WebhookUrl` at a local n8n instance (e.g. `http://localhost:5678/webhook/archive-classify`). The n8n workflow must accept `multipart/form-data` with form fields named `file`, `schoolId`, `documentId`, and return JSON of the shape:

```json
{ "category": "تقرير إداري" }
```

If n8n is unreachable, the orchestrator returns `N8N_HTTP_ERROR` (or `N8N_TIMEOUT` after 15 seconds). Blob is not called, no DB row is written.

---

## 5. Docker Path — Verified Steps

The Docker path uses `src/Dockerfile` and `src/docker-compose.local.yml`. Both files live next to `ArabicSchoolArchive.slnx` and are designed to be invoked from `src/`.

> **Local dev run path (revised):** the user already hosts n8n externally. The compose file starts **only** the API and Azurite. `N8N_WEBHOOK_URL` in `.env` is required and has no fallback to a local `n8n` container. This is the canonical end-to-end test path on the dev machine.

### 5.1 First-time setup

```bash
cd src
cp .env.example .env
# Edit .env and set N8N_WEBHOOK_URL to your external n8n webhook URL.
# All other variables have safe defaults.

docker compose -f docker-compose.local.yml --env-file .env up -d --build
```

The first run pulls the .NET 10 SDK image and the Azurite image, then builds the API. Subsequent runs use the cached layers. There is **no n8n container** in the stack anymore — the API reaches your external n8n directly over HTTPS.

> **WSL / Ubuntu note:** the user runs this from a Windows host via WSL (Ubuntu). Docker Desktop's WSL2 integration exposes `docker` and `docker compose` inside the Ubuntu shell. The host browser reaches the API at `http://localhost:8080` because Docker Desktop's port forwarding from WSL2 to Windows is automatic. If you are on a pure Linux host, `localhost:8080` works directly.

### 5.2 Service endpoints

| Service | Host port (from .env) | Internal compose name | Purpose |
|:---|:---|:---|:---|
| `api` | `8080` | `api` | ArabicSchoolArchive.Api (HTTP only, no TLS in dev) |
| `azurite` | `10000` (Blob) / `10001` (Queue) / `10002` (Table) | `azurite` | Azure Storage emulator |

The API container:
- Listens on `:8080` inside the container, mapped to `:8080` on the host.
- Has `ASPNETCORE_ENVIRONMENT=Development` set, so the dev-bypass is active.
- Connects to Azurite via the `BLOB_CONNECTION_STRING` in `.env`, which points at `http://azurite:10000/...` on the internal network.
- Reaches n8n via the external URL set in `N8N_WEBHOOK_URL`. **There is no internal `n8n` hostname in the compose network.**
- CORS is pre-wired for the Vite dev server at `http://localhost:5173` (configurable via `CORS_ALLOWED_ORIGIN`).

### 5.3 Smoke test (Docker)

```bash
# Wait for the API to be ready.
curl -sS http://localhost:8080/health

# Dev-only info endpoint (returns 404 in non-Development environments).
curl -sS http://localhost:8080/api/v1/local-dev/info
# → { "environment": "Development", "downloadStreamEnabled": true, "authDevBypassEnabled": true }

# Single-file upload using dev-bypass headers:
curl -sS -X POST http://localhost:8080/api/v1/archive/upload \
  -H "X-Dev-School-Id: 11111111-1111-1111-1111-111111111111" \
  -H "X-Dev-User-Id:  22222222-2222-2222-2222-222222222222" \
  -F "file=@/path/to/sample.pdf"
```

If your external n8n returns a 200 with a `category`, the response will be `Success` and the blob will be visible in the Azurite container (use Azure Storage Explorer pointed at `127.0.0.1:10000` with the well-known dev credentials).

### 5.4 (removed — n8n is external)

The previous "n8n workflow bootstrap" section is no longer applicable. Configure your external n8n workflow once on your own server, then point `N8N_WEBHOOK_URL` in `.env` at its public webhook URL. No local n8n container is started.

### 5.5 Local-dev download path (browser from host)

The signed URL the API produces points at `http://azurite:10000/...` (the internal Docker DNS name). The **host browser cannot resolve `azurite`**, so opening the SAS URL from the browser fails with `ERR_NAME_NOT_RESOLVED`.

The local-dev workaround is a deliberate composition of two existing surfaces:

- The API has a dev-only content stream route at `GET /api/v1/archive/archives/{id}/content`. It is registered only when **both** `ASPNETCORE_ENVIRONMENT=Development` **and** `LocalDev:DownloadStreamEnabled=true`. The route enforces the same auth + tenant + subscription checks as the SAS download path; no security is weakened.
- The frontend (Vite dev server at `http://localhost:5173`) fetches `GET /api/v1/local-dev/info` on first load. If `downloadStreamEnabled` is `true`, the "تنزيل المستند" button calls the `/content` route, fetches the bytes via `fetch` (with the dev-bypass headers), and triggers a browser-side `Blob` download. The signed-URL path remains the production behavior and is used automatically in non-Development environments.

This means: in local dev, downloads always go through the API. In production / staging, downloads always go through the signed URL. The two paths do not share code, but the contract (filename, `Content-Type`, byte stream) is identical.

### 5.6 Tear down

```bash
# Stop services but keep the Azurite data volume.
docker compose -f docker-compose.local.yml down

# Stop and remove ALL state (volumes too).
docker compose -f docker-compose.local.yml down -v
```

### 5.7 Build & network troubleshooting

The `Dockerfile` restores `api.nuget.org` from inside the build container. On most dev machines that works out of the box, but on networks with a corporate proxy, a VPN, a flaky Wi-Fi link, or aggressive Windows Defender / WSL2 NAT translation, `dotnet restore` can fail with `NU1301: Unable to load the service index for source https://api.nuget.org/v3/index.json`. The hardening applied to the Dockerfile makes this transient — `dotnet restore` is invoked with `--disable-parallel` + a 10-minute HTTP timeout and is wrapped in a 3-attempt retry loop. If a build still fails, the steps below isolate the cause.

**Step 1 — verify the host can reach NuGet directly.** From the WSL / Ubuntu shell:

```bash
# DNS
getent hosts api.nuget.org || nslookup api.nuget.org

# HTTPS
curl -sSI --max-time 15 https://api.nuget.org/v3/index.json | head -1
# Expected: HTTP/2 200

# Out of the WSL shell on Windows
powershell -NoProfile -Command "(Invoke-WebRequest -Uri 'https://api.nuget.org/v3/index.json' -UseBasicParsing -TimeoutSec 15).StatusCode"
# Expected: 200
```

**Step 2 — verify Docker's internal DNS can reach NuGet.** Run a one-shot SDK container:

```bash
docker run --rm mcr.microsoft.com/dotnet/sdk:10.0 bash -c "getent hosts api.nuget.org && curl -sSI --max-time 15 https://api.nuget.org/v3/index.json | head -1"
# Expected:
#   13.107.253.43   api.nuget.org   (or similar)
#   HTTP/2 200
```

If step 1 succeeds but step 2 fails, the issue is **Docker Desktop's internal DNS / outbound networking**, not the project. Common fixes:

- Restart Docker Desktop (`docker desktop restart` from PowerShell, or via the tray icon).
- On WSL2, run `wsl --shutdown` and reopen the Ubuntu shell, then retry.
- Pause / disable the VPN, corporate proxy, or Windows Defender firewall briefly and retry.

**Step 3 — bypass transient failures with a warm cache.** If step 2 succeeds but the build still flakes, the issue is likely a single timed-out HTTP/2 stream during parallel restore. The Dockerfile already runs restore single-streamed with a retry loop. To force a clean retry without `--no-cache`:

```bash
# Invalidate ONLY the restore layer (preserves the SDK base image):
docker builder prune --filter 'label=stage=build'
docker compose -f docker-compose.local.yml --env-file .env build api
```

**Step 4 — confirm the build works on the same machine outside Docker.** From `src/`:

```bash
dotnet restore ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj
dotnet build ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj -c Release
# Expected: 0 errors (the same code path the Dockerfile uses, just without
# the Docker network layer).
```

If step 4 succeeds and steps 1–2 succeed but `docker compose build` still fails, the issue is **specifically Docker's outbound networking on this host** and the project code is healthy.

**Common root causes seen in the wild** (ranked by frequency):

| Symptom | Likely cause | Fix |
|:---|:---|:---|
| `NU1301` after 60–120 s, then succeeds on retry 2/3 | Intermittent DNS resolution inside Docker | The Dockerfile's retry loop absorbs this; no action needed. |
| `NU1301` persistent, step 1 succeeds, step 2 fails | Docker Desktop internal DNS broken | Restart Docker Desktop, `wsl --shutdown`, or set `--dns 8.8.8.8` on the `api` service. |
| `NU1301` only inside corporate proxy networks | HTTPS interception / proxy required | Configure `HTTP_PROXY` / `HTTPS_PROXY` on the `api` service in compose; do not disable TLS validation. |
| `NU1301` only when building with `--no-cache` | Cold cache; first build always hits the network | Expected. Let the build complete (1–3 minutes). The Dockerfile's retry loop will handle slow first requests. |

**What this Dockerfile deliberately does NOT do** (and why):

- It does **not** add a private NuGet feed. There is no proxy in scope and adding one would create a new dependency.
- It does **not** copy the host's NuGet cache into the image. That would mask real connectivity issues and is fragile across machines.
- It does **not** pin a single mirror. `api.nuget.org` is the canonical source; mirrors are out of scope and would create a hidden dependency.
- It does **not** use BuildKit-only features (`RUN --mount=type=cache`). Those require BuildKit and break the classic builder. The Dockerfile works with both.

---

## 6. Failure-Mode Cheat Sheet

| Failure injected | Expected response `status` | Expected `reasonCode` | Visible in |
|:---|:---|:---|:---|
| `N8N__WebhookUrl` unreachable | `Failed` | `N8N_HTTP_ERROR` | API response + log |
| `BLOB__ConnectionString` unreachable | `Failed` | `BLOB_FAILED` (blob step) | API response + log |
| DB throws after blob success | `Failed` | `DB_FAILED` | API response + log line containing "Blob orphan possible" |
| `.exe` extension | `Rejected` | `EXTENSION_NOT_ALLOWED` | API response (no n8n, no blob, no DB) |
| Zero-byte file | `Rejected` | `SIZE_EXCEEDED` | API response (no n8n, no blob, no DB) |
| 21 MB file | (no JSON body) | — | Kestrel-level HTTP 400 `BODY_TOO_LARGE` |
| Multi-file body over `Upload:MaxBatchSizeBytes` | (no JSON body) | — | Controller-level HTTP 400 `BODY_TOO_LARGE` |
| Multi-file request with no `files` parts | (no JSON body) | — | Controller-level HTTP 400 `EMPTY_BATCH` |
| Missing `X-Dev-School-Id` header | (no JSON body) | — | HTTP 401 (`WWW-Authenticate: Bearer`) |
| `GET /archives/{otherSchoolsDocId}` | (no JSON body) | — | HTTP 404 `ARCHIVE_NOT_FOUND` (no metadata leak) |
| `GET /archives/{otherSchoolsDocId}/download` | (no JSON body) | — | HTTP 404 `ARCHIVE_NOT_FOUND` (no signedUrl leak) |
| `GET /archives/{id}/content` in non-Dev or with `LocalDev:DownloadStreamEnabled=false` | (no JSON body) | — | HTTP 404 `ARCHIVE_NOT_FOUND` (route disabled) |
| Upload with non-PDF bytes but `.pdf` extension + correct MIME | `Rejected` | `MAGIC_BYTES_MISMATCH` | API response (no n8n, no blob, no DB) |
| Upload with empty body but valid extension + MIME | `Rejected` | `MAGIC_BYTES_UNREADABLE` | API response (no n8n, no blob, no DB) |
| More than `RateLimit:UploadPerMinute` uploads in 60 s from one tenant | (no JSON body) | — | HTTP 429 `RATE_LIMITED` with `Retry-After` |
| More than `RateLimit:ReadPerMinute` reads in 60 s from one tenant | (no JSON body) | — | HTTP 429 `RATE_LIMITED` with `Retry-After` |
| CORS preflight from a non-allowlisted origin (no `Cors:AllowedOrigins` configured) | (no CORS headers) | — | Pre-flight passed through; no `Access-Control-Allow-Origin` |
| API started with `Cors:AllowedOrigins` containing `*` | (no JSON body) | — | **Startup fails** with `InvalidOperationException` |
| Upload as a tenant in `Subscriptions:Schools[]` with `State=Expired` | (no JSON body) | — | HTTP 402 `SUBSCRIPTION_EXPIRED` with `X-Subscription-State: Expired` |
| Upload as a tenant in `Subscriptions:Schools[]` with `State=Suspended` | (no JSON body) | — | HTTP 403 `SUBSCRIPTION_SUSPENDED` with `X-Subscription-State: Suspended` |
| `GET /archives` as an `Expired` tenant | (no JSON body) | — | HTTP 402 `SUBSCRIPTION_EXPIRED` |
| `GET /archives/{id}/download` as a `Suspended` tenant | (no JSON body) | — | HTTP 403 `SUBSCRIPTION_SUSPENDED` (no signedUrl leak) |
| `POST /upload` with no auth (no `X-Dev-School-Id` in dev) | (no JSON body) | — | HTTP 401 (`WWW-Authenticate: Bearer`) — proves the subscription guard runs **after** auth |

The `dotnet test` suite covers the `BLOB_FAILED`, `N8N_HTTP_ERROR`, `N8N_TIMEOUT`, `DB_FAILED`, and `EXTENSION_NOT_ALLOWED` paths via mocked `IBlobStorageService` / `IN8nClient` / throwing `ArchiveDbContext`, the Phase 3 multi-file batch paths via `UploadOrchestratorBatchTests` and `ArchiveUploadControllerTests`, the Phase 4 browse / search / download paths via `ArchiveReadRepositoryTests` and `ArchiveBrowseControllerTests`, the Phase 5 hardening paths (magic-bytes, rate limit, audit, CORS, secret scrubbing) via `FileSignatureValidatorTests`, `RateLimitAndAuditTests`, and the new tests in `FileValidatorTests` and `BlobStorageServiceSafeNameTests`, and the Phase 6 subscription enforcement paths (Active / GracePeriod / Expired / Suspended, auth ordering, school-id resolution) via `ConfigSubscriptionStoreTests` and `SubscriptionGuardMiddlewareTests`. See `TESTING.md` §2.

---

## 7. Frontend Execution (Phase 7+)

The Phase 7 frontend lives in `src/ArabicSchoolArchive.Web/` (Vite + React + TypeScript). It is a small, dependency-light shell that consumes the locked Phase 1–6 backend contracts.

### 7.1 Prerequisites
- **Node.js 22+** (verified with `node --version` returning `v22.x` or later; `v24.x` recommended for the built-in `--experimental-strip-types` test runner).
- **npm 10+** (bundled with Node 22 / 24).
- The dotnet API on `http://localhost:5132` (running via `dotnet run --project ArabicSchoolArchive.Api` or via `docker compose`).

### 7.2 Install + dev server

```bash
cd src/ArabicSchoolArchive.Web
npm install
npm run dev
```

Vite listens on `http://localhost:5173`. The dev server proxies:

| Path | Target | Notes |
|:---|:---|:---|
| `/api/*` | `http://localhost:5132` | Every backend endpoint. |
| `/health` | `http://localhost:5132` | Liveness probe. |

If the API runs on a different port (e.g. `8080` for Docker), edit the `server.proxy` block in `vite.config.ts` accordingly.

### 7.3 Production build

```bash
cd src/ArabicSchoolArchive.Web
npm run build
```

Vite emits `dist/index.html` + `dist/assets/*.{js,css}`. The build is a static SPA and can be served from any static-file host. The `npm run preview` command serves the built `dist/` for local smoke-testing.

### 7.4 Frontend tests

```bash
cd src/ArabicSchoolArchive.Web
npm test
```

Runs `tsc -p tsconfig.test.json --noEmit` (strict typecheck over `src` + `tests`) followed by Node's built-in `node --test --experimental-strip-types`. **7 / 7** tests cover the `ApiClient` error-mapping contract (401, 402, 403, 404, 429, 5xx, multipart upload, query string, dev-bypass headers).

### 7.5 Dev-bypass flow

The UI ships a `DevSettingsPanel` in the footer (visible only in dev). Click any of the four preset chips to switch the active school id:

| Preset | School id | State | Expected behavior |
|:---|:---|:---|:---|
| نشط | `11111111-1111-1111-1111-111111111111` | `Active` | All routes work. |
| مهلة التجديد | `22222222-2222-2222-2222-222222222222` | `GracePeriod` | All routes work; the API surfaces the state for future UI banners. |
| منتهي الصلاحية | `33333333-3333-3333-3333-333333333333` | `Expired` | Every protected route returns 402 → the UI renders the `Expired` placeholder. |
| موقوف | `44444444-4444-4444-4444-444444444444` | `Suspended` | Every protected route returns 403 → the UI renders the `Suspended` placeholder. |

The selected school id is persisted in `localStorage` under `asa.devBypass.v1`. To reset, click "إعادة الافتراضي" in the dev panel.

### 7.6 Manual QA mapping

The eight Phase 7 UI scenarios (`MANUAL_QA.md` §QA-33..§QA-40) cover the required test list from the user prompt: successful multi-file upload, mixed upload results, archive search, download action, expired tenant blocked, suspended tenant blocked, rate limit visible error, and RTL rendering sanity check.
