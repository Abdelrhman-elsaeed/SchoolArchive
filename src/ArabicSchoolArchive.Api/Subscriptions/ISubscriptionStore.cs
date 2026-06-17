namespace ArabicSchoolArchive.Api.Subscriptions;

public interface ISubscriptionStore
{
    Task<SubscriptionStatus> GetAsync(Guid schoolId, CancellationToken cancellationToken);
}
