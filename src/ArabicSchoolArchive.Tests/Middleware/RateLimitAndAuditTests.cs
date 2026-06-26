using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ArabicSchoolArchive.Api.Clients.Azure;
using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace ArabicSchoolArchive.Tests.Middleware;

public class RateLimitAndAuditTests : IClassFixture<RateLimitAndAuditTests.Factory>
{
    private const string SchoolIdHeader = "X-Dev-School-Id";
    private const string UserIdHeader = "X-Dev-User-Id";

    private readonly Factory _factory;

    public RateLimitAndAuditTests(Factory factory)
    {
        _factory = factory;
        ((Factory)factory).LogProvider.Reset();
    }

    private HttpClient CreateClient(Guid schoolId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(SchoolIdHeader, schoolId.ToString());
        return client;
    }

    [Fact]
    public async Task UploadRateLimit_Returns429_AfterCap()
    {
        var client = CreateClient(Guid.NewGuid());
        var bytes = Encoding.UTF8.GetBytes("hello");
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        content.Add(part, "file", "test.txt");

        HttpResponseMessage? last = null;
        for (var i = 0; i < 5; i++)
        {
            last = await client.PostAsync("/api/v1/archive/upload", content);
        }

        Assert.NotNull(last);
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        Assert.True(last.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task ReadRateLimit_Returns429_AfterCap()
    {
        var client = CreateClient(Guid.NewGuid());
        HttpResponseMessage? last = null;
        for (var i = 0; i < 12; i++)
        {
            last = await client.GetAsync("/api/v1/archive/archives");
        }

        Assert.NotNull(last);
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        var body = await last.Content.ReadAsStringAsync();
        Assert.Contains("RATE_LIMITED", body);
    }

    [Fact]
    public async Task AuditLog_RecordsUploadAction()
    {
        var provider = _factory.LogProvider;
        provider.Reset();

        var client = CreateClient(Guid.NewGuid());
        var pdf = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A };
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(pdf);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(part, "file", "report.pdf");

        var resp = await client.PostAsync("/api/v1/archive/upload", content);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var entries = provider.Snapshot();
        Assert.Contains(entries, e =>
            e.Contains("action=Upload") &&
            (e.Contains("outcome=Success") || e.Contains("outcome=Failed")));
    }

    [Fact]
    public async Task AuditLog_RecordsUploadSuccess_WhenN8nReturnsCategory()
    {
        using var f = new WithMockedN8nFactory();
        f.LogProvider.Reset();

        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(SchoolIdHeader, Guid.NewGuid().ToString());

        var pdf = new byte[]
        {
            0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
            0x25, 0x25, 0x45, 0x4F, 0x46
        };
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(pdf);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(part, "file", "report.pdf");

        var resp = await client.PostAsync("/api/v1/archive/upload", content);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var entries = f.LogProvider.Snapshot();
        Assert.Contains(entries, e =>
            e.Contains("action=Upload") &&
            e.Contains("outcome=Success"));
    }

    [Fact]
    public async Task AuditLog_RecordsRejectedUpload()
    {
        var provider = _factory.LogProvider;
        provider.Reset();

        var client = CreateClient(Guid.NewGuid());
        var bad = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 };
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(bad);
        part.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(part, "file", "malware.pdf");

        var resp = await client.PostAsync("/api/v1/archive/upload", content);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var entries = provider.Snapshot();
        Assert.Contains(entries, e =>
            e.Contains("action=Upload") &&
            e.Contains("outcome=Rejected") &&
            e.Contains("MAGIC_BYTES_MISMATCH"));
    }

    [Fact]
    public async Task AuditLog_RecordsForbiddenCrossTenantAccess()
    {
        var provider = _factory.LogProvider;
        provider.Reset();

        var owner = Guid.NewGuid();
        var attacker = Guid.NewGuid();
        var docId = Guid.NewGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ArabicSchoolArchive.Api.Data.ArchiveDbContext>();
            db.Archives.Add(new ArabicSchoolArchive.Api.Entities.Archive
            {
                DocumentId = docId,
                SchoolId = owner,
                OriginalName = "secret.pdf",
                SafeName = "secret.pdf",
                BlobObjectName = $"schools/{owner}/archive/2026/06/{docId}_secret.pdf",
                SizeBytes = 1024,
                MimeType = "application/pdf",
                Category = "تقرير",
                UploadedByUserId = Guid.NewGuid(),
                UploadedAtUtc = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc),
                ProcessingYear = 2026,
                ProcessingMonth = 6,
                ContentHashSha256 = null
            });
            await db.SaveChangesAsync();
        }

        var client = CreateClient(attacker);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{docId}");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);

        var entries = provider.Snapshot();
        Assert.Contains(entries, e =>
            e.Contains("action=BrowseGetById") &&
            e.Contains("outcome=ForbiddenTenantAccess") &&
            e.Contains(attacker.ToString()));
    }

    [Fact]
    public async Task Cors_NoAllowedOrigins_NotConfigured()
    {
        var client = CreateClient(Guid.NewGuid());
        var req = new HttpRequestMessage(HttpMethod.Options, "/api/v1/archive/archives");
        req.Headers.Add("Origin", "http://evil.example.com");
        req.Headers.Add("Access-Control-Request-Method", "GET");
        var resp = await client.SendAsync(req);

        Assert.NotNull(resp);
        Assert.False(resp.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public void LogScrubber_StripsSasQueryString()
    {
        var dirty = "Download at https://blob.example/schools/x/archive/y/z.pdf?sv=2021-10-04&sr=b&sp=r&se=2026-06-17T10:15:00Z&sig=abc123";
        var clean = LogScrubber.Scrub(dirty);
        Assert.DoesNotContain("sig=abc123", clean);
        Assert.DoesNotContain("sv=2021-10-04", clean);
    }

    [Fact]
    public void LogScrubber_StripsBearerToken()
    {
        var dirty = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig";
        var clean = LogScrubber.Scrub(dirty);
        Assert.DoesNotContain("eyJhbGciOiJIUzI1NiJ9", clean);
        Assert.Contains("Bearer ***", clean);
    }

    [Fact]
    public void LogScrubber_StripsAccountKey()
    {
        var dirty = "AccountName=devstoreaccount1;AccountKey=THIS_IS_A_SECRET_KEY_VALUE";
        var clean = LogScrubber.Scrub(dirty);
        Assert.DoesNotContain("THIS_IS_A_SECRET_KEY_VALUE", clean);
        Assert.Contains("AccountKey=***", clean);
    }

    [Fact]
    public void LogScrubber_StripsJwtLikeToken()
    {
        var dirty = "raw=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        var clean = LogScrubber.Scrub(dirty);
        Assert.DoesNotContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", clean);
    }

    [Fact]
    public void LogScrubber_StripsSasFromPath()
    {
        var path = "/api/v1/archive/archives/abc/download?signedUrl=https%3A%2F%2Fblob%2Ffile.pdf%3Fsv%3D2021%26sig%3Dxxx";
        var clean = LogScrubber.ScrubPath(path);
        Assert.DoesNotContain("sv=", clean);
        Assert.DoesNotContain("sig=", clean);
    }

    public sealed class Factory : WebApplicationFactory<Program>
    {
        public RecordingLoggerProvider LogProvider { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:AzureSql"] = string.Empty,
                    ["Auth:DevBypassEnabled"] = "true",
                    ["Auth:Issuer"] = string.Empty,
                    ["Auth:Audience"] = string.Empty,
                    ["Auth:SigningKey"] = string.Empty,
                    ["Upload:MaxBatchSizeBytes"] = (1024L * 1024).ToString(),
                    ["Blob:SasTtlMinutes"] = "10",
                    ["LocalDev:DownloadStreamEnabled"] = "false",
                    ["RateLimit:Enabled"] = "true",
                    ["RateLimit:UploadPerMinute"] = "3",
                    ["RateLimit:ReadPerMinute"] = "10",
                    ["RateLimit:CleanupIntervalSeconds"] = "60",
                    ["RateLimit:IdleEntryTtlSeconds"] = "600",
                    ["Cors:AllowedOrigins"] = "",
                    ["Subscriptions:Enabled"] = "false"
                });
            });
            builder.UseEnvironment("Development");
            builder.ConfigureLogging(lb =>
            {
                lb.AddProvider(LogProvider);
            });
        }
    }

    public sealed class WithMockedN8nFactory : WebApplicationFactory<Program>
    {
        public RecordingLoggerProvider LogProvider { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:AzureSql"] = string.Empty,
                    ["Auth:DevBypassEnabled"] = "true",
                    ["Auth:Issuer"] = string.Empty,
                    ["Auth:Audience"] = string.Empty,
                    ["Auth:SigningKey"] = string.Empty,
                    ["Upload:MaxBatchSizeBytes"] = (1024L * 1024).ToString(),
                    ["Blob:SasTtlMinutes"] = "10",
                    ["LocalDev:DownloadStreamEnabled"] = "false",
                    ["RateLimit:Enabled"] = "true",
                    ["RateLimit:UploadPerMinute"] = "100",
                    ["RateLimit:ReadPerMinute"] = "100",
                    ["RateLimit:CleanupIntervalSeconds"] = "60",
                    ["RateLimit:IdleEntryTtlSeconds"] = "600",
                    ["Cors:AllowedOrigins"] = "",
                    ["Subscriptions:Enabled"] = "false"
                });
            });
            builder.UseEnvironment("Development");
            builder.ConfigureServices(services =>
            {
                var n8nExisting = services.FirstOrDefault(d => d.ServiceType == typeof(IN8nClient));
                if (n8nExisting is not null) services.Remove(n8nExisting);
                services.AddScoped<IN8nClient, MockN8nClient>();

                var blobExisting = services.FirstOrDefault(d => d.ServiceType == typeof(IBlobStorageService));
                if (blobExisting is not null) services.Remove(blobExisting);
                services.AddScoped<IBlobStorageService, MockBlobStorageService>();
            });
            builder.ConfigureLogging(lb =>
            {
                lb.AddProvider(LogProvider);
            });
        }
    }

    public sealed class MockN8nClient : IN8nClient
    {
        public Task<N8nResult> ClassifyAsync(
            Stream fileStream,
            string fileName,
            string contentType,
            Guid schoolId,
            Guid documentId,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(TestN8nResults.Success("تقرير إداري"));
        }
    }

    public sealed class MockBlobStorageService : IBlobStorageService
    {
        public string BuildObjectName(Guid schoolId, Guid documentId, string originalName, DateTime uploadedAtUtc)
            => $"schools/{schoolId}/archive/{uploadedAtUtc:yyyy}/{uploadedAtUtc:MM}/{documentId}_mock";
        public string BuildSafeName(string originalName) => originalName;
        public Task<BlobUploadResult> UploadAsync(
            Guid schoolId, Guid documentId, string originalName, string contentType,
            Stream content, DateTime uploadedAtUtc, CancellationToken cancellationToken)
            => Task.FromResult(new BlobUploadResult(true, null));
    }

    public sealed class RecordingLoggerProvider : ILoggerProvider
    {
        private readonly List<string> _entries = new();
        private readonly object _sync = new();

        public void Reset()
        {
            lock (_sync) { _entries.Clear(); }
        }

        public IReadOnlyList<string> Snapshot()
        {
            lock (_sync) { return _entries.ToList(); }
        }

        public ILogger CreateLogger(string categoryName) => new RecordingLogger(categoryName, this);

        public void Dispose() { }

        private void Add(string line)
        {
            lock (_sync) { _entries.Add(line); }
        }

        private sealed class RecordingLogger : ILogger
        {
            private readonly string _category;
            private readonly RecordingLoggerProvider _provider;
            public RecordingLogger(string category, RecordingLoggerProvider provider)
            {
                _category = category;
                _provider = provider;
            }
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                var msg = formatter(state, exception);
                _provider.Add($"[{_category}] {msg}");
            }
        }
    }
}
