using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace ArabicSchoolArchive.Api.Repositories;

public sealed class ArchiveRepository : IArchiveRepository
{
    private readonly ArchiveDbContext _db;
    private readonly ILogger<ArchiveRepository> _logger;

    public ArchiveRepository(ArchiveDbContext db, ILogger<ArchiveRepository> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task SaveAsync(Archive archive, CancellationToken cancellationToken)
    {
        _db.Archives.Add(archive);
        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation(
            "Archive row inserted: DocumentId={DocumentId} SchoolId={SchoolId} Size={Size} Category={Category}",
            archive.DocumentId, archive.SchoolId, archive.SizeBytes, archive.Category);
    }
}