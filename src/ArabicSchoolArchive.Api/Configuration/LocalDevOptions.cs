namespace ArabicSchoolArchive.Api.Configuration;

/// <summary>
/// Settings for the local-development convenience routes that must never
/// be active outside a Development environment.
/// </summary>
public sealed class LocalDevOptions
{
    public const string SectionName = "LocalDev";

    /// <summary>
    /// When <c>true</c> AND the host is "Development", the
    /// <c>GET /api/v1/archive/archives/{id}/content</c> route streams
    /// the blob directly via the API (Azurite-friendly, avoids the SAS URL).
    /// </summary>
    public bool DownloadStreamEnabled { get; set; }
}
