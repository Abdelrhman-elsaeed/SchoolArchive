using ArabicSchoolArchive.Api.Services;
using Xunit;

namespace ArabicSchoolArchive.Tests.Services;

public class BlobStorageServiceSafeNameTests
{
    private readonly BlobStorageService _service = MakeService();

    private static BlobStorageService MakeService() => new(
        new Azure.Storage.Blobs.BlobServiceClient("UseDevelopmentStorage=true;"),
        Microsoft.Extensions.Options.Options.Create(new ArabicSchoolArchive.Api.Configuration.BlobOptions()),
        Microsoft.Extensions.Logging.Abstractions.NullLogger<BlobStorageService>.Instance);

    [Fact]
    public void SafeName_ReplacesSpacesWithUnderscore()
    {
        var safe = _service.BuildSafeName("تقرير الغياب 2026.pdf");
        Assert.Equal("تقرير_الغياب_2026.pdf", safe);
    }

    [Fact]
    public void SafeName_ReplacesSpecialChars()
    {
        var safe = _service.BuildSafeName("name<>:\"/\\|?.txt");
        Assert.DoesNotContain("<", safe);
        Assert.DoesNotContain(">", safe);
        Assert.DoesNotContain(":", safe);
        Assert.DoesNotContain("?", safe);
    }

    [Fact]
    public void SafeName_CollapsesMultipleUnderscores()
    {
        var safe = _service.BuildSafeName("a___b.pdf");
        Assert.DoesNotContain("__", safe);
    }

    [Fact]
    public void SafeName_StripsLeadingDotsAndUnderscores()
    {
        var safe = _service.BuildSafeName("..file.pdf");
        Assert.False(safe.StartsWith("."), $"safe started with dot: {safe}");
    }

    [Fact]
    public void SafeName_EmptyFallbackIsFile()
    {
        var safe = _service.BuildSafeName("");
        Assert.Equal("file", safe);
    }

    [Fact]
    public void SafeName_TruncatesAt100Chars()
    {
        var longName = new string('a', 150) + ".pdf";
        var safe = _service.BuildSafeName(longName);
        Assert.True(safe.Length <= 100, $"safe length was {safe.Length}");
    }

    [Fact]
    public void ObjectName_StartsWithTenantPrefix()
    {
        var schoolId = Guid.NewGuid();
        var docId = Guid.NewGuid();
        var ts = new DateTime(2026, 6, 16, 0, 0, 0, DateTimeKind.Utc);
        var name = _service.BuildObjectName(schoolId, docId, "report.pdf", ts);
        Assert.StartsWith($"schools/{schoolId}/archive/2026/06/{docId}_", name);
    }
}
