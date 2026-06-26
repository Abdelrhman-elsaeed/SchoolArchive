namespace ArabicSchoolArchive.Api.Dtos;

public sealed class ArchiveDownloadResponse
{
    public Guid DocumentId { get; set; }
    public string BlobObjectName { get; set; } = string.Empty;
    public string SignedUrl { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public int TtlMinutes { get; set; }
}
