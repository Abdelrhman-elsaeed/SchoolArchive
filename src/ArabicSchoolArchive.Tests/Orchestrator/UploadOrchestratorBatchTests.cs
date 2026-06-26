using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Repositories;
using ArabicSchoolArchive.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ArabicSchoolArchive.Tests.Orchestrator;

public class UploadOrchestratorBatchTests
{
    private readonly Mock<IN8nClient> _n8n = new();
    private readonly Mock<IBlobStorageService> _blob = new();
    private readonly ArchiveDbContext _db;

    public UploadOrchestratorBatchTests()
    {
        var opts = new DbContextOptionsBuilder<ArchiveDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ArchiveDbContext(opts);
    }

    private UploadOrchestrator BuildOrchestrator(UploadOptions? options = null) => new(
        new FileValidator(),
        new FileSignatureValidator(),
        _n8n.Object,
        _blob.Object,
        new ArchiveRepository(_db, NullLogger<ArchiveRepository>.Instance),
        new AuditLog(NullLogger<AuditLog>.Instance),
        Options.Create(options ?? new UploadOptions()),
        NullLogger<UploadOrchestrator>.Instance,
        TimeProvider.System);

    private static IFormFile MakeFile(string name, int size, string mime = "application/pdf")
    {
        var bytes = new byte[size];
        new Random(42).NextBytes(bytes);
        if (size >= 5 && (mime == "application/pdf" || name.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)))
        {
            bytes[0] = 0x25; bytes[1] = 0x50; bytes[2] = 0x44; bytes[3] = 0x46; bytes[4] = 0x2D;
        }
        var ms = new MemoryStream(bytes);
        return new FormFile(ms, 0, size, "file", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = mime
        };
    }

    private void SetupSuccessPipeline(string category = "تقرير إداري")
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestN8nResults.Success(category));
        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns<Guid, Guid, string, DateTime>((s, d, _, t) => $"schools/{s}/archive/{t:yyyy}/{t:MM}/{d}_x.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns<string>(s => s);
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));
    }

    [Fact]
    public async Task AllFilesSuccess_PersistsAllRows()
    {
        SetupSuccessPipeline();
        var orch = BuildOrchestrator();
        var files = new List<IFormFile>
        {
            MakeFile("a.pdf", 512),
            MakeFile("b.pdf", 1024),
            MakeFile("c.pdf", 768)
        };
        var resp = await orch.UploadBatchAsync(files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(3, resp.TotalFiles);
        Assert.Equal(3, resp.SuccessfulFiles);
        Assert.Equal(0, resp.FailedFiles);
        Assert.All(resp.Results, r => Assert.Equal("Success", r.Status));
        Assert.Equal(3, _db.Archives.Count());
    }

    [Fact]
    public async Task MixedOutcomes_PartialSuccess()
    {
        SetupSuccessPipeline();
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Stream _, string name, string _, Guid _, Guid _, CancellationToken _) =>
                name == "bad2.pdf"
                    ? TestN8nResults.Failure("N8N_TIMEOUT", "timeout")
                    : TestN8nResults.Success("تقرير"));

        var files = new List<IFormFile>
        {
            MakeFile("good1.pdf", 512),
            MakeFile("bad.exe", 256, "application/octet-stream"),
            MakeFile("good2.pdf", 768),
            MakeFile("bad2.pdf", 1024)
        };
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(4, resp.TotalFiles);
        Assert.Equal(2, resp.SuccessfulFiles);
        Assert.Equal(2, resp.FailedFiles);
        Assert.Equal("good1.pdf", resp.Results[0].OriginalName);
        Assert.Equal("Success", resp.Results[0].Status);
        Assert.Equal("bad.exe", resp.Results[1].OriginalName);
        Assert.Equal("Rejected", resp.Results[1].Status);
        Assert.Equal("EXTENSION_NOT_ALLOWED", resp.Results[1].ReasonCode);
        Assert.Equal("good2.pdf", resp.Results[2].OriginalName);
        Assert.Equal("Success", resp.Results[2].Status);
        Assert.Equal("bad2.pdf", resp.Results[3].OriginalName);
        Assert.Equal("Failed", resp.Results[3].Status);
        Assert.Equal("N8N_TIMEOUT", resp.Results[3].ReasonCode);
        Assert.Equal(2, _db.Archives.Count());
    }

    [Fact]
    public async Task PreservesSubmissionOrder()
    {
        SetupSuccessPipeline();
        var files = new List<IFormFile>
        {
            MakeFile("first.pdf", 100),
            MakeFile("second.pdf", 200),
            MakeFile("third.pdf", 300)
        };
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("first.pdf", resp.Results[0].OriginalName);
        Assert.Equal("second.pdf", resp.Results[1].OriginalName);
        Assert.Equal("third.pdf", resp.Results[2].OriginalName);
    }

    [Fact]
    public async Task EmptyFiles_ReturnsZeroTotals()
    {
        var files = new List<IFormFile>();
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(0, resp.TotalFiles);
        Assert.Equal(0, resp.SuccessfulFiles);
        Assert.Equal(0, resp.FailedFiles);
        Assert.Empty(resp.Results);
    }

    [Fact]
    public async Task EarlierSuccess_Preserved_WhenLaterFails()
    {
        SetupSuccessPipeline();

        var n8nCalls = 0;
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                n8nCalls++;
                return n8nCalls == 1
                    ? TestN8nResults.Success("تقرير")
                    : TestN8nResults.Failure("N8N_HTTP_ERROR", "down");
            });

        var files = new List<IFormFile>
        {
            MakeFile("first.pdf", 100),
            MakeFile("second.pdf", 200)
        };
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Success", resp.Results[0].Status);
        Assert.Equal("Failed", resp.Results[1].Status);
        Assert.NotNull(resp.Results[0].DocumentId);
        Assert.NotNull(resp.Results[1].DocumentId);
        Assert.Equal(1, _db.Archives.Count());
    }

    [Fact]
    public async Task PerFileResults_ContainAllRequiredFields()
    {
        SetupSuccessPipeline();
        var files = new List<IFormFile> { MakeFile("hello.pdf", 100) };
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        var r = resp.Results[0];
        Assert.Equal("hello.pdf", r.OriginalName);
        Assert.Equal("Success", r.Status);
        Assert.NotNull(r.DocumentId);
        Assert.Equal("تقرير إداري", r.Category);
        Assert.Equal(100, r.SizeBytes);
        Assert.Equal("application/pdf", r.MimeType);
        Assert.NotNull(r.BlobUri);
        Assert.Null(r.ReasonCode);
        Assert.False(string.IsNullOrEmpty(r.Message));
    }

    [Fact]
    public async Task UnhandledException_RecordedAsInternalError_Continues()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("boom"));

        var files = new List<IFormFile>
        {
            MakeFile("a.pdf", 100),
            MakeFile("b.pdf", 200)
        };
        var resp = await BuildOrchestrator().UploadBatchAsync(
            files, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(2, resp.TotalFiles);
        Assert.Equal(0, resp.SuccessfulFiles);
        Assert.Equal(2, resp.FailedFiles);
        Assert.Equal("INTERNAL_ERROR", resp.Results[0].ReasonCode);
        Assert.Equal("INTERNAL_ERROR", resp.Results[1].ReasonCode);
    }
}
