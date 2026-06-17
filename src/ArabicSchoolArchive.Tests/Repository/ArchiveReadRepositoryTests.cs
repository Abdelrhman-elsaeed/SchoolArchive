using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using ArabicSchoolArchive.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ArabicSchoolArchive.Tests.Repository;

public class ArchiveReadRepositoryTests
{
    private static ArchiveDbContext NewDb() =>
        new(new DbContextOptionsBuilder<ArchiveDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static ArchiveReadRepository NewRepo(ArchiveDbContext db) =>
        new(db, NullLogger<ArchiveReadRepository>.Instance);

    private static Archive MakeRow(
        Guid schoolId,
        string name,
        string? category,
        DateTime uploadedAt,
        int year,
        byte month,
        long size = 1024,
        string? displayName = null,
        string? summary = null,
        List<string>? tags = null,
        double? confidence = null,
        bool needsReview = false)
    {
        var documentId = Guid.NewGuid();
        var row = new Archive
        {
            DocumentId = documentId,
            SchoolId = schoolId,
            OriginalName = name,
            SafeName = name.Replace(' ', '_'),
            BlobObjectName = $"schools/{schoolId}/archive/{year:0000}/{month:00}/{documentId}_{name}",
            SizeBytes = size,
            MimeType = "application/pdf",
            Category = category,
            DisplayName = displayName,
            Summary = summary,
            Confidence = confidence,
            NeedsReview = needsReview,
            UploadedByUserId = Guid.NewGuid(),
            UploadedAtUtc = uploadedAt,
            ProcessingYear = year,
            ProcessingMonth = month,
            ContentHashSha256 = null
        };
        row.Tags = tags ?? new List<string>();
        return row;
    }

    [Fact]
    public async Task ListAsync_FiltersBySchoolId()
    {
        var db = NewDb();
        var schoolA = Guid.NewGuid();
        var schoolB = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(schoolA, "alpha.pdf",   "تقرير",  new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(schoolA, "beta.pdf",    "كشف",    new DateTime(2026, 6, 2, 10, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(schoolB, "gamma.pdf",   "تقرير",  new DateTime(2026, 6, 3, 10, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(schoolB, "delta.pdf",   "أخرى",   new DateTime(2026, 6, 4, 10, 0, 0, DateTimeKind.Utc), 2026, 6));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(
            schoolA, new ArchiveListQuery(), CancellationToken.None);

        Assert.Equal(2, total);
        Assert.Equal(2, items.Count);
        Assert.All(items, a => Assert.Equal(schoolA, a.SchoolId));
        Assert.Equal(new[] { "beta.pdf", "alpha.pdf" },
            items.Select(a => a.OriginalName).ToArray());
    }

    [Fact]
    public async Task ListAsync_SearchByNameAndCategory()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "تقرير_الغياب.pdf",  "تقرير إداري", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "كشف_الدرجات.pdf",   "كشف درجات",   new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "نموذج_تقرير.pdf",   "تقرير إداري", new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "صورة_اليوم.jpg",     "صور",         new DateTime(2026, 6, 4, 0, 0, 0, DateTimeKind.Utc), 2026, 6));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(
            school,
            new ArchiveListQuery { OriginalNameContains = "تقرير", Category = "تقرير إداري" },
            CancellationToken.None);

        Assert.Equal(2, total);
        Assert.All(items, a => Assert.Equal(school, a.SchoolId));
        Assert.All(items, a => Assert.Equal("تقرير إداري", a.Category));
        Assert.All(items, a => Assert.Contains("تقرير", a.OriginalName));
    }

    [Fact]
    public async Task GetByDocumentIdAsync_SameSchool_ReturnsRow()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        var row = MakeRow(school, "alpha.pdf", "تقرير", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6);
        db.Archives.Add(row);
        await db.SaveChangesAsync();

        var item = await NewRepo(db).GetByDocumentIdAsync(school, row.DocumentId, CancellationToken.None);
        Assert.NotNull(item);
        Assert.Equal(row.DocumentId, item!.DocumentId);
        Assert.Equal("alpha.pdf", item.OriginalName);
    }

    [Fact]
    public async Task GetByDocumentIdAsync_DifferentSchool_ReturnsNull()
    {
        var db = NewDb();
        var owner = Guid.NewGuid();
        var attacker = Guid.NewGuid();
        var row = MakeRow(owner, "alpha.pdf", "تقرير", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6);
        db.Archives.Add(row);
        await db.SaveChangesAsync();

        var item = await NewRepo(db).GetByDocumentIdAsync(attacker, row.DocumentId, CancellationToken.None);
        Assert.Null(item);
    }

    [Fact]
    public async Task ListAsync_Pagination_RoundTrip()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        for (var i = 0; i < 25; i++)
        {
            db.Archives.Add(MakeRow(school, $"file_{i:00}.pdf", "تقرير",
                new DateTime(2026, 6, 1, 0, 0, i, DateTimeKind.Utc), 2026, 6));
        }
        await db.SaveChangesAsync();

        var repo = NewRepo(db);
        var (page1, total1) = await repo.ListAsync(school,
            new ArchiveListQuery { Page = 1, PageSize = 10 }, CancellationToken.None);
        var (page2, total2) = await repo.ListAsync(school,
            new ArchiveListQuery { Page = 2, PageSize = 10 }, CancellationToken.None);
        var (page3, total3) = await repo.ListAsync(school,
            new ArchiveListQuery { Page = 3, PageSize = 10 }, CancellationToken.None);

        Assert.Equal(25, total1);
        Assert.Equal(25, total2);
        Assert.Equal(25, total3);
        Assert.Equal(10, page1.Count);
        Assert.Equal(10, page2.Count);
        Assert.Equal(5, page3.Count);
        Assert.Empty(page1.Select(a => a.DocumentId)
            .Intersect(page2.Select(a => a.DocumentId)));
        Assert.Empty(page1.Select(a => a.DocumentId)
            .Intersect(page3.Select(a => a.DocumentId)));
    }

    [Fact]
    public async Task ListAsync_EmptyResult_ReturnsZeroTotals()
    {
        var db = NewDb();
        var (items, total) = await NewRepo(db).ListAsync(
            Guid.NewGuid(), new ArchiveListQuery(), CancellationToken.None);

        Assert.Empty(items);
        Assert.Equal(0, total);
    }

    [Fact]
    public async Task ListAsync_FilterByDateRange()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "a.pdf", "تقرير", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "b.pdf", "تقرير", new DateTime(2026, 6, 5, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "c.pdf", "تقرير", new DateTime(2026, 6, 10, 0, 0, 0, DateTimeKind.Utc), 2026, 6),
            MakeRow(school, "d.pdf", "تقرير", new DateTime(2026, 6, 20, 0, 0, 0, DateTimeKind.Utc), 2026, 6));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(school,
            new ArchiveListQuery
            {
                UploadedFrom = new DateTime(2026, 6, 4, 0, 0, 0, DateTimeKind.Utc),
                UploadedTo   = new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc)
            },
            CancellationToken.None);

        Assert.Equal(2, total);
        Assert.Equal(new[] { "c.pdf", "b.pdf" },
            items.Select(a => a.OriginalName).ToArray());
    }

    [Fact]
    public async Task ListAsync_FilterByProcessingYearMonth()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "mar.pdf", "تقرير", new DateTime(2025, 3, 15, 0, 0, 0, DateTimeKind.Utc), 2025, 3),
            MakeRow(school, "jun.pdf", "تقرير", new DateTime(2025, 6, 15, 0, 0, 0, DateTimeKind.Utc), 2025, 6),
            MakeRow(school, "jun2.pdf","تقرير", new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc), 2026, 6));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(school,
            new ArchiveListQuery { ProcessingYear = 2025, ProcessingMonth = 6 },
            CancellationToken.None);

        Assert.Equal(1, total);
        Assert.Equal("jun.pdf", items[0].OriginalName);
    }

    [Fact]
    public async Task ListAsync_SearchByDisplayName()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "IMG_2034.PNG", "شهادات", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "شهادة تقدير للمعلم محمود احمد السعيد",
                summary: "شهادة بمناسبة اليوم العالمي للمعلم"),
            MakeRow(school, "scan_001.pdf", "تقارير", new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "تقرير غياب الفصل 3-أ",
                summary: "كشف غياب أسبوعي"));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(school,
            new ArchiveListQuery { OriginalNameContains = "معلم" },
            CancellationToken.None);

        Assert.Equal(1, total);
        Assert.Equal("IMG_2034.PNG", items[0].OriginalName);
    }

    [Fact]
    public async Task ListAsync_SearchBySummary()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "doc1.pdf", "أخرى", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "ملف عام",
                summary: "محتوى اختباري يحتوي على كلمة نادرة مثل سمك القرش"),
            MakeRow(school, "doc2.pdf", "أخرى", new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "ملف ثان",
                summary: "ملخص عادي"));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(school,
            new ArchiveListQuery { OriginalNameContains = "سمك القرش" },
            CancellationToken.None);

        Assert.Equal(1, total);
        Assert.Equal("doc1.pdf", items[0].OriginalName);
    }

    [Fact]
    public async Task ListAsync_SearchAcrossNameAndDisplayNameAndSummary()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        db.Archives.AddRange(
            MakeRow(school, "alpha.pdf", "X", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "matched-by-displayName", summary: "irrelevant"),
            MakeRow(school, "beta.pdf",  "X", new DateTime(2026, 6, 2, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "irrelevant", summary: "matched-by-summary"),
            MakeRow(school, "gamma.pdf", "X", new DateTime(2026, 6, 3, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "irrelevant", summary: "irrelevant"),
            MakeRow(school, "matched-by-originalName.pdf", "X", new DateTime(2026, 6, 4, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
                displayName: "irrelevant", summary: "irrelevant"));
        await db.SaveChangesAsync();

        var (items, total) = await NewRepo(db).ListAsync(school,
            new ArchiveListQuery { OriginalNameContains = "matched" },
            CancellationToken.None);

        Assert.Equal(3, total);
        Assert.Contains(items, i => i.OriginalName == "alpha.pdf");
        Assert.Contains(items, i => i.OriginalName == "beta.pdf");
        Assert.Contains(items, i => i.OriginalName == "matched-by-originalName.pdf");
    }

    [Fact]
    public async Task GetByDocumentIdAsync_ReturnsRichMetadata()
    {
        var db = NewDb();
        var school = Guid.NewGuid();
        var row = MakeRow(school, "doc.pdf", "شهادات", new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc), 2026, 6,
            displayName: "عنوان ذكاء اصطناعي",
            summary: "ملخص ذكاء اصطناعي",
            tags: new List<string> { "معلم", "تقدير" },
            confidence: 0.95,
            needsReview: true);
        db.Archives.Add(row);
        await db.SaveChangesAsync();

        var item = await NewRepo(db).GetByDocumentIdAsync(school, row.DocumentId, CancellationToken.None);
        Assert.NotNull(item);
        Assert.Equal("عنوان ذكاء اصطناعي", item!.DisplayName);
        Assert.Equal("ملخص ذكاء اصطناعي", item.Summary);
        Assert.Equal(new[] { "معلم", "تقدير" }, item.Tags);
        Assert.Equal(0.95, item.Confidence);
        Assert.True(item.NeedsReview);
    }
}
