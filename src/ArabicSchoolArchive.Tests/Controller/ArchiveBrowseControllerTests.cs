using System.Net;
using System.Text.Json;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ArabicSchoolArchive.Tests.Controller;

public class ArchiveBrowseControllerTests : IClassFixture<ArchiveBrowseControllerTests.Factory>
{
    private const string SchoolIdHeader = "X-Dev-School-Id";
    private const string UserIdHeader = "X-Dev-User-Id";

    private readonly Factory _factory;

    public ArchiveBrowseControllerTests(Factory factory)
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

    [Fact]
    public async Task List_ReturnsOnlyCurrentSchoolRecords()
    {
        var schoolA = Guid.NewGuid();
        var schoolB = Guid.NewGuid();
        await Seed(_factory, schoolA, "a1.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        await Seed(_factory, schoolA, "a2.pdf", new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc));
        await Seed(_factory, schoolB, "b1.pdf", new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(schoolA);
        var resp = await client.GetAsync("/api/v1/archive/archives");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"originalName\":\"a1.pdf\"", json);
        Assert.Contains("\"originalName\":\"a2.pdf\"", json);
        Assert.DoesNotContain("\"originalName\":\"b1.pdf\"", json);
    }

    [Fact]
    public async Task Search_FiltersByNameAndSchoolId()
    {
        var schoolA = Guid.NewGuid();
        var schoolB = Guid.NewGuid();
        await Seed(_factory, schoolA, "تقرير_الغياب.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        await Seed(_factory, schoolA, "كشف_الدرجات.pdf",  new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc));
        await Seed(_factory, schoolB, "تقرير_النقل.pdf",   new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(schoolA);
        var resp = await client.GetAsync("/api/v1/archive/archives?originalNameContains=" + Uri.EscapeDataString("تقرير"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("تقرير_الغياب.pdf", json);
        Assert.DoesNotContain("كشف_الدرجات.pdf", json);
        Assert.DoesNotContain("تقرير_النقل.pdf", json);
    }

    [Fact]
    public async Task GetById_SameSchool_Returns200()
    {
        var school = Guid.NewGuid();
        var id = await Seed(_factory, school, "alpha.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(school);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{id}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"originalName\":\"alpha.pdf\"", json);
    }

    [Fact]
    public async Task GetById_OtherSchool_Returns404_NoLeak()
    {
        var owner = Guid.NewGuid();
        var attacker = Guid.NewGuid();
        var id = await Seed(_factory, owner, "alpha.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(attacker);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{id}");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("alpha.pdf", json);
        Assert.DoesNotContain(id.ToString(), json);
    }

    [Fact]
    public async Task Download_SameSchool_ReturnsSignedUrl()
    {
        var school = Guid.NewGuid();
        var id = await Seed(_factory, school, "alpha.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(school);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{id}/download");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        Assert.Equal(id.ToString(), root.GetProperty("documentId").GetString());
        Assert.True(root.TryGetProperty("signedUrl", out var signedUrlEl));
        var signedUrl = signedUrlEl.GetString();
        Assert.False(string.IsNullOrEmpty(signedUrl));
        Assert.Contains("sv=", signedUrl);
        Assert.Contains("sr=b", signedUrl);
        Assert.Contains("sp=r", signedUrl);
        Assert.Contains("se=", signedUrl);
        Assert.Contains(school.ToString(), signedUrl);
    }

    [Fact]
    public async Task Download_OtherSchool_Returns404_NoLeak()
    {
        var owner = Guid.NewGuid();
        var attacker = Guid.NewGuid();
        var id = await Seed(_factory, owner, "alpha.pdf", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc));

        var client = CreateClient(attacker);
        var resp = await client.GetAsync($"/api/v1/archive/archives/{id}/download");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("alpha.pdf", json);
        Assert.DoesNotContain(id.ToString(), json);
        Assert.DoesNotContain("signedUrl", json);
    }

    [Fact]
    public async Task Pagination_RoundTripsPageAndPageSize()
    {
        var school = Guid.NewGuid();
        for (var i = 0; i < 12; i++)
        {
            await Seed(_factory, school, $"file_{i:00}.pdf",
                new DateTime(2026, 6, 1, 0, 0, i, DateTimeKind.Utc));
        }

        var client = CreateClient(school);
        var p1 = await client.GetAsync("/api/v1/archive/archives?page=1&pageSize=5");
        var p2 = await client.GetAsync("/api/v1/archive/archives?page=2&pageSize=5");
        var p3 = await client.GetAsync("/api/v1/archive/archives?page=3&pageSize=5");

        Assert.Equal(HttpStatusCode.OK, p1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, p2.StatusCode);
        Assert.Equal(HttpStatusCode.OK, p3.StatusCode);

        var p1Json = await p1.Content.ReadAsStringAsync();
        var p2Json = await p2.Content.ReadAsStringAsync();
        var p3Json = await p3.Content.ReadAsStringAsync();
        Assert.Contains("\"page\":1", p1Json);
        Assert.Contains("\"pageSize\":5", p1Json);
        Assert.Contains("\"totalCount\":12", p1Json);
        Assert.Contains("\"totalPages\":3", p1Json);
        Assert.Contains("\"page\":2", p2Json);
        Assert.Contains("\"page\":3", p3Json);
    }

    [Fact]
    public async Task EmptyResult_ReturnsCleanResponse()
    {
        var client = CreateClient(Guid.NewGuid());
        var resp = await client.GetAsync("/api/v1/archive/archives");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"totalCount\":0", json);
        Assert.Contains("\"totalPages\":0", json);
        Assert.Contains("\"items\":[]", json);
    }

    [Fact]
    public async Task List_NoAuthHeaders_Returns401()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/v1/archive/archives");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    private static async Task<Guid> Seed(Factory factory, Guid schoolId, string name, DateTime uploadedAt)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ArchiveDbContext>();
        var documentId = Guid.NewGuid();
        var safe = name.Replace(' ', '_');
        db.Archives.Add(new Archive
        {
            DocumentId = documentId,
            SchoolId = schoolId,
            OriginalName = name,
            SafeName = safe,
            BlobObjectName = $"schools/{schoolId}/archive/{uploadedAt:yyyy}/{uploadedAt:MM}/{documentId}_{safe}",
            SizeBytes = 1024,
            MimeType = "application/pdf",
            Category = "تقرير",
            UploadedByUserId = Guid.NewGuid(),
            UploadedAtUtc = uploadedAt,
            ProcessingYear = uploadedAt.Year,
            ProcessingMonth = (byte)uploadedAt.Month,
            ContentHashSha256 = null
        });
        await db.SaveChangesAsync();
        return documentId;
    }

    public sealed class Factory : WebApplicationFactory<Program>
    {
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
                    ["Blob:SasTtlMinutes"] = "10",
                    ["LocalDev:DownloadStreamEnabled"] = "false",
                    ["Subscriptions:Enabled"] = "false"
                });
            });
            builder.UseEnvironment("Development");
        }
    }
}
