namespace ArabicSchoolArchive.Api.Dtos;

public sealed class ErrorResponse
{
    public string Code { get; set; } = string.Empty;
    public string? RequestId { get; set; }
}
