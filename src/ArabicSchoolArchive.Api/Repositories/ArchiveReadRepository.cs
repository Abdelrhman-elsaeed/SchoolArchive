using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace ArabicSchoolArchive.Api.Repositories;

public sealed class ArchiveReadRepository : IArchiveReadRepository
{
    private readonly ArchiveDbContext _db;
    private readonly ILogger<ArchiveReadRepository> _logger;

    public ArchiveReadRepository(ArchiveDbContext db, ILogger<ArchiveReadRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<ArchiveItemDto?> GetByDocumentIdAsync(
        Guid schoolId,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        if (schoolId == Guid.Empty)
        {
            throw new ArgumentException("schoolId must not be empty", nameof(schoolId));
        }
        if (documentId == Guid.Empty)
        {
            throw new ArgumentException("documentId must not be empty", nameof(documentId));
        }

        var entity = await _db.Archives
            .AsNoTracking()
            .Where(a => a.SchoolId == schoolId && a.DocumentId == documentId)
            .Select(a => new ArchiveItemDto
            {
                DocumentId = a.DocumentId,
                SchoolId = a.SchoolId,
                OriginalName = a.OriginalName,
                SafeName = a.SafeName,
                BlobObjectName = a.BlobObjectName,
                SizeBytes = a.SizeBytes,
                MimeType = a.MimeType,
                Category = a.Category,
                DisplayName = a.DisplayName,
                Summary = a.Summary,
                Tags = a.Tags,
                Confidence = a.Confidence,
                NeedsReview = a.NeedsReview,
                UploadedByUserId = a.UploadedByUserId,
                UploadedAtUtc = a.UploadedAtUtc,
                ProcessingYear = a.ProcessingYear,
                ProcessingMonth = a.ProcessingMonth
            })
            .FirstOrDefaultAsync(cancellationToken);

        return entity;
    }

    public async Task<(IReadOnlyList<ArchiveItemDto> Items, int TotalCount)> ListAsync(
        Guid schoolId,
        ArchiveListQuery query,
        CancellationToken cancellationToken)
    {
        if (schoolId == Guid.Empty)
        {
            throw new ArgumentException("schoolId must not be empty", nameof(schoolId));
        }

        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize;
        if (pageSize < 1) pageSize = 20;
        if (pageSize > 100) pageSize = 100;

        IQueryable<Archive> q = _db.Archives.AsNoTracking().Where(a => a.SchoolId == schoolId);

        if (!string.IsNullOrWhiteSpace(query.OriginalNameContains))
        {
            var needle = query.OriginalNameContains.Trim();
            var like = "%" + needle + "%";
            q = q.Where(a =>
                EF.Functions.Like(a.OriginalName, like) ||
                (a.DisplayName != null && EF.Functions.Like(a.DisplayName, like)) ||
                (a.Summary != null && EF.Functions.Like(a.Summary, like)));
        }

        if (!string.IsNullOrWhiteSpace(query.Category))
        {
            var category = query.Category.Trim();
            q = q.Where(a => a.Category == category);
        }

        if (query.UploadedFrom.HasValue)
        {
            var from = query.UploadedFrom.Value;
            q = q.Where(a => a.UploadedAtUtc >= from);
        }

        if (query.UploadedTo.HasValue)
        {
            var to = query.UploadedTo.Value;
            q = q.Where(a => a.UploadedAtUtc <= to);
        }

        if (query.ProcessingYear.HasValue)
        {
            var year = query.ProcessingYear.Value;
            q = q.Where(a => a.ProcessingYear == year);
        }

        if (query.ProcessingMonth.HasValue)
        {
            var month = query.ProcessingMonth.Value;
            q = q.Where(a => a.ProcessingMonth == month);
        }

        var totalCount = await q.CountAsync(cancellationToken);

        var items = await q
            .OrderByDescending(a => a.UploadedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new ArchiveItemDto
            {
                DocumentId = a.DocumentId,
                SchoolId = a.SchoolId,
                OriginalName = a.OriginalName,
                SafeName = a.SafeName,
                BlobObjectName = a.BlobObjectName,
                SizeBytes = a.SizeBytes,
                MimeType = a.MimeType,
                Category = a.Category,
                DisplayName = a.DisplayName,
                Summary = a.Summary,
                Tags = a.Tags,
                Confidence = a.Confidence,
                NeedsReview = a.NeedsReview,
                UploadedByUserId = a.UploadedByUserId,
                UploadedAtUtc = a.UploadedAtUtc,
                ProcessingYear = a.ProcessingYear,
                ProcessingMonth = a.ProcessingMonth
            })
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }
}