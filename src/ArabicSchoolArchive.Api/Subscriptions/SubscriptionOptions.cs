namespace ArabicSchoolArchive.Api.Subscriptions;

public sealed class SubscriptionOptions
{
    public const string SectionName = "Subscriptions";

    public bool Enabled { get; set; } = true;

    public int DefaultGracePeriodDays { get; set; } = 7;

    public SubscriptionEntry[] Schools { get; set; } = Array.Empty<SubscriptionEntry>();
}

public sealed class SubscriptionEntry
{
    public string SchoolId { get; set; } = string.Empty;

    public string State { get; set; } = "Active";

    public string? ExpiresAtUtc { get; set; }

    public string? GraceUntilUtc { get; set; }

    public string? Reason { get; set; }
}
