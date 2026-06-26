using ArabicSchoolArchive.Api.Configuration;

namespace ArabicSchoolArchive.Api.Services.Upload;

public sealed record ValidationResult(bool IsValid, string? ReasonCode, string? Message);

public interface IFileValidator
{
    ValidationResult Validate(IFormFile file, UploadOptions options);
}
