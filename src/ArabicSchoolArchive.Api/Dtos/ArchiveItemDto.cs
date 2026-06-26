namespace ArabicSchoolArchive.Api.Dtos;

public sealed class ArchiveItemDto
{
    public Guid DocumentId { get; set; }
    public Guid SchoolId { get; set; }
    public string OriginalName { get; set; } = string.Empty;
    public string SafeName { get; set; } = string.Empty;
    public string BlobObjectName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string MimeType { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? DisplayName { get; set; }
    public string? Summary { get; set; }
    public IReadOnlyList<string> Tags { get; set; } = Array.Empty<string>();
    public double? Confidence { get; set; }
    public bool NeedsReview { get; set; }
    public Guid UploadedByUserId { get; set; }
    public DateTime UploadedAtUtc { get; set; }
    public int ProcessingYear { get; set; }
    public byte ProcessingMonth { get; set; }
}
