using System.Net;
using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ArabicSchoolArchive.Tests.Services;

public class N8nClientTests
{
    private static N8nClient NewClient(HttpMessageHandler handler, N8nOptions? options = null) =>
        new(
            new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            },
            Options.Create(options ?? new N8nOptions
            {
                WebhookUrl = "https://n8n.test/webhook",
                TimeoutSeconds = 15,
                SharedSecret = "secret"
            }),
            NullLogger<N8nClient>.Instance);

    [Fact]
    public async Task ClassifyAsync_ParsesRichPayload_PrefersPrimaryCategory()
    {
        var body = """
        {
            "success": true,
            "original_name": "asdfwef.PNG",
            "mime_type": "image/png",
            "pages": 1,
            "status": "ocr_parsed",
            "primary_category": "شهادات",
            "secondary_categories": [],
            "detected_custom_topics": [],
            "tags": ["معلم", "تقدير", "شهادة"],
            "related_topics": ["معلم", "مدرسة", "التقدير"],
            "display_name": "شهادة تقدير للمعلم محمود احمد السعيد",
            "summary": "شهادة تقدير للمعلم محمود احمد السعيد بمناسبة اليوم العالمي للمعلم",
            "confidence": 0.9,
            "needs_review": false,
            "needs_taxonomy_update": false
        }
        """;
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(new byte[] { 1, 2, 3 }),
            "asdfwef.PNG",
            "image/png",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.True(result.Success);
        Assert.Equal("شهادات", result.Category);
        Assert.Equal("شهادة تقدير للمعلم محمود احمد السعيد", result.DisplayName);
        Assert.Equal("شهادة تقدير للمعلم محمود احمد السعيد بمناسبة اليوم العالمي للمعلم", result.Summary);
        Assert.Equal(new[] { "معلم", "تقدير", "شهادة" }, result.Tags);
        Assert.Equal(0.9, result.Confidence);
        Assert.False(result.NeedsReview);
    }

    [Fact]
    public async Task ClassifyAsync_FallsBackToCategory_WhenPrimaryCategoryMissing()
    {
        var body = """{ "category": "تقارير", "tags": ["تقرير"] }""";
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.True(result.Success);
        Assert.Equal("تقارير", result.Category);
    }

    [Fact]
    public async Task ClassifyAsync_ReturnsInvalidResponse_WhenCategoryMissing()
    {
        var body = """{ "display_name": "فقط عنوان" }""";
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.False(result.Success);
        Assert.Equal("N8N_INVALID_RESPONSE", result.ReasonCode);
    }

    [Fact]
    public async Task ClassifyAsync_NeedsReview_True_Propagates()
    {
        var body = """{ "primary_category": "غير مصنف", "needs_review": true, "confidence": 0.3 }""";
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.True(result.Success);
        Assert.True(result.NeedsReview);
        Assert.Equal(0.3, result.Confidence);
    }

    [Fact]
    public async Task ClassifyAsync_Confidence_ClampedToUnitInterval()
    {
        var body = """{ "primary_category": "X", "confidence": 1.7 }""";
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Equal(1.0, result.Confidence);
    }

    [Fact]
    public async Task ClassifyAsync_TrimsWhitespace_FromStrings()
    {
        var body = """{ "primary_category": "  تقارير  ", "display_name": "  عنوان  " }""";
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Equal("تقارير", result.Category);
        Assert.Equal("عنوان", result.DisplayName);
    }

    [Fact]
    public async Task ClassifyAsync_LimitsTags_To32_AndCropsEachTo64()
    {
        var longTag = new string('x', 80);
        var tags = Enumerable.Range(0, 40).Select(i => $"tag{i}").ToList();
        tags[5] = longTag;
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            primary_category = "X",
            tags
        });
        var handler = new StubHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(json)
        });
        var client = NewClient(handler);

        var result = await client.ClassifyAsync(
            new MemoryStream(),
            "x.pdf",
            "application/pdf",
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Equal(32, result.Tags.Count);
        Assert.All(result.Tags, t => Assert.True(t.Length <= 64));
    }

    [Fact]
    public async Task ClassifyAsync_ArabicFileName_ReplacedByAsciiDocumentName_AndOriginalSentSeparately()
    {
        var captured = new CapturingHandler();
        var client = NewClient(captured);
        var docId = Guid.Parse("aabbccdd-eeff-0011-2233-445566778899");

        await client.ClassifyAsync(
            new MemoryStream(new byte[] { 1, 2, 3 }),
            "تقرير_الغياب_2026.pdf",
            "application/pdf",
            Guid.NewGuid(),
            docId,
            CancellationToken.None);

        var raw = captured.LastRequestBody!;
        Assert.NotNull(raw);
        Assert.Contains($"name=file; filename=document_{docId:N}.pdf", raw);
        Assert.Contains("name=originalName", raw);
        Assert.Contains("تقرير_الغياب_2026.pdf", raw);
        Assert.DoesNotContain("=?utf-8?B?", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ClassifyAsync_FileNameWithoutExtension_StillSafeAscii()
    {
        var captured = new CapturingHandler();
        var client = NewClient(captured);
        var docId = Guid.NewGuid();

        await client.ClassifyAsync(
            new MemoryStream(new byte[] { 1 }),
            "noext",
            "application/octet-stream",
            Guid.NewGuid(),
            docId,
            CancellationToken.None);

        var raw = captured.LastRequestBody!;
        Assert.NotNull(raw);
        Assert.Contains(docId.ToString("N"), raw);
        Assert.Contains("noext", raw);
    }

    [Fact]
    public void BuildSafeAsciiFileName_StripsNonAsciiExtensions()
    {
        var docId = Guid.NewGuid();
        var result = N8nClient.BuildSafeAsciiFileName("ملف.بدي", docId);
        Assert.Equal($"document_{docId:N}", result);
    }

    [Fact]
    public void BuildSafeAsciiFileName_PreservesKnownAsciiExtension()
    {
        var docId = Guid.NewGuid();
        Assert.Equal($"document_{docId:N}.xlsx",
            N8nClient.BuildSafeAsciiFileName("تقرير.xlsx", docId));
    }

    private static bool IsAscii(string s)
    {
        foreach (var c in s) if (c > 127) return false;
        return true;
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;
        public StubHandler(HttpResponseMessage response) => _response = response;
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(_response);
    }

    private sealed class CapturingHandler : HttpMessageHandler
    {
        public string? LastRequestBody { get; private set; }
        public string? LastRequestContentType { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Content is not null)
            {
                LastRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
                LastRequestContentType = request.Content.Headers.ContentType?.ToString();
            }
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{ "primary_category": "X" }""")
            };
        }
    }
}
