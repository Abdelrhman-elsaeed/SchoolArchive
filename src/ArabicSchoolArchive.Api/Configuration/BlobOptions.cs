namespace ArabicSchoolArchive.Api.Configuration;

public sealed class BlobOptions
{
    public const string SectionName = "Blob";

    public string ConnectionString { get; set; } = string.Empty;
    public string ContainerName { get; set; } = "school-archives";
    public int UploadTimeoutSeconds { get; set; } = 30;
    public int SasTtlMinutes { get; set; } = 10;
    public int SasTtlMinutesMin { get; } = 5;
    public int SasTtlMinutesMax { get; } = 15;
}
