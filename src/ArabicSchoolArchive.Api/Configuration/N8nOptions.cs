namespace ArabicSchoolArchive.Api.Configuration;

public sealed class N8nOptions
{
    public const string SectionName = "N8N";

    public string WebhookUrl { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 15;
    public string SharedSecret { get; set; } = string.Empty;
}
