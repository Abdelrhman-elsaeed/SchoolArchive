using ArabicSchoolArchive.Api.Configuration;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Subscriptions;

public sealed class ConfigSubscriptionStore : ISubscriptionStore
{
    private readonly SubscriptionOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<ConfigSubscriptionStore> _logger;
    private readonly Dictionary<Guid, SubscriptionEntry> _bySchool;

    public ConfigSubscriptionStore(
        IOptions<SubscriptionOptions> options,
        TimeProvider timeProvider,
        ILogger<ConfigSubscriptionStore> logger)
    {
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
        _bySchool = BuildIndex(_options);
    }

    public Task<SubscriptionStatus> GetAsync(Guid schoolId, CancellationToken cancellationToken)
    {
        if (schoolId == Guid.Empty)
        {
            return Task.FromResult(SubscriptionStatus.Active(schoolId));
        }

        if (_bySchool.TryGetValue(schoolId, out var entry))
        {
            return Task.FromResult(Materialize(schoolId, entry));
        }

        return Task.FromResult(SubscriptionStatus.Active(schoolId));
    }

    private SubscriptionStatus Materialize(Guid schoolId, SubscriptionEntry entry)
    {
        var state = ParseState(entry.State);
        var status = new SubscriptionStatus
        {
            SchoolId = schoolId,
            State = state,
            ExpiresAtUtc = TryParseUtc(entry.ExpiresAtUtc),
            GraceUntilUtc = TryParseUtc(entry.GraceUntilUtc),
            Reason = entry.Reason
        };

        if (state == SubscriptionState.Active)
        {
            var now = _timeProvider.GetUtcNow().UtcDateTime;
            if (status.ExpiresAtUtc.HasValue && now > status.ExpiresAtUtc.Value)
            {
                var graceUntil = status.GraceUntilUtc
                    ?? status.ExpiresAtUtc.Value.AddDays(_options.DefaultGracePeriodDays);
                if (now <= graceUntil)
                {
                    status.State = SubscriptionState.GracePeriod;
                    status.GraceUntilUtc = graceUntil;
                }
                else
                {
                    status.State = SubscriptionState.Expired;
                    status.Reason = "SUBSCRIPTION_EXPIRED";
                }
            }
        }

        return status;
    }

    private static SubscriptionState ParseState(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return SubscriptionState.Active;
        return raw.Trim().ToLowerInvariant() switch
        {
            "active" => SubscriptionState.Active,
            "grace" or "graceperiod" or "grace_period" => SubscriptionState.GracePeriod,
            "expired" => SubscriptionState.Expired,
            "suspended" => SubscriptionState.Suspended,
            _ => SubscriptionState.Active
        };
    }

    private static DateTime? TryParseUtc(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParse(
            raw,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
            out var dt))
        {
            return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        }
        return null;
    }

    private static Dictionary<Guid, SubscriptionEntry> BuildIndex(SubscriptionOptions options)
    {
        var map = new Dictionary<Guid, SubscriptionEntry>();
        if (options.Schools is null) return map;
        foreach (var entry in options.Schools)
        {
            if (string.IsNullOrWhiteSpace(entry.SchoolId)) continue;
            if (!Guid.TryParse(entry.SchoolId, out var g)) continue;
            if (g == Guid.Empty) continue;
            map[g] = entry;
        }
        return map;
    }
}
