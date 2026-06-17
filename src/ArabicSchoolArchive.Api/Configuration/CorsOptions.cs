namespace ArabicSchoolArchive.Api.Configuration;

public sealed class CorsOptions
{
    public const string SectionName = "Cors";

    public string[] AllowedOrigins { get; set; } = Array.Empty<string>();
    public bool AllowCredentials { get; set; } = false;
    public string[] AllowedMethods { get; set; } = new[] { "GET", "POST", "OPTIONS" };
    public string[] AllowedHeaders { get; set; } = new[] { "Authorization", "Content-Type", "X-Dev-School-Id", "X-Dev-User-Id" };
    public int PreflightMaxAgeSeconds { get; set; } = 600;
}
