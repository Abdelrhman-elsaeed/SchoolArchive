using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ArabicSchoolArchive.Tests.Controller;

public class ArchiveUploadControllerTests : IClassFixture<ArchiveUploadControllerTests.Factory>
{
    private const string SchoolIdHeader = "X-Dev-School-Id";
    private const string UserIdHeader = "X-Dev-User-Id";

    private readonly Factory _factory;

    public ArchiveUploadControllerTests(Factory factory)
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

    private static MultipartFormDataContent BuildSingleFile(string fieldName, string fileName, byte[] bytes, string contentType)
    {
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(part, fieldName, fileName);
        return content;
    }

    private static MultipartFormDataContent BuildMultiFile(
        string fieldName,
        IEnumerable<(string fileName, byte[] bytes, string mime)> files)
    {
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        foreach (var (fileName, bytes, mime) in files)
        {
            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = new MediaTypeHeaderValue(mime);
            content.Add(part, fieldName, fileName);
        }
        return content;
    }

    private static byte[] Bytes(int size)
    {
        var b = new byte[size];
        new Random(42).NextBytes(b);
        return b;
    }

    [Fact]
    public async Task SingleFileEndpoint_BackwardCompat_ReturnsSingleFileShape()
    {
        var client = CreateClient(Guid.NewGuid());
        var content = BuildSingleFile("file", "legacy.pdf", Bytes(512), "application/pdf");
        var resp = await client.PostAsync("/api/v1/archive/upload", content);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"originalName\":\"legacy.pdf\"", json);
        Assert.Contains("\"status\":", json);
        Assert.DoesNotContain("\"results\":", json);
        Assert.DoesNotContain("\"totalFiles\":", json);
    }

    [Fact]
    public async Task MultiFileEndpoint_ReturnsEnvelope()
    {
        var client = CreateClient(Guid.NewGuid());
        var content = BuildMultiFile("files", new (string, byte[], string)[]
        {
            ("a.pdf", Bytes(512), "application/pdf"),
            ("b.pdf", Bytes(1024), "application/pdf")
        });
        var resp = await client.PostAsync("/api/v1/archive/upload", content);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"totalFiles\":2", json);
        Assert.Contains("\"results\":", json);
        Assert.Contains("\"originalName\":\"a.pdf\"", json);
        Assert.Contains("\"originalName\":\"b.pdf\"", json);
    }

    [Fact]
    public async Task EmptyFiles_Returns400EmptyBatch()
    {
        var client = CreateClient(Guid.NewGuid());
        var content = new MultipartFormDataContent("----TestBoundary" + Guid.NewGuid().ToString("N"));
        content.Add(new StringContent("placeholder"), "_dummy", "_dummy");
        var resp = await client.PostAsync("/api/v1/archive/upload", content);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"code\":\"EMPTY_BATCH\"", json);
    }

    [Fact]
    public async Task NoAuthHeaders_Returns401()
    {
        var client = _factory.CreateClient();
        var content = BuildSingleFile("file", "x.pdf", Bytes(128), "application/pdf");
        var resp = await client.PostAsync("/api/v1/archive/upload", content);

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task BatchSizeExceeded_Returns400BodyTooLarge()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(SchoolIdHeader, Guid.NewGuid().ToString());
        var overLimit = Bytes(700 * 1024);
        var content = BuildMultiFile("files", new (string, byte[], string)[]
        {
            ("big1.pdf", overLimit, "application/pdf"),
            ("big2.pdf", overLimit, "application/pdf")
        });
        var resp = await client.PostAsync("/api/v1/archive/upload", content);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var json = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"code\":\"BODY_TOO_LARGE\"", json);
    }

    public sealed class Factory : WebApplicationFactory<Program>
    {
        public const long TestMaxBatchSizeBytes = 1024 * 1024;

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
                    ["Upload:MaxBatchSizeBytes"] = TestMaxBatchSizeBytes.ToString(),
                    ["Subscriptions:Enabled"] = "false"
                });
            });
            builder.UseEnvironment("Development");
        }
    }
}
