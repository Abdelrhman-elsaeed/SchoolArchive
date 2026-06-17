namespace ArabicSchoolArchive.Api.Services;

public sealed record MagicBytesResult(
    bool IsValid,
    string? ReasonCode,
    string? DetectedFormat,
    string? Message);

public interface IFileSignatureValidator
{
    Task<MagicBytesResult> ValidateAsync(
        Stream fileStream,
        string originalName,
        string declaredMime,
        CancellationToken cancellationToken);
}

public sealed class FileSignatureValidator : IFileSignatureValidator
{
    private const int SignatureReadLimit = 16;

    private static readonly byte[] PdfSignature = { 0x25, 0x50, 0x44, 0x46, 0x2D };
    private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
    private static readonly byte[] JpgSignature1 = { 0xFF, 0xD8, 0xFF };
    private static readonly byte[] ZipSignature = { 0x50, 0x4B, 0x03, 0x04 };
    private static readonly byte[] ZipEmptySignature = { 0x50, 0x4B, 0x05, 0x06 };
    private static readonly byte[] ZipSpannedSignature = { 0x50, 0x4B, 0x07, 0x08 };

    public async Task<MagicBytesResult> ValidateAsync(
        Stream fileStream,
        string originalName,
        string declaredMime,
        CancellationToken cancellationToken)
    {
        if (fileStream is null)
        {
            return new MagicBytesResult(false, "MAGIC_BYTES_UNREADABLE", null,
                "تعذر قراءة الملف للتحقق من سلامته");
        }
        if (fileStream.CanSeek)
        {
            fileStream.Position = 0;
        }

        var buffer = new byte[SignatureReadLimit];
        int totalRead = 0;
        while (totalRead < SignatureReadLimit)
        {
            var read = await fileStream.ReadAsync(
                buffer.AsMemory(totalRead, SignatureReadLimit - totalRead),
                cancellationToken);
            if (read <= 0) break;
            totalRead += read;
        }

        if (fileStream.CanSeek)
        {
            fileStream.Position = 0;
        }

        if (totalRead == 0)
        {
            return new MagicBytesResult(false, "MAGIC_BYTES_UNREADABLE", null,
                "الملف فارغ ولا يمكن التحقق من توقيعه");
        }

        var ext = Path.GetExtension(originalName).ToLowerInvariant();
        var mime = (declaredMime ?? string.Empty).ToLowerInvariant();

        if (ext == ".pdf" || mime == "application/pdf")
        {
            if (StartsWith(buffer, totalRead, PdfSignature))
            {
                return new MagicBytesResult(true, null, "pdf", null);
            }
            return new MagicBytesResult(false, "MAGIC_BYTES_MISMATCH", null,
                "توقيع الملف لا يطابق نوع PDF المعلن");
        }

        if (ext == ".png" || mime == "image/png")
        {
            if (StartsWith(buffer, totalRead, PngSignature))
            {
                return new MagicBytesResult(true, null, "png", null);
            }
            return new MagicBytesResult(false, "MAGIC_BYTES_MISMATCH", null,
                "توقيع الملف لا يطابق نوع PNG المعلن");
        }

        if (ext == ".jpg" || ext == ".jpeg" || mime == "image/jpeg")
        {
            if (StartsWith(buffer, totalRead, JpgSignature1))
            {
                return new MagicBytesResult(true, null, "jpeg", null);
            }
            return new MagicBytesResult(false, "MAGIC_BYTES_MISMATCH", null,
                "توقيع الملف لا يطابق نوع JPEG المعلن");
        }

        if (ext == ".docx" || ext == ".xlsx" ||
            mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        {
            if (StartsWith(buffer, totalRead, ZipSignature) ||
                StartsWith(buffer, totalRead, ZipEmptySignature) ||
                StartsWith(buffer, totalRead, ZipSpannedSignature))
            {
                var detected = ext == ".xlsx" ? "xlsx" : "docx";
                return new MagicBytesResult(true, null, detected, null);
            }
            return new MagicBytesResult(false, "MAGIC_BYTES_MISMATCH", null,
                "توقيع الملف لا يطابق نوع Office Open XML المعلن");
        }

        return new MagicBytesResult(true, null, "unknown", null);
    }

    private static bool StartsWith(byte[] buffer, int length, byte[] prefix)
    {
        if (length < prefix.Length) return false;
        for (int i = 0; i < prefix.Length; i++)
        {
            if (buffer[i] != prefix[i]) return false;
        }
        return true;
    }
}
