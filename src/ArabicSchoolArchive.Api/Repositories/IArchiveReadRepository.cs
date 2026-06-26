using ArabicSchoolArchive.Api.Dtos;

namespace ArabicSchoolArchive.Api.Repositories;

public interface IArchiveReadRepository
{
    Task<ArchiveItemDto?> GetByDocumentIdAsync(
        Guid schoolId,
        Guid documentId,
        CancellationToken cancellationToken);

    Task<(IReadOnlyList<ArchiveItemDto> Items, int TotalCount)> ListAsync(
        Guid schoolId,
        ArchiveListQuery query,
        CancellationToken cancellationToken);
}
