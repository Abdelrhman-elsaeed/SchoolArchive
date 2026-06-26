using ArabicSchoolArchive.Api.Configuration;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Clients.Azure;

public sealed class AzureBlobDownloadClient : IBlobDownloadService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly BlobOptions _options;
    private readonly ILogger<AzureBlobDownloadClient> _logger;

    public AzureBlobDownloadClient(
        BlobServiceClient blobServiceClient,
        IOptions<BlobOptions> options,
        ILogger<AzureBlobDownloadClient> logger)
    {
        _blobServiceClient = blobServiceClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<BlobDownloadResult> OpenReadAsync(
        Guid schoolId,
        string blobObjectName,
        CancellationToken cancellationToken)
    {
        if (schoolId == Guid.Empty)
        {
            return new BlobDownloadResult(false, null, null, "invalid schoolId");
        }
        if (string.IsNullOrWhiteSpace(blobObjectName))
        {
            return new BlobDownloadResult(false, null, null, "invalid blobObjectName");
        }
        if (!blobObjectName.StartsWith($"schools/{schoolId}/", StringComparison.Ordinal))
        {
            _logger.LogWarning(
                "Refusing to read blob outside tenant prefix: {ObjectName}",
                blobObjectName);
            return new BlobDownloadResult(false, null, null, "tenant prefix violation");
        }

        try
        {
            var container = _blobServiceClient.GetBlobContainerClient(_options.ContainerName);
            var blob = container.GetBlobClient(blobObjectName);

            var exists = await blob.ExistsAsync(cancellationToken);
            if (!exists.Value)
            {
                return new BlobDownloadResult(false, null, null, "not found");
            }

            var response = await blob.DownloadStreamingAsync(cancellationToken: cancellationToken);
            return new BlobDownloadResult(
                true,
                response.Value.Content,
                response.Value.Details.ContentType,
                null);
        }
        catch (global::Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return new BlobDownloadResult(false, null, null, "not found");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Blob download failed for {ObjectName}", blobObjectName);
            return new BlobDownloadResult(false, null, null, "internal error");
        }
    }
}