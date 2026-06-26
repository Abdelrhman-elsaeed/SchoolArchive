namespace ArabicSchoolArchive.Api.Dtos;

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
