using System.Text.Json;
using ArabicSchoolArchive.Api.Services;
using ArabicSchoolArchive.Api.Subscriptions;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Middleware;

public sealed class SubscriptionGuardMiddleware
{
    private readonly RequestDelegate _next;
    private readonly SubscriptionOptions _options;
    private readonly ISubscriptionStore _store;
    private readonly IAuditLog _auditLog;
    private readonly ILogger<SubscriptionGuardMiddleware> _logger;

    public SubscriptionGuardMiddleware(
        RequestDelegate next,
        IOptions<SubscriptionOptions> options,
        ISubscriptionStore store,
        IAuditLog auditLog,
        ILogger<SubscriptionGuardMiddleware> logger)
    {
        _next = next;
        _options = options.Value;
        _store = store;
        _auditLog = auditLog;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_options.Enabled)
        {
            await _next(context);
            return;
        }

        if (ShouldSkip(context))
        {
            await _next(context);
            return;
        }

        var schoolId = TryGetSchoolId(context);
        if (!schoolId.HasValue || schoolId.Value == Guid.Empty)
        {
            await _next(context);
            return;
        }

        var status = await _store.GetAsync(schoolId.Value, context.RequestAborted);
        if (status.IsAllowed())
        {
            await _next(context);
            return;
        }

        await WriteRejectionAsync(context, status, schoolId.Value);
    }

    private static bool ShouldSkip(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (path.Equals("/health", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private static Guid? TryGetSchoolId(HttpContext context)
    {
        if (context.User?.Identity is null || !context.User.Identity.IsAuthenticated)
        {
            return null;
        }
        var claim = context.User.FindFirst("school_id")?.Value
                    ?? context.User.FindFirst("schoolId")?.Value;
        if (string.IsNullOrEmpty(claim)) return null;
        return Guid.TryParse(claim, out var g) ? g : null;
    }

    private async Task WriteRejectionAsync(
        HttpContext context,
        SubscriptionStatus status,
        Guid schoolId)
    {
        var (httpCode, reasonCode) = status.State switch
        {
            SubscriptionState.Expired => (StatusCodes.Status402PaymentRequired, "SUBSCRIPTION_EXPIRED"),
            SubscriptionState.Suspended => (StatusCodes.Status403Forbidden, "SUBSCRIPTION_SUSPENDED"),
            _ => (StatusCodes.Status403Forbidden, "SUBSCRIPTION_BLOCKED")
        };

        var userId = TryGetUserId(context);

        _auditLog.Record(new AuditEvent
        {
            Action = ClassifyAction(context),
            Outcome = AuditOutcome.ForbiddenTenantAccess,
            ReasonCode = reasonCode,
            Message = $"Subscription state={status.State} for school {schoolId}",
            SchoolId = schoolId,
            UserId = userId,
            HttpMethod = context.Request.Method,
            HttpPath = context.Request.Path.Value,
            HttpStatusCode = httpCode,
            RemoteIp = context.Connection.RemoteIpAddress?.ToString()
        });

        _logger.LogWarning(
            "Subscription guard rejected request: SchoolId={SchoolId} State={State} Path={Path}",
            schoolId, status.State, context.Request.Path.Value);

        context.Response.StatusCode = httpCode;
        context.Response.ContentType = "application/json; charset=utf-8";
        context.Response.Headers["X-Subscription-State"] = status.State.ToString();

        var body = JsonSerializer.Serialize(new
        {
            code = reasonCode,
            state = status.State.ToString(),
            schoolId = schoolId.ToString()
        });
        await context.Response.WriteAsync(body);
    }

    private static Guid? TryGetUserId(HttpContext context)
    {
        var claim = context.User.FindFirst("sub")?.Value
                    ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? context.User.FindFirst("user_id")?.Value;
        if (string.IsNullOrEmpty(claim)) return null;
        return Guid.TryParse(claim, out var g) ? g : null;
    }

    private static AuditAction ClassifyAction(HttpContext context)
    {
        var path = (context.Request.Path.Value ?? string.Empty).ToLowerInvariant();
        var method = context.Request.Method;

        if (method == "POST" && path.Contains("/upload")) return AuditAction.Upload;
        if (method == "GET" && path.Contains("/download")) return AuditAction.BrowseDownload;
        if (method == "GET" && path.Contains("/content")) return AuditAction.BrowseContent;
        if (method == "GET" && System.Text.RegularExpressions.Regex.IsMatch(
            path, @"/api/v\d+/archive/archives/[0-9a-fA-F-]{36}$"))
        {
            return AuditAction.BrowseGetById;
        }
        return AuditAction.BrowseList;
    }
}
