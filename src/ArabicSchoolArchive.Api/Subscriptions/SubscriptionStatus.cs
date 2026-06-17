namespace ArabicSchoolArchive.Api.Subscriptions;

public sealed class SubscriptionStatus
{
    public Guid SchoolId { get; set; }
    public SubscriptionState State { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime? GraceUntilUtc { get; set; }
    public string? Reason { get; set; }

    public bool IsAllowed() =>
        State == SubscriptionState.Active || State == SubscriptionState.GracePeriod;

    public static SubscriptionStatus Active(Guid schoolId) =>
        new()
        {
            SchoolId = schoolId,
            State = SubscriptionState.Active
        };

    public static SubscriptionStatus GracePeriod(Guid schoolId, DateTime graceUntilUtc) =>
        new()
        {
            SchoolId = schoolId,
            State = SubscriptionState.GracePeriod,
            GraceUntilUtc = graceUntilUtc
        };

    public static SubscriptionStatus Expired(Guid schoolId) =>
        new()
        {
            SchoolId = schoolId,
            State = SubscriptionState.Expired,
            Reason = "SUBSCRIPTION_EXPIRED"
        };

    public static SubscriptionStatus Suspended(Guid schoolId) =>
        new()
        {
            SchoolId = schoolId,
            State = SubscriptionState.Suspended,
            Reason = "SUBSCRIPTION_SUSPENDED"
        };
}
