using System.Text.RegularExpressions;

namespace ArabicSchoolArchive.Api.Shared.Logging;

public static class LogScrubber
{
    private static readonly Regex SasQueryRegex = new(
        @"(?<key>sv|sr|sp|se|spr|st|si|sig|rscc|rscd|rsce|rscl|rsct|cache|skt|sks|skoid|sktid|ske|skv|skn)\s*=\s*[^&\s]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex AuthorizationHeaderRegex = new(
        @"(?i)authorization\s*[:=]\s*bearer\s+[A-Za-z0-9._\-]+",
        RegexOptions.Compiled);

    private static readonly Regex AccountKeyRegex = new(
        @"(?i)(AccountKey|SharedAccessKey|SharedAccessSignature)\s*=\s*[^;""'\s]+",
        RegexOptions.Compiled);

    private static readonly Regex TokenLikeRegex = new(
        @"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b",
        RegexOptions.Compiled);

    public static string Scrub(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var working = value;
        working = SasQueryRegex.Replace(working, "${key}=***");
        working = AuthorizationHeaderRegex.Replace(working, "Authorization: Bearer ***");
        working = AccountKeyRegex.Replace(working, "$1=***");
        working = TokenLikeRegex.Replace(working, "***");
        return working;
    }

    public static string ScrubPath(string? path)
    {
        if (string.IsNullOrEmpty(path)) return string.Empty;
        var qIdx = path.IndexOf('?');
        if (qIdx < 0) return path;
        return path.Substring(0, qIdx) + "?***";
    }

    public static string ScrubMessage(string? message)
    {
        if (string.IsNullOrEmpty(message)) return string.Empty;
        return Scrub(message);
    }

    public static string ScrubOriginalName(string? name)
    {
        if (string.IsNullOrEmpty(name)) return string.Empty;
        var trimmed = name.Trim();
        if (trimmed.Length > 200)
        {
            trimmed = trimmed.Substring(0, 200) + "...";
        }
        return trimmed;
    }

    public static string ScrubConnectionString(string? cs)
    {
        if (string.IsNullOrEmpty(cs)) return string.Empty;
        var scrubbed = AccountKeyRegex.Replace(cs, "$1=***");
        scrubbed = TokenLikeRegex.Replace(scrubbed, "***");
        return scrubbed;
    }
}