namespace ArabicSchoolArchive.Api.Services.Upload;

public sealed record MagicBytesResult(
    bool IsValid,
    string? ReasonCode,
    string? DetectedFormat,
    string? Message);

public interface IFileSignatureValidator
{
    Task<MagicBytesResult> ValidateAsync(
        Stream fileStream,
        string originalName,
        string declaredMime,
        CancellationToken cancellationToken);
}
