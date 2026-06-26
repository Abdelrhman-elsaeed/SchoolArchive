using System.Net;
using System.Net.Http.Headers;
using ArabicSchoolArchive.Api.Configuration;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Clients.N8n;

public sealed record N8nResult(
    bool Success,
    string? Category,
    string? DisplayName,
    string? Summary,
    IReadOnlyList<string> Tags,
    double? Confidence,
    bool NeedsReview,
    string? FailureReason,
    string? ReasonCode);

public interface IN8nClient
{
    Task<N8nResult> ClassifyAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        Guid schoolId,
        Guid documentId,
        CancellationToken cancellationToken);
}

public sealed class N8nClient : IN8nClient
{
    private const int MaxTagCount = 32;
    private const int MaxTagLength = 64;
    private const int MaxDisplayNameLength = 512;
    private const int MaxSummaryLength = 2048;

    private readonly HttpClient _httpClient;
    private readonly N8nOptions _options;
    private readonly ILogger<N8nClient> _logger;

    public N8nClient(HttpClient httpClient, IOptions<N8nOptions> options, ILogger<N8nClient> logger)
    {
        _options = options.Value;
        _logger = logger;
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
    }

    public async Task<N8nResult> ClassifyAsync(
        Stream fileStream,
        string fileName,
        string contentType,
        Guid schoolId,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(_options.WebhookUrl))
        {
            _logger.LogError("N8N webhook URL is not configured");
            return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "N8N configuration missing", "N8N_HTTP_ERROR");
        }

        using var form = new MultipartFormDataContent("----N8nBoundary" + Guid.NewGuid().ToString("N"));
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(string.IsNullOrEmpty(contentType) ? "application/octet-stream" : contentType);
        var safeAsciiName = BuildSafeAsciiFileName(fileName, documentId);
        form.Add(streamContent, "file", safeAsciiName);
        form.Add(new StringContent(schoolId.ToString()), "schoolId");
        form.Add(new StringContent(documentId.ToString()), "documentId");
        form.Add(new StringContent(fileName ?? string.Empty), "originalName");

        if (!string.IsNullOrEmpty(_options.SharedSecret))
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.SharedSecret);
        }

        try
        {
            using var response = await _httpClient.PostAsync(_options.WebhookUrl, form, cancellationToken);

            if (response.StatusCode == HttpStatusCode.RequestTimeout)
            {
                return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "n8n timeout", "N8N_TIMEOUT");
            }

            if (!response.IsSuccessStatusCode)
            {
                return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, $"n8n returned {(int)response.StatusCode}", "N8N_HTTP_ERROR");
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(body))
            {
                return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "empty body", "N8N_INVALID_RESPONSE");
            }

            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                return ParseRichPayload(doc.RootElement);
            }
            catch (System.Text.Json.JsonException)
            {
                return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "invalid JSON", "N8N_INVALID_RESPONSE");
            }
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "request timeout", "N8N_TIMEOUT");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "N8N HTTP failure for document {DocumentId}", documentId);
            return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "network error", "N8N_HTTP_ERROR");
        }
    }

    private static N8nResult ParseRichPayload(System.Text.Json.JsonElement root)
    {
        string? category = null;

        if (root.TryGetProperty("primary_category", out var primaryCategoryElement) &&
            primaryCategoryElement.ValueKind == System.Text.Json.JsonValueKind.String)
        {
            category = primaryCategoryElement.GetString()?.Trim();
        }

        if (string.IsNullOrEmpty(category) &&
            root.TryGetProperty("category", out var categoryElement) &&
            categoryElement.ValueKind == System.Text.Json.JsonValueKind.String)
        {
            category = categoryElement.GetString()?.Trim();
        }

        if (string.IsNullOrEmpty(category))
        {
            return new N8nResult(false, null, null, null, Array.Empty<string>(), null, false, "missing category field", "N8N_INVALID_RESPONSE");
        }

        if (category.Length > 127)
        {
            category = category.Substring(0, 127);
        }

        var displayName = ExtractTrimmedString(root, "display_name", MaxDisplayNameLength);
        var summary = ExtractTrimmedString(root, "summary", MaxSummaryLength);
        var tags = ExtractTags(root, "tags");
        var confidence = ExtractConfidence(root);
        var needsReview = ExtractBool(root, "needs_review");

        return new N8nResult(
            Success: true,
            Category: category,
            DisplayName: displayName,
            Summary: summary,
            Tags: tags,
            Confidence: confidence,
            NeedsReview: needsReview,
            FailureReason: null,
            ReasonCode: null);
    }

    private static string? ExtractTrimmedString(System.Text.Json.JsonElement root, string propertyName, int maxLength)
    {
        if (!root.TryGetProperty(propertyName, out var element) || element.ValueKind != System.Text.Json.JsonValueKind.String)
        {
            return null;
        }
        var raw = element.GetString()?.Trim();
        if (string.IsNullOrEmpty(raw)) return null;
        return raw.Length > maxLength ? raw.Substring(0, maxLength) : raw;
    }

    private static IReadOnlyList<string> ExtractTags(System.Text.Json.JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element) || element.ValueKind != System.Text.Json.JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }
        var tags = new List<string>();
        foreach (var item in element.EnumerateArray())
        {
            if (tags.Count >= MaxTagCount) break;
            if (item.ValueKind != System.Text.Json.JsonValueKind.String) continue;
            var tag = item.GetString()?.Trim();
            if (string.IsNullOrEmpty(tag)) continue;
            if (tag.Length > MaxTagLength) tag = tag.Substring(0, MaxTagLength);
            tags.Add(tag);
        }
        return tags;
    }

    private static double? ExtractConfidence(System.Text.Json.JsonElement root)
    {
        if (!root.TryGetProperty("confidence", out var element)) return null;
        if (element.ValueKind == System.Text.Json.JsonValueKind.Number && element.TryGetDouble(out var value))
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return null;
            if (value < 0) return 0;
            if (value > 1) return 1;
            return Math.Round(value, 4);
        }
        return null;
    }

    private static bool ExtractBool(System.Text.Json.JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element)) return false;
        return element.ValueKind switch
        {
            System.Text.Json.JsonValueKind.True => true,
            System.Text.Json.JsonValueKind.False => false,
            _ => false
        };
    }

    public static string BuildSafeAsciiFileName(string? fileName, Guid documentId)
    {
        var extension = string.Empty;
        if (!string.IsNullOrEmpty(fileName))
        {
            var ext = Path.GetExtension(fileName);
            if (!string.IsNullOrEmpty(ext) && ext.Length <= 16 && IsAscii(ext))
            {
                extension = ext.ToLowerInvariant();
            }
        }
        return $"document_{documentId:N}{extension}";
    }

    private static bool IsAscii(string value)
    {
        foreach (var c in value)
        {
            if (c > 127) return false;
        }
        return true;
    }
}