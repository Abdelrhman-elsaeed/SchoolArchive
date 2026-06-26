namespace ArabicSchoolArchive.Api.Clients.Azure;

public sealed record BlobUploadResult(bool Success, string? FailureReason);

public interface IBlobStorageService
{
    string BuildObjectName(Guid schoolId, Guid documentId, string originalName, DateTime uploadedAtUtc);
    string BuildSafeName(string originalName);
    Task<BlobUploadResult> UploadAsync(
        Guid schoolId,
        Guid documentId,
        string originalName,
        string contentType,
        Stream content,
        DateTime uploadedAtUtc,
        CancellationToken cancellationToken);
}
