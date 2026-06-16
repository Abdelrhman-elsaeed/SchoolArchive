using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Services;

public interface IUploadOrchestrator
{
    Task<SingleFileUploadResponse> UploadAsync(
        IFormFile file,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken);
}

public sealed class UploadOrchestrator : IUploadOrchestrator
{
    private readonly IFileValidator _validator;
    private readonly IN8nClient _n8nClient;
    private readonly IBlobStorageService _blobService;
    private readonly IArchiveRepository _repository;
    private readonly UploadOptions _options;
    private readonly ILogger<UploadOrchestrator> _logger;
    private readonly TimeProvider _timeProvider;

    public UploadOrchestrator(
        IFileValidator validator,
        IN8nClient n8nClient,
        IBlobStorageService blobService,
        IArchiveRepository repository,
        IOptions<UploadOptions> options,
        ILogger<UploadOrchestrator> logger,
        TimeProvider timeProvider)
    {
        _validator = validator;
        _n8nClient = n8nClient;
        _blobService = blobService;
        _repository = repository;
        _options = options.Value;
        _logger = logger;
        _timeProvider = timeProvider;
    }

    public async Task<SingleFileUploadResponse> UploadAsync(
        IFormFile file,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var originalName = file.FileName ?? string.Empty;

        var validation = _validator.Validate(file, _options);
        if (!validation.IsValid)
        {
            return new SingleFileUploadResponse
            {
                OriginalName = originalName,
                Status = nameof(UploadStatus.Rejected),
                ReasonCode = validation.ReasonCode,
                Message = validation.Message ?? "الملف مرفوض",
                DocumentId = null,
                Category = null,
                SizeBytes = null,
                MimeType = null,
                BlobUri = null
            };
        }

        var documentId = Guid.NewGuid();
        var uploadedAt = _timeProvider.GetUtcNow().UtcDateTime;
        var mimeType = (file.ContentType ?? string.Empty).ToLowerInvariant();

        await using var n8nStream = new MemoryStream();
        await using (var source = file.OpenReadStream())
        {
            await source.CopyToAsync(n8nStream, cancellationToken);
        }
        n8nStream.Position = 0;

        var n8nResult = await _n8nClient.ClassifyAsync(
            n8nStream, originalName, mimeType, schoolId, documentId, cancellationToken);
        if (!n8nResult.Success)
        {
            _logger.LogWarning(
                "n8n classification failed: DocumentId={DocumentId} SchoolId={SchoolId} Reason={Reason}",
                documentId, schoolId, n8nResult.ReasonCode);
            return new SingleFileUploadResponse
            {
                OriginalName = originalName,
                Status = nameof(UploadStatus.Failed),
                ReasonCode = n8nResult.ReasonCode,
                Message = TranslateN8nFailure(n8nResult.ReasonCode),
                DocumentId = documentId,
                Category = null,
                SizeBytes = file.Length,
                MimeType = mimeType,
                BlobUri = null
            };
        }

        n8nStream.Position = 0;
        var blobResult = await _blobService.UploadAsync(
            schoolId, documentId, originalName, mimeType, n8nStream, uploadedAt, cancellationToken);
        if (!blobResult.Success)
        {
            _logger.LogWarning(
                "Blob upload failed: DocumentId={DocumentId} SchoolId={SchoolId} Reason={Reason}",
                documentId, schoolId, blobResult.FailureReason);
            return new SingleFileUploadResponse
            {
                OriginalName = originalName,
                Status = nameof(UploadStatus.Failed),
                ReasonCode = "BLOB_FAILED",
                Message = "فشل حفظ الملف في وحدة التخزين. يرجى المحاولة لاحقاً",
                DocumentId = documentId,
                Category = n8nResult.Category,
                SizeBytes = file.Length,
                MimeType = mimeType,
                BlobUri = null
            };
        }

        var archive = new Archive
        {
            DocumentId = documentId,
            SchoolId = schoolId,
            OriginalName = originalName,
            SafeName = _blobService.BuildSafeName(originalName),
            BlobObjectName = _blobService.BuildObjectName(schoolId, documentId, originalName, uploadedAt),
            SizeBytes = file.Length,
            MimeType = mimeType,
            Category = n8nResult.Category,
            UploadedByUserId = userId,
            UploadedAtUtc = uploadedAt,
            ProcessingYear = uploadedAt.Year,
            ProcessingMonth = (byte)uploadedAt.Month,
            ContentHashSha256 = null
        };

        try
        {
            await _repository.SaveAsync(archive, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "DB save failed after Blob success: DocumentId={DocumentId} SchoolId={SchoolId}. Blob orphan possible.",
                documentId, schoolId);
            return new SingleFileUploadResponse
            {
                OriginalName = originalName,
                Status = nameof(UploadStatus.Failed),
                ReasonCode = "DB_FAILED",
                Message = "فشل حفظ بيانات الملف. يرجى المحاولة لاحقاً",
                DocumentId = documentId,
                Category = n8nResult.Category,
                SizeBytes = file.Length,
                MimeType = mimeType,
                BlobUri = archive.BlobObjectName
            };
        }

        _logger.LogInformation(
            "Archive success: DocumentId={DocumentId} SchoolId={SchoolId} Size={Size} Category={Category}",
            documentId, schoolId, file.Length, n8nResult.Category);

        return new SingleFileUploadResponse
        {
            OriginalName = originalName,
            Status = nameof(UploadStatus.Success),
            ReasonCode = null,
            Message = n8nResult.Category is null
                ? "تم أرشفة الملف بنجاح"
                : $"تم أرشفة الملف بنجاح وتصنيفه كـ '{n8nResult.Category}'",
            DocumentId = documentId,
            Category = n8nResult.Category,
            SizeBytes = file.Length,
            MimeType = mimeType,
            BlobUri = archive.BlobObjectName
        };
    }

    private static string TranslateN8nFailure(string? reasonCode) => reasonCode switch
    {
        "N8N_TIMEOUT" => "استغرق تصنيف الملف وقتاً طويلاً. يرجى المحاولة لاحقاً",
        "N8N_HTTP_ERROR" => "تعذر الوصول إلى خدمة التصنيف. يرجى المحاولة لاحقاً",
        "N8N_INVALID_RESPONSE" => "استجابة غير صالحة من خدمة التصنيف. يرجى المحاولة لاحقاً",
        _ => "فشل تصنيف الملف. يرجى المحاولة لاحقاً"
    };
}
