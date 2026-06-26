using ArabicSchoolArchive.Api.Clients.Azure;
using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using ArabicSchoolArchive.Api.Repositories;
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
        new FileSignatureValidator(),
        _n8n.Object,
        _blob.Object,
        new ArchiveRepository(_db, NullLogger<ArchiveRepository>.Instance),
        new AuditLog(NullLogger<AuditLog>.Instance),
        Options.Create(new UploadOptions()),
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
        if (size >= 8 && (mime == "image/png" || name.EndsWith(".png", StringComparison.OrdinalIgnoreCase)))
        {
            bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4E; bytes[3] = 0x47;
            bytes[4] = 0x0D; bytes[5] = 0x0A; bytes[6] = 0x1A; bytes[7] = 0x0A;
        }
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
            .ReturnsAsync(TestN8nResults.Success("تقرير إداري"));

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
            .ReturnsAsync(TestN8nResults.Failure("N8N_TIMEOUT", "timeout"));

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
            .ReturnsAsync(TestN8nResults.Success("تقرير"));

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
            .ReturnsAsync(TestN8nResults.Success("تقرير"));

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
            new FileValidator(), new FileSignatureValidator(), _n8n.Object, _blob.Object,
            new ArchiveRepository(badDb, NullLogger<ArchiveRepository>.Instance),
            new AuditLog(NullLogger<AuditLog>.Instance),
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
            .ReturnsAsync(TestN8nResults.Success("تقرير"));
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
            .ReturnsAsync(TestN8nResults.Success("تقرير"));
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

    [Fact]
    public async Task RichN8nMetadata_PersistedToRow()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestN8nResults.SuccessRich(
                category: "شهادات",
                displayName: "شهادة تقدير للمعلم محمود احمد السعيد",
                summary: "شهادة تقدير للمعلم محمود احمد السعيد بمناسبة اليوم العالمي للمعلم",
                tags: new[] { "معلم", "تقدير", "شهادة" },
                confidence: 0.9,
                needsReview: false));

        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/x/archive/2026/06/asdfwef.PNG");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("asdfwef.PNG");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var orch = BuildOrchestrator();
        var file = MakeFile("asdfwef.PNG", 1024, "image/png");
        var resp = await orch.UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Success", resp.Status);
        Assert.Equal("شهادات", resp.Category);
        var row = _db.Archives.Single();
        Assert.Equal("شهادة تقدير للمعلم محمود احمد السعيد", row.DisplayName);
        Assert.Equal("شهادة تقدير للمعلم محمود احمد السعيد بمناسبة اليوم العالمي للمعلم", row.Summary);
        Assert.Equal(new[] { "معلم", "تقدير", "شهادة" }, row.Tags);
        Assert.Equal(0.9, row.Confidence);
        Assert.False(row.NeedsReview);
    }

    [Fact]
    public async Task NeedsReview_TrueFromN8n_IsPersisted()
    {
        _n8n.Setup(x => x.ClassifyAsync(
                It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestN8nResults.SuccessRich(
                category: "غير مصنف",
                displayName: "مستند غير معروف",
                summary: null,
                tags: Array.Empty<string>(),
                confidence: 0.32,
                needsReview: true));

        _blob.Setup(x => x.BuildObjectName(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<DateTime>()))
            .Returns("schools/x/archive/2026/06/mystery.pdf");
        _blob.Setup(x => x.BuildSafeName(It.IsAny<string>())).Returns("mystery.pdf");
        _blob.Setup(x => x.UploadAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Stream>(), It.IsAny<DateTime>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobUploadResult(true, null));

        var file = MakeFile("mystery.pdf", 1024);
        var resp = await BuildOrchestrator().UploadAsync(file, Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);

        Assert.Equal("Success", resp.Status);
        var row = _db.Archives.Single();
        Assert.True(row.NeedsReview);
        Assert.Equal(0.32, row.Confidence);
    }

    private sealed class ThrowingDbContext : ArchiveDbContext
    {
        public ThrowingDbContext(DbContextOptions<ArchiveDbContext> options) : base(options) { }
        public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("simulated DB failure");
    }
}
