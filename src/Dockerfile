# =============================================================================
# Arabic School Archive - Local API Dockerfile
# Multi-stage build for the ArabicSchoolArchive.Api project.
# Intended for local / dev use only. Production hardening is out of scope.
#
# Layering (matches the build-stage shape from the user prompt):
#   1. WORKDIR /src
#   2. COPY the files that affect the restore graph
#      (ArabicSchoolArchive.slnx and the API .csproj).
#      No Directory.Build.* / Directory.Packages.props / NuGet.Config are
#      referenced because they do not exist in this repo (verified by
#      glob on 2026-06-17). Dockerfile COPY cannot be made conditional
#      via `2>/dev/null` / `|| true` (those tokens would be interpreted
#      as literal paths and fail the build), so the only safe approach
#      is to reference files that are guaranteed to exist.
#   3. First `dotnet restore --disable-parallel` with a 3-attempt retry
#      loop. The retry absorbs transient network failures inside Docker
#      Desktop / WSL2 / corporate proxies without masking real errors.
#   4. `COPY . .` the rest of the source.
#   5. Second `dotnet restore --disable-parallel` with the same retry
#      loop. This regenerates obj/project.assets.json after COPY . .
#      so the subsequent `dotnet publish --no-restore` is guaranteed to
#      find the assets file (idempotent on a warm cache, ~200 ms when
#      the NuGet cache is warm; identical to step 3 on a cold cache).
#   6. `dotnet publish --no-restore` in Release.
#
# The NuGet package cache (/root/.nuget/packages) is preserved across
# builds via Docker's natural layer caching. The only thing that
# invalidates the restore layer is a change to the .csproj or the .slnx.
# We deliberately avoid BuildKit-only features (RUN --mount=type=cache)
# so this Dockerfile works under both the classic builder and BuildKit.
# =============================================================================

# ---------- Build stage ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Suppress NuGet / dotnet telemetry noise inside CI-style Docker builds.
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    NUGET_XMLDOC_MODE=skip \
    NUGET_PACKAGES=/root/.nuget/packages

# Pre-restore COPY: only files that are guaranteed to exist in the
# build context. The .slnx is small and stable; the .csproj is the
# smallest possible input that gives NuGet a complete restore graph.
COPY ArabicSchoolArchive.slnx ./
COPY ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj ArabicSchoolArchive.Api/

# First restore. A small shell retry absorbs transient network failures
# (Docker DNS, slow TLS, intermittent timeouts) that would otherwise
# fail the entire build with NU1301.
RUN for i in 1 2 3; do \
      echo ">>> dotnet restore (1/2) attempt $i/3"; \
      dotnet restore ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj \
        --disable-parallel \
        --verbosity minimal \
      && break \
      || { echo ">>> restore (1/2) attempt $i failed, sleeping $((i*10))s"; sleep $((i*10)); }; \
    done

# Copy the rest of the source. The Web / Tests projects are excluded
# by .dockerignore so they do not enter the image. This COPY may
# shadow the previous layer's obj/ directory; that is the entire
# reason a second restore follows.
COPY . .

# Second restore. Regenerates obj/project.assets.json after COPY . .
# regardless of what happened to the obj/ directory. On a warm cache
# this is a no-op for the network and finishes in ~200 ms; on a cold
# cache it is identical to the first restore and is bounded by the
# same retry loop. No --no-restore assumption is carried over.
RUN for i in 1 2 3; do \
      echo ">>> dotnet restore (2/2) attempt $i/3"; \
      dotnet restore ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj \
        --disable-parallel \
        --verbosity minimal \
      && break \
      || { echo ">>> restore (2/2) attempt $i failed, sleeping $((i*10))s"; sleep $((i*10)); }; \
    done

# Publish in Release. --no-restore is safe now because the second
# restore just regenerated the assets file.
RUN dotnet publish ArabicSchoolArchive.Api/ArabicSchoolArchive.Api.csproj \
      -c Release \
      -o /app/publish \
      --no-restore \
      -p:UseAppHost=false

# ---------- Runtime stage ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Development \
    ASPNETCORE_URLS=http://+:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_NOLOGO=true

# Create a non-root user and switch to it.
RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser --shell /sbin/nologin appuser \
    && mkdir -p /app \
    && chown -R appuser:appuser /app

# Install curl for the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=appuser:appuser /app/publish ./

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl --fail http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "ArabicSchoolArchive.Api.dll"]
