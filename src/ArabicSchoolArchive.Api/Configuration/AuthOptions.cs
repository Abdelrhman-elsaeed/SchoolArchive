namespace ArabicSchoolArchive.Api.Configuration;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string SigningKey { get; set; } = string.Empty;
    public bool RequireHttpsMetadata { get; set; } = true;
    public int ClockSkewSeconds { get; set; } = 30;

    // Phase 2.5 - local development only.
    // When true AND the host environment is "Development", the upload endpoint
    // accepts X-Dev-School-Id and X-Dev-User-Id headers in place of a real JWT.
    // The flag is hard-checked against IHostEnvironment and is silently ignored
    // outside Development. See docs/agent/LOCAL_RUN.md §4.2.
    public bool DevBypassEnabled { get; set; } = false;
}
