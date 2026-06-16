using System.Net;
using System.Net.Http.Headers;
using ArabicSchoolArchive.Api.Configuration;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Services;

public sealed record N8nResult(bool Success, string? Category, string? FailureReason, string? ReasonCode);

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
            return new N8nResult(false, null, "N8N configuration missing", "N8N_HTTP_ERROR");
        }

        using var form = new MultipartFormDataContent("----N8nBoundary" + Guid.NewGuid().ToString("N"));
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(string.IsNullOrEmpty(contentType) ? "application/octet-stream" : contentType);
        form.Add(streamContent, "file", fileName);
        form.Add(new StringContent(schoolId.ToString()), "schoolId");
        form.Add(new StringContent(documentId.ToString()), "documentId");

        if (!string.IsNullOrEmpty(_options.SharedSecret))
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.SharedSecret);
        }

        try
        {
            using var response = await _httpClient.PostAsync(_options.WebhookUrl, form, cancellationToken);

            if (response.StatusCode == HttpStatusCode.RequestTimeout)
            {
                return new N8nResult(false, null, "n8n timeout", "N8N_TIMEOUT");
            }

            if (!response.IsSuccessStatusCode)
            {
                return new N8nResult(false, null, $"n8n returned {(int)response.StatusCode}", "N8N_HTTP_ERROR");
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(body))
            {
                return new N8nResult(false, null, "empty body", "N8N_INVALID_RESPONSE");
            }

            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("category", out var categoryElement) ||
                    categoryElement.ValueKind != System.Text.Json.JsonValueKind.String)
                {
                    return new N8nResult(false, null, "missing category field", "N8N_INVALID_RESPONSE");
                }

                var category = categoryElement.GetString() ?? string.Empty;
                if (category.Length > 127)
                {
                    category = category.Substring(0, 127);
                }
                return new N8nResult(true, category, null, null);
            }
            catch (System.Text.Json.JsonException)
            {
                return new N8nResult(false, null, "invalid JSON", "N8N_INVALID_RESPONSE");
            }
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new N8nResult(false, null, "request timeout", "N8N_TIMEOUT");
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "N8N HTTP failure for document {DocumentId}", documentId);
            return new N8nResult(false, null, "network error", "N8N_HTTP_ERROR");
        }
    }
}
