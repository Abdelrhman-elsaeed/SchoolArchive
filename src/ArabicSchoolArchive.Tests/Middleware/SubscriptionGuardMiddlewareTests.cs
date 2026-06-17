using System.Net;
using System.Net.Http.Headers;
using System.Text;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ArabicSchoolArchive.Tests.Middleware;

public class SubscriptionGuardMiddlewareTests : IClassFixture<SubscriptionGuardMiddlewareTests.Factory>
{
    private const string SchoolIdHeader = "X-Dev-School-Id";
    private const string UserIdHeader = "X-Dev-User-Id";

    private readonly Factory _factory;

    public SubscriptionGuardMiddlewareTests(Factory factory)
    {
        _factory = factory;
    }

    private HttpClient CreateClient(Guid schoolId, Guid? userId = null)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(SchoolIdHeader, schoolId.ToString());
        if (userId.HasValue)
        {
            client.DefaultRequestHeaders.Add(UserIdHeader, userId.Value.ToString());
        }
        return client;
    }

    private static MultipartFormDataContent BuildUpload(string fieldName, string fileName, byte[] bytes, string contentType)
    {
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(part, fieldName, fileName);
        return content;
    }

    private static byte[] PdfBytes()
    {
        return new byte[]
        {
            0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A,
            0x25, 0x25, 0x45, 0x4F, 0x46
        };
    }

    [Fact]
    public async Task ActiveTenant_CanUpload()
    {
        var client = CreateClient(Factory.SchoolActive);
        var resp = await client.PostAsync("/api/v1/archive/upload",
            BuildUpload("file", "ok.pdf", PdfBytes(), "application/pdf"));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("SUBSCRIPTION_EXPIRED", json);
        Assert.DoesNotContain("SUBSCRIPTION_SUSPENDED", json);
    }

    [Fact]
    public async Task GracePeriodTenant_CanUpload()
    {
        var client = CreateClient(Factory.SchoolGrace);
        var resp = await client.PostAsync("/api/v1/archive/upload",
            BuildUpload("file", "ok.pdf", PdfBytes(), "application/pdf"));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("SUBSCRIPTION_EXPIRED", json);
        Assert.DoesNotContain("SUBSCRIPTION_SUSPENDED", json);
    }

    [Fact]
    public async Task ExpiredTenant_UploadReturns402()
    {
        var client = CreateClient(Factory.SchoolExpired);
        var resp = await client.PostAsync("/api/v1/archive/upload",
            BuildUpload("file", "ok.pdf", PdfBytes(), "application/pdf"));

        Assert.Equal(HttpStatusCode.PaymentRequired, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("SUBSCRIPTION_EXPIRED", json);
    }

    [Fact]
    public async Task SuspendedTenant_UploadReturns403()
    {
        var client = CreateClient(Factory.SchoolSuspended);
        var resp = await client.PostAsync("/api/v1/archive/upload",
            BuildUpload("file", "ok.pdf", PdfBytes(), "application/pdf"));

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("SUBSCRIPTION_SUSPENDED", json);
    }

    [Fact]
    public async Task ActiveTenant_CanBrowseSearch()
    {
        var client = CreateClient(Factory.SchoolActive);
        var resp = await client.GetAsync("/api/v1/archive/archives?originalNameContains=anything");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task ExpiredTenant_BrowseSearchReturns402()
    {
        var client = CreateClient(Factory.SchoolExpired);
        var resp = await client.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.PaymentRequired, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("SUBSCRIPTION_EXPIRED", json);
    }

    [Fact]
    public async Task SuspendedTenant_DownloadReturns403()
    {
        var owner = Factory.SchoolActive;
        var docId = await SeedDocForSchool(owner, "secret.pdf");

        var attacker = CreateClient(Factory.SchoolSuspended);
        var resp = await attacker.GetAsync($"/api/v1/archive/archives/{docId}/download");

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("SUBSCRIPTION_SUSPENDED", json);
    }

    [Fact]
    public async Task Unauthenticated_Remains401_Not402Or403()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsync("/api/v1/archive/upload",
            BuildUpload("file", "ok.pdf", PdfBytes(), "application/pdf"));
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Unauthenticated_GetById_Remains401()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/v1/archive/archives/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task TenantStateResolvedBySchoolId_NotUserId()
    {
        var school = Factory.SchoolSuspended;
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();

        var clientA = CreateClient(school, userA);
        var respA = await clientA.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.Forbidden, respA.StatusCode);
        Assert.Contains("SUBSCRIPTION_SUSPENDED", await respA.Content.ReadAsStringAsync());

        var clientB = CreateClient(school, userB);
        var respB = await clientB.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.Forbidden, respB.StatusCode);
        Assert.Contains("SUBSCRIPTION_SUSPENDED", await respB.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownSchool_FallsBackToActive_AndCanBrowse()
    {
        var client = CreateClient(Guid.NewGuid());
        var resp = await client.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task HealthEndpoint_IsExempt()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task ExpiredTenant_GetById_Returns402()
    {
        var owner = Factory.SchoolActive;
        var docId = await SeedDocForSchool(owner, "alpha.pdf");

        var client = CreateClient(Factory.SchoolExpired);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{docId}");
        Assert.Equal(HttpStatusCode.PaymentRequired, resp.StatusCode);
        Assert.Contains("SUBSCRIPTION_EXPIRED", await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task SuspendedTenant_ListArchives_Returns403()
    {
        var client = CreateClient(Factory.SchoolSuspended);
        var resp = await client.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        Assert.Contains("SUBSCRIPTION_SUSPENDED", await resp.Content.ReadAsStringAsync());
    }

    private async Task<Guid> SeedDocForSchool(Guid schoolId, string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ArchiveDbContext>();
        var documentId = Guid.NewGuid();
        db.Archives.Add(new Archive
        {
            DocumentId = documentId,
            SchoolId = schoolId,
            OriginalName = name,
            SafeName = name.Replace(' ', '_'),
            BlobObjectName = $"schools/{schoolId}/archive/2026/06/{documentId}_{name}",
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
        return documentId;
    }

    public sealed class Factory : WebApplicationFactory<Program>
    {
        public static readonly Guid SchoolActive = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        public static readonly Guid SchoolGrace = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        public static readonly Guid SchoolExpired = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
        public static readonly Guid SchoolSuspended = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");

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
                    ["RateLimit:UploadPerMinute"] = "1000",
                    ["RateLimit:ReadPerMinute"] = "1000",
                    ["RateLimit:CleanupIntervalSeconds"] = "60",
                    ["RateLimit:IdleEntryTtlSeconds"] = "600",
                    ["Cors:AllowedOrigins"] = "",
                    ["Subscriptions:Enabled"] = "true",
                    ["Subscriptions:DefaultGracePeriodDays"] = "7",
                    ["Subscriptions:Schools:0:SchoolId"] = SchoolActive.ToString(),
                    ["Subscriptions:Schools:0:State"] = "Active",
                    ["Subscriptions:Schools:1:SchoolId"] = SchoolGrace.ToString(),
                    ["Subscriptions:Schools:1:State"] = "GracePeriod",
                    ["Subscriptions:Schools:1:GraceUntilUtc"] = "2026-12-31T23:59:59Z",
                    ["Subscriptions:Schools:2:SchoolId"] = SchoolExpired.ToString(),
                    ["Subscriptions:Schools:2:State"] = "Expired",
                    ["Subscriptions:Schools:3:SchoolId"] = SchoolSuspended.ToString(),
                    ["Subscriptions:Schools:3:State"] = "Suspended"
                });
            });
            builder.UseEnvironment("Development");
        }
    }
}
