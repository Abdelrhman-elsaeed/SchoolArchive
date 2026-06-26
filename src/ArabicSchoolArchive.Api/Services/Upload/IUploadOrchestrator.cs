using ArabicSchoolArchive.Api.Dtos;

namespace ArabicSchoolArchive.Api.Services.Upload;

public interface IUploadOrchestrator
{
    Task<SingleFileUploadResponse> UploadAsync(
        IFormFile file,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<BatchUploadResponse> UploadBatchAsync(
        IReadOnlyList<IFormFile> files,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken);
}
