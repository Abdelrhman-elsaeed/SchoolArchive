namespace ArabicSchoolArchive.Api.Configuration;

public sealed class BlobOptions
{
    public const string SectionName = "Blob";

    public string ConnectionString { get; set; } = string.Empty;
    public string ContainerName { get; set; } = "school-archives";
    public int UploadTimeoutSeconds { get; set; } = 30;
}
