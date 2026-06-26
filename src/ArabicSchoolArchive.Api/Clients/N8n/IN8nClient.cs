namespace ArabicSchoolArchive.Api.Clients.N8n;

public sealed record N8nResult(
    bool Success,
    string? Category,
    string? DisplayName,
    string? Summary,
    IReadOnlyList<string> Tags,
    double? Confidence,
    bool NeedsReview,
    string? FailureReason,
    string? ReasonCode);

public interface IN8nClient
{
    Task<N8nResult> ClassifyAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        Guid schoolId,
        Guid documentId,
        CancellationToken cancellationToken);
}
