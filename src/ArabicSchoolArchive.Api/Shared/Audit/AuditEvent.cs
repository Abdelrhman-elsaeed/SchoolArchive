namespace ArabicSchoolArchive.Api.Shared.Audit;

public enum AuditOutcome
{
    Success,
    Rejected,
    Failed,
    ForbiddenTenantAccess,
    RateLimited
}

public enum AuditAction
{
    Upload,
    BrowseList,
    BrowseGetById,
    BrowseDownload,
    BrowseContent
}

public sealed class AuditEvent
{
    public AuditAction Action { get; set; }
    public AuditOutcome Outcome { get; set; }
    public string? ReasonCode { get; set; }
    public string? Message { get; set; }
    public Guid? SchoolId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? DocumentId { get; set; }
    public string? OriginalName { get; set; }
    public string? HttpMethod { get; set; }
    public string? HttpPath { get; set; }
    public int? HttpStatusCode { get; set; }
    public string? RemoteIp { get; set; }
    public DateTime OccurredAtUtc { get; set; }
}
