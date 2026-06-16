using System.Text;
using ArabicSchoolArchive.Api.Configuration;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Services;

public sealed record BlobUploadResult(bool Success, string? FailureReason);

public interface IBlobStorageService
{
    string BuildObjectName(Guid schoolId, Guid documentId, string originalName, DateTime uploadedAtUtc);
    string BuildSafeName(string originalName);
    Task<BlobUploadResult> UploadAsync(
        Guid schoolId,
        Guid documentId,
        string originalName,
        string contentType,
        Stream content,
        DateTime uploadedAtUtc,
        CancellationToken cancellationToken);
}

public sealed class BlobStorageService : IBlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly BlobOptions _options;
    private readonly ILogger<BlobStorageService> _logger;
    private readonly string _containerName;

    public BlobStorageService(
        BlobServiceClient blobServiceClient,
        IOptions<BlobOptions> options,
        ILogger<BlobStorageService> logger)
    {
        _blobServiceClient = blobServiceClient;
        _options = options.Value;
        _logger = logger;
        _containerName = string.IsNullOrEmpty(_options.ContainerName) ? "school-archives" : _options.ContainerName;
    }

    public string BuildObjectName(Guid schoolId, Guid documentId, string originalName, DateTime uploadedAtUtc)
    {
        var safe = BuildSafeName(originalName);
        var prefix = $"schools/{schoolId}/archive/{uploadedAtUtc:yyyy}/{uploadedAtUtc:MM}/{documentId}_{safe}";
        if (prefix.Length > 1024)
        {
            var overflow = prefix.Length - 1024;
            if (safe.Length > overflow)
            {
                safe = safe.Substring(0, safe.Length - overflow);
            }
            prefix = $"schools/{schoolId}/archive/{uploadedAtUtc:yyyy}/{uploadedAtUtc:MM}/{documentId}_{safe}";
        }
        return prefix;
    }

    public string BuildSafeName(string originalName) => Sanitize(originalName);

    public async Task<BlobUploadResult> UploadAsync(
        Guid schoolId,
        Guid documentId,
        string originalName,
        string contentType,
        Stream content,
        DateTime uploadedAtUtc,
        CancellationToken cancellationToken)
    {
        var objectName = BuildObjectName(schoolId, documentId, originalName, uploadedAtUtc);

        if (!objectName.StartsWith($"schools/{schoolId}/", StringComparison.Ordinal))
        {
            _logger.LogError("Refusing to upload blob outside tenant prefix: {ObjectName}", objectName);
            return new BlobUploadResult(false, "Tenant prefix violation");
        }

        try
        {
            var container = _blobServiceClient.GetBlobContainerClient(_containerName);
            var blob = container.GetBlobClient(objectName);

            var headers = new BlobHttpHeaders
            {
                ContentType = string.IsNullOrEmpty(contentType) ? "application/octet-stream" : contentType
            };

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(_options.UploadTimeoutSeconds));

            await blob.UploadAsync(content, new BlobUploadOptions { HttpHeaders = headers }, cts.Token);
            return new BlobUploadResult(true, null);
        }
        catch (Azure.RequestFailedException ex)
        {
            _logger.LogWarning(ex, "Azure Blob upload failed for {ObjectName}", objectName);
            return new BlobUploadResult(false, $"Azure error: {ex.Status}");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Azure Blob upload timed out for {ObjectName}", objectName);
            return new BlobUploadResult(false, "timeout");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected blob upload error for {ObjectName}", objectName);
            return new BlobUploadResult(false, "internal error");
        }
    }

    private static string Sanitize(string originalName)
    {
        if (string.IsNullOrEmpty(originalName))
        {
            return "file";
        }

        var trimmed = originalName.Trim();
        var sb = new StringBuilder(trimmed.Length);
        foreach (var c in trimmed)
        {
            if (c == ' ')
            {
                sb.Append('_');
            }
            else if (IsAllowedChar(c))
            {
                sb.Append(c);
            }
            else
            {
                sb.Append('_');
            }
        }

        var result = sb.ToString();
        while (result.Contains("__"))
        {
            result = result.Replace("__", "_");
        }
        while (result.StartsWith("_") || result.StartsWith("."))
        {
            result = result.Substring(1);
        }
        if (result.Length > 100)
        {
            result = result.Substring(0, 100);
        }
        if (string.IsNullOrEmpty(result))
        {
            result = "file";
        }
        return result;
    }

    private static bool IsAllowedChar(char c)
    {
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) return true;
        if (c >= '0' && c <= '9') return true;
        if (c == '.' || c == '_' || c == '-') return true;
        if (c >= 0x0600 && c <= 0x06FF) return true;
        return false;
    }
}
