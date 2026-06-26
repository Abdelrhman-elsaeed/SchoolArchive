using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Subscriptions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ArabicSchoolArchive.Tests.Subscriptions;

public class ConfigSubscriptionStoreTests
{
    private static ConfigSubscriptionStore NewStore(
        SubscriptionOptions options,
        DateTime? nowUtc = null)
    {
        var time = new FixedTimeProvider(nowUtc ?? new DateTime(2026, 6, 17, 0, 0, 0, DateTimeKind.Utc));
        return new ConfigSubscriptionStore(
            Options.Create(options),
            time,
            NullLogger<ConfigSubscriptionStore>.Instance);
    }

    [Fact]
    public async Task UnknownSchool_IsActive()
    {
        var store = NewStore(new SubscriptionOptions());
        var status = await store.GetAsync(Guid.NewGuid(), CancellationToken.None);
        Assert.Equal(SubscriptionState.Active, status.State);
    }

    [Fact]
    public async Task ActiveEntry_IsActive()
    {
        var school = Guid.NewGuid();
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = school.ToString(), State = "Active" }
            }
        });
        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.Active, status.State);
    }

    [Fact]
    public async Task ExpiredEntry_IsExpired()
    {
        var school = Guid.NewGuid();
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = school.ToString(), State = "Expired" }
            }
        });
        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.Expired, status.State);
    }

    [Fact]
    public async Task SuspendedEntry_IsSuspended()
    {
        var school = Guid.NewGuid();
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = school.ToString(), State = "Suspended" }
            }
        });
        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.Suspended, status.State);
    }

    [Fact]
    public async Task GraceEntry_IsGracePeriod()
    {
        var school = Guid.NewGuid();
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = school.ToString(), State = "GracePeriod" }
            }
        });
        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.GracePeriod, status.State);
    }

    [Fact]
    public async Task ActiveEntry_WithExpiredDate_PromotesToGracePeriod_WhenWithinGrace()
    {
        var school = Guid.NewGuid();
        var now = new DateTime(2026, 6, 17, 0, 0, 0, DateTimeKind.Utc);
        var store = NewStore(new SubscriptionOptions
        {
            DefaultGracePeriodDays = 7,
            Schools = new[]
            {
                new SubscriptionEntry
                {
                    SchoolId = school.ToString(),
                    State = "Active",
                    ExpiresAtUtc = "2026-06-15T00:00:00Z",
                    GraceUntilUtc = "2026-06-20T00:00:00Z"
                }
            }
        }, nowUtc: now);

        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.GracePeriod, status.State);
    }

    [Fact]
    public async Task ActiveEntry_PastGrace_DemotesToExpired()
    {
        var school = Guid.NewGuid();
        var now = new DateTime(2026, 6, 30, 0, 0, 0, DateTimeKind.Utc);
        var store = NewStore(new SubscriptionOptions
        {
            DefaultGracePeriodDays = 7,
            Schools = new[]
            {
                new SubscriptionEntry
                {
                    SchoolId = school.ToString(),
                    State = "Active",
                    ExpiresAtUtc = "2026-06-15T00:00:00Z",
                    GraceUntilUtc = "2026-06-20T00:00:00Z"
                }
            }
        }, nowUtc: now);

        var status = await store.GetAsync(school, CancellationToken.None);
        Assert.Equal(SubscriptionState.Expired, status.State);
    }

    [Fact]
    public async Task EmptySchoolId_IsIgnored()
    {
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = string.Empty, State = "Suspended" }
            }
        });
        var status = await store.GetAsync(Guid.NewGuid(), CancellationToken.None);
        Assert.Equal(SubscriptionState.Active, status.State);
    }

    [Fact]
    public async Task InvalidGuid_IsIgnored()
    {
        var store = NewStore(new SubscriptionOptions
        {
            Schools = new[]
            {
                new SubscriptionEntry { SchoolId = "not-a-guid", State = "Suspended" }
            }
        });
        var status = await store.GetAsync(Guid.NewGuid(), CancellationToken.None);
        Assert.Equal(SubscriptionState.Active, status.State);
    }

    [Fact]
    public void IsAllowed_TrueForActive()
    {
        Assert.True(SubscriptionStatus.Active(Guid.NewGuid()).IsAllowed());
    }

    [Fact]
    public void IsAllowed_TrueForGracePeriod()
    {
        Assert.True(SubscriptionStatus.GracePeriod(Guid.NewGuid(), DateTime.UtcNow.AddDays(1)).IsAllowed());
    }

    [Fact]
    public void IsAllowed_FalseForExpired()
    {
        Assert.False(SubscriptionStatus.Expired(Guid.NewGuid()).IsAllowed());
    }

    [Fact]
    public void IsAllowed_FalseForSuspended()
    {
        Assert.False(SubscriptionStatus.Suspended(Guid.NewGuid()).IsAllowed());
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        private readonly DateTimeOffset _now;
        public FixedTimeProvider(DateTime utc) { _now = new DateTimeOffset(utc, TimeSpan.Zero); }
        public override DateTimeOffset GetUtcNow() => _now;
    }
}
