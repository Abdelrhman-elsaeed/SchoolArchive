using System.Text;
using ArabicSchoolArchive.Api.Clients.Azure;
using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Repositories;
using ArabicSchoolArchive.Api.Services.Upload;
using ArabicSchoolArchive.Api.Shared.Audit;
using ArabicSchoolArchive.Api.Subscriptions;
using ArabicSchoolArchive.Api.Transport.Auth;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.InMemory;
using Microsoft.IdentityModel.Tokens;

namespace ArabicSchoolArchive.Api.Configuration;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all strongly-typed options sections from configuration.
    /// </summary>
    public static IServiceCollection AddArchiveOptions(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<UploadOptions>(configuration.GetSection(UploadOptions.SectionName));
        services.Configure<N8nOptions>(configuration.GetSection(N8nOptions.SectionName));
        services.Configure<BlobOptions>(configuration.GetSection(BlobOptions.SectionName));
        services.Configure<AuthOptions>(configuration.GetSection(AuthOptions.SectionName));
        services.Configure<RateLimitOptions>(configuration.GetSection(RateLimitOptions.SectionName));
        services.Configure<CorsOptions>(configuration.GetSection(CorsOptions.SectionName));
        services.Configure<SubscriptionOptions>(configuration.GetSection(SubscriptionOptions.SectionName));
        services.Configure<LocalDevOptions>(configuration.GetSection(LocalDevOptions.SectionName));
        return services;
    }

    /// <summary>
    /// Registers the EF Core database context.
    /// Uses SQL Server when a connection string is present, in-memory otherwise.
    /// </summary>
    public static IServiceCollection AddArchiveDatabase(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("AzureSql");
        if (!string.IsNullOrEmpty(connectionString))
        {
            services.AddDbContext<ArchiveDbContext>(options =>
                options.UseSqlServer(connectionString));
        }
        else
        {
            services.AddDbContext<ArchiveDbContext>(options =>
                options.UseInMemoryDatabase("ArchiveDb"));
        }
        return services;
    }

    /// <summary>
    /// Registers the Azure Blob Storage singleton client.
    /// Uses Azurite (UseDevelopmentStorage=true) when no connection string is configured.
    /// </summary>
    public static IServiceCollection AddArchiveStorage(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton(TimeProvider.System);

        var blobConnection = configuration
            .GetSection(BlobOptions.SectionName)["ConnectionString"];

        services.AddSingleton(_ => string.IsNullOrEmpty(blobConnection)
            ? new BlobServiceClient("UseDevelopmentStorage=true;")
            : new BlobServiceClient(blobConnection));

        return services;
    }

    /// <summary>
    /// Registers all application services, repositories, and infrastructure clients.
    /// </summary>
    public static IServiceCollection AddArchiveServices(this IServiceCollection services)
    {
        services.AddHttpClient<IN8nClient, N8nClient>();
        services.AddScoped<IFileValidator, FileValidator>();
        services.AddScoped<IFileSignatureValidator, FileSignatureValidator>();
        services.AddScoped<IBlobStorageService, AzureBlobStorageClient>();
        services.AddScoped<IBlobDownloadService, AzureBlobDownloadClient>();
        services.AddScoped<IBlobSasGenerator, AzureBlobSasClient>();
        services.AddScoped<IArchiveRepository, ArchiveRepository>();
        services.AddScoped<IArchiveReadRepository, ArchiveReadRepository>();
        services.AddSingleton<IAuditLog, AuditLog>();
        services.AddScoped<IUploadOrchestrator, UploadOrchestrator>();
        services.AddSingleton<ISubscriptionStore, ConfigSubscriptionStore>();
        return services;
    }

    /// <summary>
    /// Configures JWT Bearer authentication. When DevBypassEnabled is true in
    /// a Development environment a MultiAuth policy scheme is added that falls
    /// back to the dev-bypass handler when no Bearer token is present.
    /// </summary>
    public static IServiceCollection AddArchiveAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        var authOptions = configuration
            .GetSection(AuthOptions.SectionName)
            .Get<AuthOptions>() ?? new AuthOptions();
        var isDevelopment = environment.IsDevelopment();

        var defaultScheme = isDevelopment && authOptions.DevBypassEnabled
            ? "MultiAuth"
            : JwtBearerDefaults.AuthenticationScheme;

        var authBuilder = services
            .AddAuthentication(defaultScheme)
            .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.RequireHttpsMetadata = authOptions.RequireHttpsMetadata;
                options.SaveToken = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = !string.IsNullOrEmpty(authOptions.Issuer),
                    ValidIssuer = authOptions.Issuer,
                    ValidateAudience = !string.IsNullOrEmpty(authOptions.Audience),
                    ValidAudience = authOptions.Audience,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = !string.IsNullOrEmpty(authOptions.SigningKey),
                    IssuerSigningKey = string.IsNullOrEmpty(authOptions.SigningKey)
                        ? null
                        : new SymmetricSecurityKey(Encoding.UTF8.GetBytes(authOptions.SigningKey)),
                    ClockSkew = TimeSpan.FromSeconds(authOptions.ClockSkewSeconds),
                    NameClaimType = "sub"
                };
            });

        if (isDevelopment && authOptions.DevBypassEnabled)
        {
            // Phase 2.5 — dev-only fallback scheme. Active ONLY when the host
            // environment is "Development" AND Auth:DevBypassEnabled is true.
            // The handler itself re-checks both conditions on every request.
            //
            // We register the JWT scheme as the default but tell it to FORWARD
            // to the dev-bypass scheme when no JWT is supplied. That way the
            // authentication middleware invokes the dev-bypass handler as part
            // of the default scheme's pipeline instead of treating the missing
            // Bearer token as a hard authentication failure.
            authBuilder.AddScheme<DevBypassAuthOptions, DevBypassAuthHandler>(
                DevBypassAuthHandler.SchemeName,
                _ => { });

            authBuilder.AddPolicyScheme(
                "MultiAuth",
                "JWT first, DevBypass fallback (Development only)",
                options =>
                {
                    options.ForwardDefaultSelector = context =>
                    {
                        var hasBearer = context.Request.Headers
                            .TryGetValue("Authorization", out var auth)
                            && auth.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
                        return hasBearer
                            ? JwtBearerDefaults.AuthenticationScheme
                            : DevBypassAuthHandler.SchemeName;
                    };
                });
        }

        services.AddAuthorization(options =>
        {
            options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder(
                    defaultScheme)
                .RequireAuthenticatedUser()
                .Build();
        });

        return services;
    }

    /// <summary>
    /// Configures the CORS default policy from the Cors config section.
    /// Wildcards in AllowedOrigins are rejected at startup.
    /// </summary>
    public static IServiceCollection AddArchiveCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var corsOptions = configuration
            .GetSection(CorsOptions.SectionName)
            .Get<CorsOptions>() ?? new CorsOptions();

        if (corsOptions.AllowedOrigins.Any(o => o == "*"))
        {
            throw new InvalidOperationException(
                "Cors:AllowedOrigins must not contain '*'. Use an explicit allowlist.");
        }

        if (corsOptions.AllowedOrigins.Length > 0)
        {
            services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                {
                    policy.WithOrigins(corsOptions.AllowedOrigins)
                          .WithMethods(corsOptions.AllowedMethods)
                          .WithHeaders(corsOptions.AllowedHeaders)
                          .SetPreflightMaxAge(TimeSpan.FromSeconds(corsOptions.PreflightMaxAgeSeconds));
                    if (corsOptions.AllowCredentials)
                    {
                        policy.AllowCredentials();
                    }
                });
            });
        }

        return services;
    }
}
