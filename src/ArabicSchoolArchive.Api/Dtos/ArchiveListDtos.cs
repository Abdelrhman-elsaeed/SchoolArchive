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

public sealed class ArchiveListQuery
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? OriginalNameContains { get; set; }
    public string? Category { get; set; }
    public DateTime? UploadedFrom { get; set; }
    public DateTime? UploadedTo { get; set; }
    public int? ProcessingYear { get; set; }
    public byte? ProcessingMonth { get; set; }
}

public sealed class ArchiveListResponse
{
    public IReadOnlyList<ArchiveItemDto> Items { get; set; } = Array.Empty<ArchiveItemDto>();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages { get; set; }
}

public sealed class ArchiveDownloadResponse
{
    public Guid DocumentId { get; set; }
    public string BlobObjectName { get; set; } = string.Empty;
    public string SignedUrl { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public int TtlMinutes { get; set; }
}
