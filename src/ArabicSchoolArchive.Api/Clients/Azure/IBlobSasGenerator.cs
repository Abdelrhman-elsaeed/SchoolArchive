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
