using System.Text;
using ArabicSchoolArchive.Api.Services.Upload;
using Xunit;

namespace ArabicSchoolArchive.Tests.Services;

public class FileSignatureValidatorTests
{
    private readonly FileSignatureValidator _validator = new();

    private static MemoryStream StreamOf(params byte[] bytes) => new(bytes);

    [Fact]
    public async Task ValidPdf_SignatureAccepted()
    {
        var pdfHeader = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A };
        var stream = StreamOf(pdfHeader);
        var result = await _validator.ValidateAsync(
            stream, "report.pdf", "application/pdf", CancellationToken.None);
        Assert.True(result.IsValid);
        Assert.Null(result.ReasonCode);
    }

    [Fact]
    public async Task ValidPng_SignatureAccepted()
    {
        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00 };
        var stream = StreamOf(png);
        var result = await _validator.ValidateAsync(
            stream, "photo.png", "image/png", CancellationToken.None);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task ValidJpg_SignatureAccepted()
    {
        var jpg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var stream = StreamOf(jpg);
        var result = await _validator.ValidateAsync(
            stream, "photo.jpg", "image/jpeg", CancellationToken.None);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task ValidDocx_ZipSignatureAccepted()
    {
        var docx = new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00 };
        var stream = StreamOf(docx);
        var result = await _validator.ValidateAsync(
            stream, "memo.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            CancellationToken.None);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task ValidXlsx_ZipSignatureAccepted()
    {
        var xlsx = new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00 };
        var stream = StreamOf(xlsx);
        var result = await _validator.ValidateAsync(
            stream, "grades.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            CancellationToken.None);
        Assert.True(result.IsValid);
    }

    [Fact]
    public async Task PdfExtension_ButInvalidMagicBytes_Rejected()
    {
        var notPdf = new byte[] { 0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00 };
        var stream = StreamOf(notPdf);
        var result = await _validator.ValidateAsync(
            stream, "fake.pdf", "application/pdf", CancellationToken.None);
        Assert.False(result.IsValid);
        Assert.Equal("MAGIC_BYTES_MISMATCH", result.ReasonCode);
    }

    [Fact]
    public async Task PngExtension_ButJpgMagicBytes_Rejected()
    {
        var jpg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var stream = StreamOf(jpg);
        var result = await _validator.ValidateAsync(
            stream, "fake.png", "image/png", CancellationToken.None);
        Assert.False(result.IsValid);
        Assert.Equal("MAGIC_BYTES_MISMATCH", result.ReasonCode);
    }

    [Fact]
    public async Task ZeroByteFile_RejectedAsUnreadable()
    {
        var stream = StreamOf(Array.Empty<byte>());
        var result = await _validator.ValidateAsync(
            stream, "empty.pdf", "application/pdf", CancellationToken.None);
        Assert.False(result.IsValid);
        Assert.Equal("MAGIC_BYTES_UNREADABLE", result.ReasonCode);
    }

    [Fact]
    public async Task DocxExtension_ButNotZip_Rejected()
    {
        var pdf = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34 };
        var stream = StreamOf(pdf);
        var result = await _validator.ValidateAsync(
            stream, "fake.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            CancellationToken.None);
        Assert.False(result.IsValid);
        Assert.Equal("MAGIC_BYTES_MISMATCH", result.ReasonCode);
    }

    [Fact]
    public async Task StreamPositionReset_AfterReading()
    {
        var pdf = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A };
        var stream = StreamOf(pdf);
        var result = await _validator.ValidateAsync(
            stream, "report.pdf", "application/pdf", CancellationToken.None);
        Assert.True(result.IsValid);
        Assert.Equal(0, stream.Position);
    }
}
