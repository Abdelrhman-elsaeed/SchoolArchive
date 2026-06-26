using System.Text;
using ArabicSchoolArchive.Api.Clients.Azure;
using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Middleware;
using ArabicSchoolArchive.Api.Repositories;
using ArabicSchoolArchive.Api.Services;
using ArabicSchoolArchive.Api.Subscriptions;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.InMemory;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<UploadOptions>(
    builder.Configuration.GetSection(UploadOptions.SectionName));
builder.Services.Configure<N8nOptions>(
    builder.Configuration.GetSection(N8nOptions.SectionName));
builder.Services.Configure<BlobOptions>(
    builder.Configuration.GetSection(BlobOptions.SectionName));
builder.Services.Configure<AuthOptions>(
    builder.Configuration.GetSection(AuthOptions.SectionName));
builder.Services.Configure<RateLimitOptions>(
    builder.Configuration.GetSection(RateLimitOptions.SectionName));
builder.Services.Configure<CorsOptions>(
    builder.Configuration.GetSection(CorsOptions.SectionName));
builder.Services.Configure<SubscriptionOptions>(
    builder.Configuration.GetSection(SubscriptionOptions.SectionName));

var connectionString = builder.Configuration.GetConnectionString("AzureSql");
if (!string.IsNullOrEmpty(connectionString))
{
    builder.Services.AddDbContext<ArchiveDbContext>(options =>
        options.UseSqlServer(connectionString));
}
else
{
    builder.Services.AddDbContext<ArchiveDbContext>(options =>
        options.UseInMemoryDatabase("ArchiveDb"));
}

builder.Services.AddSingleton(TimeProvider.System);

var blobConnection = builder.Configuration.GetSection(BlobOptions.SectionName)["ConnectionString"];
if (!string.IsNullOrEmpty(blobConnection))
{
    builder.Services.AddSingleton(_ => new BlobServiceClient(blobConnection));
}
else
{
    builder.Services.AddSingleton(_ => new BlobServiceClient("UseDevelopmentStorage=true;"));
}

builder.Services.AddHttpClient<IN8nClient, N8nClient>();
builder.Services.AddScoped<IFileValidator, FileValidator>();
builder.Services.AddScoped<IFileSignatureValidator, FileSignatureValidator>();
builder.Services.AddScoped<IBlobStorageService, BlobStorageService>();
builder.Services.AddScoped<IBlobDownloadService, BlobDownloadService>();
builder.Services.AddScoped<IBlobSasGenerator, BlobSasGenerator>();
builder.Services.AddScoped<IArchiveRepository, ArchiveRepository>();
builder.Services.AddScoped<IArchiveReadRepository, ArchiveReadRepository>();
builder.Services.AddSingleton<IAuditLog, AuditLog>();
builder.Services.AddScoped<IUploadOrchestrator, UploadOrchestrator>();
builder.Services.AddSingleton<ISubscriptionStore, ConfigSubscriptionStore>();

var authSection = builder.Configuration.GetSection(AuthOptions.SectionName);
var authOptions = authSection.Get<AuthOptions>() ?? new AuthOptions();
var isDevelopment = builder.Environment.IsDevelopment();

var defaultAuthScheme = isDevelopment && authOptions.DevBypassEnabled
    ? "MultiAuth"
    : JwtBearerDefaults.AuthenticationScheme;

var authenticationBuilder = builder.Services
    .AddAuthentication(defaultAuthScheme)
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
    // Phase 2.5 - dev-only fallback scheme. Active ONLY when the host
    // environment is "Development" AND Auth:DevBypassEnabled is true.
    // The handler itself re-checks both conditions on every request.
    //
    // We register the JWT scheme as the default but tell it to FORWARD
    // to the dev-bypass scheme when no JWT is supplied. That way the
    // authentication middleware invokes the dev-bypass handler as part
    // of the default scheme's pipeline, instead of treating the missing
    // Bearer token as a hard authentication failure.
    authenticationBuilder.AddScheme<DevBypassAuthOptions, DevBypassAuthHandler>(
        DevBypassAuthHandler.SchemeName,
        _ => { });

    authenticationBuilder.AddPolicyScheme(
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

builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder(
            defaultAuthScheme)
        .RequireAuthenticatedUser()
        .Build();
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var corsSection = builder.Configuration.GetSection(CorsOptions.SectionName);
var corsOptions = corsSection.Get<CorsOptions>() ?? new CorsOptions();
if (corsOptions.AllowedOrigins.Any(o => o == "*"))
{
    throw new InvalidOperationException(
        "Cors:AllowedOrigins must not contain '*'. Use an explicit allowlist.");
}
if (corsOptions.AllowedOrigins.Length > 0)
{
    builder.Services.AddCors(options =>
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

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 25L * 1024 * 1024;
});

var app = builder.Build();

if (corsOptions.AllowedOrigins.Length > 0)
{
    app.UseCors();
}
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<SubscriptionGuardMiddleware>();
app.UseMiddleware<RateLimitMiddleware>();
app.MapControllers();

app.Run();

public partial class Program { }
