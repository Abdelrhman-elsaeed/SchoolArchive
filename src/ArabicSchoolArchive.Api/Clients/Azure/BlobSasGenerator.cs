using ArabicSchoolArchive.Api.Configuration;
using Azure.Storage;
using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Clients.Azure;

public sealed record BlobSasDescriptor(
    Guid DocumentId,
    string BlobObjectName,
    Uri SignedUri,
    DateTime ExpiresAtUtc,
    int TtlMinutes);

public interface IBlobSasGenerator
{
    BlobSasDescriptor GenerateRead(
        Guid schoolId,
        Guid documentId,
        string blobObjectName,
        DateTime nowUtc);

    int TtlMinutes { get; }
}

public sealed class BlobSasGenerator : IBlobSasGenerator
{
    private const string AzuriteAccountName = "devstoreaccount1";
    private const string AzuriteAccountKey =
        "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

    private readonly BlobServiceClient _blobServiceClient;
    private readonly BlobOptions _options;
    private readonly ILogger<BlobSasGenerator> _logger;

    public BlobSasGenerator(
        BlobServiceClient blobServiceClient,
        IOptions<BlobOptions> options,
        ILogger<BlobSasGenerator> logger)
    {
        _blobServiceClient = blobServiceClient;
        _options = options.Value;
        _logger = logger;
    }

    public int TtlMinutes
    {
        get
        {
            var ttl = _options.SasTtlMinutes;
            if (ttl < _options.SasTtlMinutesMin) ttl = _options.SasTtlMinutesMin;
            if (ttl > _options.SasTtlMinutesMax) ttl = _options.SasTtlMinutesMax;
            return ttl;
        }
    }

    public BlobSasDescriptor GenerateRead(
        Guid schoolId,
        Guid documentId,
        string blobObjectName,
        DateTime nowUtc)
    {
        if (schoolId == Guid.Empty)
        {
            throw new ArgumentException("schoolId must not be empty", nameof(schoolId));
        }
        if (documentId == Guid.Empty)
        {
            throw new ArgumentException("documentId must not be empty", nameof(documentId));
        }
        if (string.IsNullOrWhiteSpace(blobObjectName))
        {
            throw new ArgumentException("blobObjectName must not be empty", nameof(blobObjectName));
        }
        if (!blobObjectName.StartsWith($"schools/{schoolId}/", StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "blobObjectName must start with the tenant prefix",
                nameof(blobObjectName));
        }
        if (blobObjectName.Contains("..", StringComparison.Ordinal) ||
            blobObjectName.Contains('\\') ||
            blobObjectName.Contains('\0'))
        {
            throw new ArgumentException(
                "blobObjectName contains illegal segments",
                nameof(blobObjectName));
        }

        var ttl = TtlMinutes;
        var expiresAt = nowUtc.AddMinutes(ttl);
        var container = _blobServiceClient.GetBlobContainerClient(_options.ContainerName);
        var blob = container.GetBlobClient(blobObjectName);

        var builder = new BlobSasBuilder
        {
            BlobContainerName = _options.ContainerName,
            BlobName = blobObjectName,
            Resource = "b",
            StartsOn = nowUtc.AddMinutes(-1),
            ExpiresOn = expiresAt,
            Protocol = SasProtocol.Https,
        };
        builder.SetPermissions(BlobSasPermissions.Read);

        var credential = new StorageSharedKeyCredential(GetAccountName(), GetAccountKey());
        var sas = builder.ToSasQueryParameters(credential);

        var signedUri = new Uri(blob.Uri + "?" + sas);

        return new BlobSasDescriptor(documentId, blobObjectName, signedUri, expiresAt, ttl);
    }

    private string GetAccountName()
    {
        var cs = _options.ConnectionString;
        if (string.IsNullOrEmpty(cs))
        {
            return AzuriteAccountName;
        }
        foreach (var part in cs.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0) continue;
            var key = part.Substring(0, eq).Trim();
            if (string.Equals(key, "AccountName", StringComparison.OrdinalIgnoreCase))
            {
                return part.Substring(eq + 1).Trim();
            }
        }
        return AzuriteAccountName;
    }

    private string GetAccountKey()
    {
        var cs = _options.ConnectionString;
        if (string.IsNullOrEmpty(cs))
        {
            return AzuriteAccountKey;
        }
        foreach (var part in cs.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0) continue;
            var key = part.Substring(0, eq).Trim();
            if (string.Equals(key, "AccountKey", StringComparison.OrdinalIgnoreCase))
            {
                return part.Substring(eq + 1).Trim();
            }
        }
        return AzuriteAccountKey;
    }
}