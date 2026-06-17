using System.Collections.Concurrent;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Services;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Middleware;

public sealed class RateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly RateLimitOptions _options;
    private readonly IAuditLog _auditLog;
    private readonly ILogger<RateLimitMiddleware> _logger;
    private readonly ConcurrentDictionary<string, BucketState> _buckets = new();
    private readonly TimeProvider _timeProvider;
    private long _lastCleanupTicks;

    public RateLimitMiddleware(
        RequestDelegate next,
        IOptions<RateLimitOptions> options,
        IAuditLog auditLog,
        ILogger<RateLimitMiddleware> logger,
        TimeProvider timeProvider)
    {
        _next = next;
        _options = options.Value;
        _auditLog = auditLog;
        _logger = logger;
        _timeProvider = timeProvider;
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

        var policy = ClassifyPolicy(context);
        var limit = policy == RateLimitPolicy.Upload ? _options.UploadPerMinute : _options.ReadPerMinute;
        var key = ResolveKey(context);

        MaybeCleanup();

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var bucket = _buckets.GetOrAdd(key, _ => new BucketState(limit, now));
        lock (bucket.SyncRoot)
        {
            if (now >= bucket.WindowStartUtc.AddMinutes(1))
            {
                bucket.WindowStartUtc = now;
                bucket.Count = 0;
            }
            bucket.Count++;
        }

        if (bucket.Count > limit)
        {
            var retryAfter = (int)Math.Max(1,
                (bucket.WindowStartUtc.AddMinutes(1) - now).TotalSeconds);

            _auditLog.Record(new AuditEvent
            {
                Action = policy == RateLimitPolicy.Upload
                    ? AuditAction.Upload
                    : AuditAction.BrowseList,
                Outcome = AuditOutcome.RateLimited,
                ReasonCode = "RATE_LIMITED",
                Message = $"Per-{policy} cap exceeded ({limit} per minute)",
                SchoolId = TryGetSchoolId(context),
                HttpMethod = context.Request.Method,
                HttpPath = context.Request.Path.Value,
                HttpStatusCode = StatusCodes.Status429TooManyRequests,
                RemoteIp = context.Connection.RemoteIpAddress?.ToString()
            });

            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            context.Response.Headers["Retry-After"] = retryAfter.ToString();
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(
                $"{{\"code\":\"RATE_LIMITED\",\"scope\":\"{policy}\",\"retryAfterSeconds\":{retryAfter}}}");
            return;
        }

        await _next(context);
    }

    private static bool ShouldSkip(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (path.Equals("/health", StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private static RateLimitPolicy ClassifyPolicy(HttpContext context)
    {
        var path = (context.Request.Path.Value ?? string.Empty).ToLowerInvariant();
        var method = context.Request.Method;

        if (method == "POST" && path.Contains("/upload"))
        {
            return RateLimitPolicy.Upload;
        }
        return RateLimitPolicy.Read;
    }

    private static string ResolveKey(HttpContext context)
    {
        var schoolId = TryGetSchoolId(context);
        if (schoolId.HasValue && schoolId.Value != Guid.Empty)
        {
            return schoolId.Value.ToString("N");
        }
        var ip = context.Connection.RemoteIpAddress?.ToString();
        return "ip:" + (ip ?? "unknown");
    }

    private static Guid? TryGetSchoolId(HttpContext context)
    {
        var claim = context.User.FindFirst("school_id")?.Value
                    ?? context.User.FindFirst("schoolId")?.Value;
        if (string.IsNullOrEmpty(claim)) return null;
        return Guid.TryParse(claim, out var g) ? g : null;
    }

    private void MaybeCleanup()
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var last = DateTime.FromBinary(Interlocked.Read(ref _lastCleanupTicks));
        if ((now - last).TotalSeconds < _options.CleanupIntervalSeconds) return;
        if (!Interlocked.CompareExchange(ref _lastCleanupTicks,
            now.Ticks, last.Ticks).Equals(last.Ticks)) return;

        var ttl = TimeSpan.FromSeconds(_options.IdleEntryTtlSeconds);
        foreach (var kv in _buckets)
        {
            BucketState state;
            lock (kv.Value.SyncRoot)
            {
                state = new BucketState(kv.Value.Limit, kv.Value.WindowStartUtc)
                {
                    Count = kv.Value.Count
                };
            }
            if (now - state.WindowStartUtc > ttl)
            {
                _buckets.TryRemove(kv.Key, out _);
            }
        }
    }

    private enum RateLimitPolicy { Upload, Read }

    private sealed class BucketState
    {
        public BucketState(int limit, DateTime windowStartUtc)
        {
            Limit = limit;
            WindowStartUtc = windowStartUtc;
        }
        public readonly object SyncRoot = new();
        public int Limit { get; }
        public DateTime WindowStartUtc;
        public int Count;
    }
}
