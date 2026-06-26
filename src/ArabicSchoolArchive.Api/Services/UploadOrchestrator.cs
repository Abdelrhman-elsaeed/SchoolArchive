using ArabicSchoolArchive.Api.Clients.N8n;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Entities;
using ArabicSchoolArchive.Api.Repositories;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Services;

public interface IUploadOrchestrator
{
    Task<SingleFileUploadResponse> UploadAsync(
        IFormFile file,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<BatchUploadResponse> UploadBatchAsync(
        IReadOnlyList<IFormFile> files,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken);
}

public sealed class UploadOrchestrator : IUploadOrchestrator
{
    private readonly IFileValidator _validator;
    private readonly IFileSignatureValidator _signatureValidator;
    private readonly IN8nClient _n8nClient;
    private readonly IBlobStorageService _blobService;
    private readonly IArchiveRepository _repository;
    private readonly IAuditLog _auditLog;
    private readonly UploadOptions _options;
    private readonly ILogger<UploadOrchestrator> _logger;
    private readonly TimeProvider _timeProvider;

    public UploadOrchestrator(
        IFileValidator validator,
        IFileSignatureValidator signatureValidator,
        IN8nClient n8nClient,
        IBlobStorageService blobService,
        IArchiveRepository repository,
        IAuditLog auditLog,
        IOptions<UploadOptions> options,
        ILogger<UploadOrchestrator> logger,
        TimeProvider timeProvider)
    {
        _validator = validator;
        _signatureValidator = signatureValidator;
        _n8nClient = n8nClient;
        _blobService = blobService;
        _repository = repository;
        _auditLog = auditLog;
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
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.Upload,
                Outcome = AuditOutcome.Rejected,
                ReasonCode = validation.ReasonCode,
                Message = validation.Message,
                SchoolId = schoolId,
                UserId = userId,
                OriginalName = originalName
            });
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

        var signature = await _signatureValidator.ValidateAsync(
            n8nStream, originalName, mimeType, cancellationToken);
        if (!signature.IsValid)
        {
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.Upload,
                Outcome = AuditOutcome.Rejected,
                ReasonCode = signature.ReasonCode,
                Message = signature.Message,
                SchoolId = schoolId,
                UserId = userId,
                OriginalName = originalName,
                DocumentId = documentId
            });
            return new SingleFileUploadResponse
            {
                OriginalName = originalName,
                Status = nameof(UploadStatus.Rejected),
                ReasonCode = signature.ReasonCode,
                Message = signature.Message ?? "توقيع الملف غير صالح",
                DocumentId = null,
                Category = null,
                SizeBytes = file.Length,
                MimeType = mimeType,
                BlobUri = null
            };
        }
        n8nStream.Position = 0;

        var n8nResult = await _n8nClient.ClassifyAsync(
            n8nStream, originalName, mimeType, schoolId, documentId, cancellationToken);
        if (!n8nResult.Success)
        {
            _logger.LogWarning(
                "n8n classification failed: DocumentId={DocumentId} SchoolId={SchoolId} Reason={Reason}",
                documentId, schoolId, n8nResult.ReasonCode);
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.Upload,
                Outcome = AuditOutcome.Failed,
                ReasonCode = n8nResult.ReasonCode,
                Message = TranslateN8nFailure(n8nResult.ReasonCode),
                SchoolId = schoolId,
                UserId = userId,
                DocumentId = documentId,
                OriginalName = originalName
            });
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

        await using var blobStream = file.OpenReadStream();
        var blobResult = await _blobService.UploadAsync(
            schoolId, documentId, originalName, mimeType, blobStream, uploadedAt, cancellationToken);
        if (!blobResult.Success)
        {
            _logger.LogWarning(
                "Blob upload failed: DocumentId={DocumentId} SchoolId={SchoolId} Reason={Reason}",
                documentId, schoolId, blobResult.FailureReason);
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.Upload,
                Outcome = AuditOutcome.Failed,
                ReasonCode = "BLOB_FAILED",
                Message = blobResult.FailureReason,
                SchoolId = schoolId,
                UserId = userId,
                DocumentId = documentId,
                OriginalName = originalName
            });
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
            DisplayName = n8nResult.DisplayName,
            Summary = n8nResult.Summary,
            Tags = n8nResult.Tags?.ToList() ?? new List<string>(),
            Confidence = n8nResult.Confidence,
            NeedsReview = n8nResult.NeedsReview,
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
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.Upload,
                Outcome = AuditOutcome.Failed,
                ReasonCode = "DB_FAILED",
                SchoolId = schoolId,
                UserId = userId,
                DocumentId = documentId,
                OriginalName = originalName
            });
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
        _auditLog.Record(new AuditEvent
        {
            Action = AuditAction.Upload,
            Outcome = AuditOutcome.Success,
            SchoolId = schoolId,
            UserId = userId,
            DocumentId = documentId,
            OriginalName = originalName
        });

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

    public async Task<BatchUploadResponse> UploadBatchAsync(
        IReadOnlyList<IFormFile> files,
        Guid schoolId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var results = new List<SingleFileUploadResponse>(files.Count);
        foreach (var file in files)
        {
            try
            {
                var single = await UploadAsync(file, schoolId, userId, cancellationToken);
                results.Add(single);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Unhandled error in batch loop for {OriginalName} (SchoolId={SchoolId})",
                    file.FileName, schoolId);
                _auditLog.Record(new AuditEvent
                {
                    Action = AuditAction.Upload,
                    Outcome = AuditOutcome.Failed,
                    ReasonCode = "INTERNAL_ERROR",
                    Message = ex.Message,
                    SchoolId = schoolId,
                    UserId = userId,
                    OriginalName = file.FileName
                });
                results.Add(new SingleFileUploadResponse
                {
                    OriginalName = file.FileName ?? string.Empty,
                    Status = nameof(UploadStatus.Failed),
                    ReasonCode = "INTERNAL_ERROR",
                    Message = "حدث خطأ غير متوقع أثناء معالجة الملف",
                    DocumentId = null,
                    Category = null,
                    SizeBytes = file.Length,
                    MimeType = (file.ContentType ?? string.Empty).ToLowerInvariant(),
                    BlobUri = null
                });
            }
        }

        return new BatchUploadResponse
        {
            TotalFiles = results.Count,
            SuccessfulFiles = results.Count(r => r.Status == nameof(UploadStatus.Success)),
            FailedFiles = results.Count(r => r.Status != nameof(UploadStatus.Success)),
            Results = results
        };
    }
}
