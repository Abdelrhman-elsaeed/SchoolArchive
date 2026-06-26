namespace ArabicSchoolArchive.Api.Dtos;

public sealed class ArchiveListResponse
{
    public IReadOnlyList<ArchiveItemDto> Items { get; set; } = Array.Empty<ArchiveItemDto>();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages { get; set; }
}
