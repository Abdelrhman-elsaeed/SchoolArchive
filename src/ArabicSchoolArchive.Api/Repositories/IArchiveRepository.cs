using ArabicSchoolArchive.Api.Entities;

namespace ArabicSchoolArchive.Api.Repositories;

public interface IArchiveRepository
{
    Task SaveAsync(Archive archive, CancellationToken cancellationToken);
}
