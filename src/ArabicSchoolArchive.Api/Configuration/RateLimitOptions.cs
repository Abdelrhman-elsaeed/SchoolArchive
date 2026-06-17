namespace ArabicSchoolArchive.Api.Configuration;

public sealed class RateLimitOptions
{
    public const string SectionName = "RateLimit";

    public bool Enabled { get; set; } = true;
    public int UploadPerMinute { get; set; } = 30;
    public int ReadPerMinute { get; set; } = 300;
    public int CleanupIntervalSeconds { get; set; } = 60;
    public int IdleEntryTtlSeconds { get; set; } = 600;
}
