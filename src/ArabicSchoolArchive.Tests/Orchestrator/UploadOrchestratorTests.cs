using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using ArabicSchoolArchive.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace ArabicSchoolArchive.Tests.Orchestrator;

public class UploadOrchestratorTests
{
    private readonly Mock<IN8nClient> _n8n = new();
    private readonly Mock<IBlobStorageService> _blob = new();
    private readonly ArchiveDbContext _db;

    public UploadOrchestratorTests()
    {
        var opts = new DbContextOptionsBuilder<ArchiveDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _db = new ArchiveDbContext(opts);
    }

    private UploadOrchestrator BuildOrchestrator() => new(
        new FileValidator(),
        _n8n.Object,
        _blob.Object,
        new ArchiveRepository(_db, NullLogger<ArchiveRepository>.Instance),
        Options.Create(new UploadOptions()),
        NullLogger<UploadOrchestrator>.Instance,
        TimeProvider.System);

    private static IFormFile MakeFile(string name, int size, string mime = "application/pdf")
    {
        var bytes = new byte[size];
        new Random(42).NextBytes(bytes);
        var ms = new MemoryStream(bytes);
        return new FormFile(ms, 0, size, "file", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = mime
        };
    }

    [Fact]
    public async Task Success_PersistsRow_ReturnsSuccess()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(true, "تقرير إداري", null, null));

        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/test/archive/2026/06/abc_report.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("report.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var orch = BuildOrchestrator();
        var schoolId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var file = MakeFile("report.pdf", 1024);

        var resp = await orch.UploadAsync(file, schoolId, userId, CancellationToken.None);

        Assert.Equal("Success", resp.Status);
        Assert.NotNull(resp.DocumentId);
        Assert.Equal("تقرير إداري", resp.Category);
        Assert.Equal(1024, resp.SizeBytes);
        Assert.Equal(file.FileName, resp.OriginalName);
        Assert.Single(_db.Archives);
    }

    [Fact]
    public async Task ValidationFails_NoN8nCall_NoBlobCall_NoDbRow()
    {
        var orch = BuildOrchestrator();
        var file = MakeFile("malware.exe", 100, "application/octet-stream");

        var resp = await orch.UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Rejected", resp.Status);
        Assert.Equal("EXTENSION_NOT_ALLOWED", resp.ReasonCode);
        Assert.Null(resp.DocumentId);
        _n8n.VerifyNoOtherCalls();
        _blob.VerifyNoOtherCalls();
        Assert.Empty(_db.Archives);
    }

    [Fact]
    public async Task N8nFails_NoBlobCall_NoDbRow()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(false, null, "timeout", "N8N_TIMEOUT"));

        var file = MakeFile("report.pdf", 1024);
        var resp = await BuildOrchestrator().UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Failed", resp.Status);
        Assert.Equal("N8N_TIMEOUT", resp.ReasonCode);
        _blob.Verify(x => x.UploadAsync(
            It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()),
            Times.Never);
        Assert.Empty(_db.Archives);
    }

    [Fact]
    public async Task BlobFails_NoDbRow()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(true, "تقرير", null, null));

        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/test/archive/2026/06/blobpath.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("report.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(false, "Azure error"));

        var file = MakeFile("report.pdf", 1024);
        var resp = await BuildOrchestrator().UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Failed", resp.Status);
        Assert.Equal("BLOB_FAILED", resp.ReasonCode);
        Assert.Empty(_db.Archives);
    }

    [Fact]
    public async Task DbFails_AfterBlobSuccess_ReturnsDbFailed()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(true, "تقرير", null, null));

        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/test/archive/2026/06/blobpath.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("report.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var badDbOpts = new DbContextOptionsBuilder<ArchiveDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var badDb = new ThrowingDbContext(badDbOpts);
        var orch = new UploadOrchestrator(
            new FileValidator(), _n8n.Object, _blob.Object,
            new ArchiveRepository(badDb, NullLogger<ArchiveRepository>.Instance),
            Options.Create(new UploadOptions()),
            NullLogger<UploadOrchestrator>.Instance,
            TimeProvider.System);

        var file = MakeFile("report.pdf", 1024);
        var resp = await orch.UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Failed", resp.Status);
        Assert.Equal("DB_FAILED", resp.ReasonCode);
    }

    [Fact]
    public async Task OriginalName_PreservedInResponse()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(true, "تقرير", null, null));
        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/x/archive/2026/06/p.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("p.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var file = MakeFile("تقرير_الغياب_2026.pdf", 1024);
        var resp = await BuildOrchestrator().UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("تقرير_الغياب_2026.pdf", resp.OriginalName);
    }

    [Fact]
    public async Task BlobUri_HasTenantPrefix()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new N8nResult(true, "تقرير", null, null));
        var schoolId = Guid.NewGuid();
        _blob.Setup(x => x.BuildObjectName(schoolId, It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns($"schools/{schoolId}/archive/2026/06/abc_report.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("report.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var file = MakeFile("report.pdf", 1024);
        var resp = await BuildOrchestrator().UploadAsync(file, schoolId, Guid.NewGuid(), CancellationToken.None);

        Assert.NotNull(resp.BlobUri);
        Assert.StartsWith($"schools/{schoolId}/", resp.BlobUri);
    }

    private sealed class ThrowingDbContext : ArchiveDbContext
    {
        public ThrowingDbContext(DbContextOptions<ArchiveDbContext> options) : base(options) { }
        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("simulated DB failure");
    }
}
