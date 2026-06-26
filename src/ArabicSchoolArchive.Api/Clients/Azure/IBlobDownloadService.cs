namespace ArabicSchoolArchive.Api.Clients.Azure;

public sealed record BlobDownloadResult(bool Success, Stream? Content, string? ContentType, string? FailureReason);

public interface IBlobDownloadService
{
    Task<BlobDownloadResult> OpenReadAsync(
        Guid schoolId,
        string blobObjectName,
        CancellationToken cancellationToken);
}
