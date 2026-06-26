namespace ArabicSchoolArchive.Api.Dtos;

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

public sealed class BatchUploadResponse
{
    public int TotalFiles { get; set; }
    public int SuccessfulFiles { get; set; }
    public int FailedFiles { get; set; }
    public List<SingleFileUploadResponse> Results { get; set; } = new();
}
