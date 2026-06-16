namespace ArabicSchoolArchive.Api.Dtos;

public enum UploadStatus
{
    Success,
    Rejected,
    Failed
}

public sealed class SingleFileUploadResponse
{
    public string OriginalName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? ReasonCode { get; set; }
    public string Message { get; set; } = string.Empty;
    public Guid? DocumentId { get; set; }
    public string? Category { get; set; }
    public long? SizeBytes { get; set; }
    public string? MimeType { get; set; }
    public string? BlobUri { get; set; }
}

public sealed class ErrorResponse
{
    public string Code { get; set; } = string.Empty;
    public string? RequestId { get; set; }
}
