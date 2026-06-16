using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Xunit;

namespace ArabicSchoolArchive.Tests.Services;

public class FileValidatorTests
{
    private readonly FileValidator _validator = new();

    private static UploadOptions DefaultOptions() => new()
    {
        MaxFileSizeBytes = 20L * 1024 * 1024
    };

    private static IFormFile MakeFormFile(string name, long length, string contentType)
    {
        var stream = new MemoryStream(new byte[length]);
        return new FormFile(stream, 0, length, "file", name)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }

    [Fact]
    public void ValidPdf_Passes()
    {
        var file = MakeFormFile("report.pdf", 1024, "application/pdf");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.True(result.IsValid);
    }

    [Fact]
    public void EmptyName_Fails()
    {
        var file = MakeFormFile("", 1024, "application/pdf");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("FILENAME_INVALID", result.ReasonCode);
    }

    [Fact]
    public void NullByteInName_Fails()
    {
        var file = MakeFormFile("bad\0name.pdf", 1024, "application/pdf");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("FILENAME_INVALID", result.ReasonCode);
    }

    [Fact]
    public void ExeExtension_Fails()
    {
        var file = MakeFormFile("malware.exe", 1024, "application/octet-stream");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("EXTENSION_NOT_ALLOWED", result.ReasonCode);
    }

    [Fact]
    public void SizeExceedsLimit_Fails()
    {
        var file = MakeFormFile("big.pdf", 21L * 1024 * 1024, "application/pdf");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("SIZE_EXCEEDED", result.ReasonCode);
    }

    [Fact]
    public void ZeroSize_Fails()
    {
        var file = MakeFormFile("empty.pdf", 0, "application/pdf");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("SIZE_EXCEEDED", result.ReasonCode);
    }

    [Fact]
    public void DisallowedMime_Fails()
    {
        var file = MakeFormFile("bad.pdf", 1024, "application/x-msdownload");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.False(result.IsValid);
        Assert.Equal("MIME_MISMATCH", result.ReasonCode);
    }

    [Fact]
    public void Docx_Passes()
    {
        var file = MakeFormFile("memo.docx",
            1024,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.True(result.IsValid);
    }

    [Fact]
    public void PngImage_Passes()
    {
        var file = MakeFormFile("photo.png", 1024, "image/png");
        var result = _validator.Validate(file, DefaultOptions());
        Assert.True(result.IsValid);
    }
}
