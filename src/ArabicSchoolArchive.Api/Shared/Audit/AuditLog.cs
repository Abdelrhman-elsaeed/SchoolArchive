using System.Text;
using ArabicSchoolArchive.Api.Shared.Logging;

namespace ArabicSchoolArchive.Api.Shared.Audit;

public sealed class AuditLog : IAuditLog
{
    private readonly ILogger<AuditLog> _logger;

    public AuditLog(ILogger<AuditLog> logger)
    {
        _logger = logger;
    }

    public void Record(AuditEvent evt)
    {
        if (evt is null) return;
        if (evt.OccurredAtUtc == default)
        {
            evt.OccurredAtUtc = DateTime.UtcNow;
        }

        var message = FormatForLog(evt);

        if (evt.Outcome == AuditOutcome.Failed || evt.Outcome == AuditOutcome.ForbiddenTenantAccess)
        {
            _logger.LogWarning("{Audit}", message);
        }
        else
        {
            _logger.LogInformation("{Audit}", message);
        }
    }

    private static string FormatForLog(AuditEvent e)
    {
        var sb = new StringBuilder(256);
        sb.Append("action=").Append(e.Action);
        sb.Append(" outcome=").Append(e.Outcome);
        if (!string.IsNullOrEmpty(e.ReasonCode))
        {
            sb.Append(" reasonCode=").Append(LogScrubber.Scrub(e.ReasonCode));
        }
        if (e.SchoolId.HasValue && e.SchoolId.Value != Guid.Empty)
        {
            sb.Append(" schoolId=").Append(e.SchoolId.Value);
        }
        if (e.UserId.HasValue && e.UserId.Value != Guid.Empty)
        {
            sb.Append(" userId=").Append(e.UserId.Value);
        }
        if (e.DocumentId.HasValue && e.DocumentId.Value != Guid.Empty)
        {
            sb.Append(" documentId=").Append(e.DocumentId.Value);
        }
        if (!string.IsNullOrEmpty(e.OriginalName))
        {
            sb.Append(" originalName=").Append(LogScrubber.ScrubOriginalName(e.OriginalName));
        }
        if (!string.IsNullOrEmpty(e.HttpMethod))
        {
            sb.Append(" method=").Append(e.HttpMethod);
        }
        if (!string.IsNullOrEmpty(e.HttpPath))
        {
            sb.Append(" path=").Append(LogScrubber.ScrubPath(e.HttpPath));
        }
        if (e.HttpStatusCode.HasValue)
        {
            sb.Append(" status=").Append(e.HttpStatusCode.Value);
        }
        if (!string.IsNullOrEmpty(e.RemoteIp))
        {
            sb.Append(" remoteIp=").Append(e.RemoteIp);
        }
        if (!string.IsNullOrEmpty(e.Message))
        {
            sb.Append(" message=").Append(LogScrubber.ScrubMessage(e.Message));
        }
        sb.Append(" atUtc=").Append(e.OccurredAtUtc.ToString("O"));
        return sb.ToString();
    }
}