namespace ArabicSchoolArchive.Api.Configuration;

public sealed class UploadOptions
{
    public const string SectionName = "Upload";

    public long MaxFileSizeBytes { get; set; } = 20L * 1024 * 1024;
    public long MaxBatchSizeBytes { get; set; } = 25L * 1024 * 1024;
    public string[] AllowedExtensions { get; set; } = new[]
    {
        ".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"
    };
    public string[] AllowedMimeTypes { get; set; } = new[]
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg"
    };
}
