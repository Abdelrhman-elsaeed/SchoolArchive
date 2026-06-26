using ArabicSchoolArchive.Api.Configuration;

namespace ArabicSchoolArchive.Api.Services.Upload;

public sealed class FileValidator : IFileValidator
{
    public ValidationResult Validate(IFormFile file, UploadOptions options)
    {
        if (file is null)
        {
            return new ValidationResult(false, "FILENAME_INVALID", "لم يتم استلام أي ملف");
        }

        var name = file.FileName ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name) || name.Length > 512 || name.Contains('\0'))
        {
            return new ValidationResult(false, "FILENAME_INVALID",
                "اسم الملف غير صالح. يرجى إعادة تسمية الملف والمحاولة مجدداً");
        }

        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext) || !options.AllowedExtensions.Contains(ext))
        {
            return new ValidationResult(false, "EXTENSION_NOT_ALLOWED",
                $"نوع الملف غير مدعوم ({ext.ToUpperInvariant().TrimStart('.')}). الأنواع المسموحة: {string.Join(", ", options.AllowedExtensions).ToUpperInvariant()}");
        }

        if (file.Length <= 0)
        {
            return new ValidationResult(false, "SIZE_EXCEEDED", "حجم الملف غير صالح");
        }

        if (file.Length > options.MaxFileSizeBytes)
        {
            var limitMb = options.MaxFileSizeBytes / (1024.0 * 1024.0);
            return new ValidationResult(false, "SIZE_EXCEEDED",
                $"حجم الملف يتجاوز الحد المسموح ({limitMb:0} ميجابايت)");
        }

        var declaredMime = (file.ContentType ?? string.Empty).ToLowerInvariant();
        if (string.IsNullOrEmpty(declaredMime) || !options.AllowedMimeTypes.Contains(declaredMime))
        {
            return new ValidationResult(false, "MIME_MISMATCH",
                "نوع المحتوى المعلن للملف غير مسموح به");
        }

        return new ValidationResult(true, null, null);
    }
}