using System.Security.Claims;
using ArabicSchoolArchive.Api.Clients.Azure;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Repositories;
using ArabicSchoolArchive.Api.Services;
using ArabicSchoolArchive.Api.Shared.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ArabicSchoolArchive.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/archive/archives")]
public sealed class ArchiveBrowseController : ControllerBase
{
    private readonly IArchiveReadRepository _readRepository;
    private readonly IBlobSasGenerator _sasGenerator;
    private readonly IBlobDownloadService _downloadService;
    private readonly IAuditLog _auditLog;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<ArchiveBrowseController> _logger;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public ArchiveBrowseController(
        IArchiveReadRepository readRepository,
        IBlobSasGenerator sasGenerator,
        IBlobDownloadService downloadService,
        IAuditLog auditLog,
        TimeProvider timeProvider,
        ILogger<ArchiveBrowseController> logger,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        _readRepository = readRepository;
        _sasGenerator = sasGenerator;
        _downloadService = downloadService;
        _auditLog = auditLog;
        _timeProvider = timeProvider;
        _logger = logger;
        _configuration = configuration;
        _environment = environment;
    }

    [HttpGet("")]
    public async Task<IActionResult> List(
        [FromQuery] ArchiveListQuery query,
        CancellationToken cancellationToken)
    {
        if (!TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        var (items, total) = await _readRepository.ListAsync(
            schoolId, query ?? new ArchiveListQuery(), cancellationToken);

        var page = query?.Page < 1 ? 1 : (query?.Page ?? 1);
        var pageSize = query?.PageSize < 1 ? 20 : (query?.PageSize ?? 20);
        if (pageSize > 100) pageSize = 100;
        var totalPages = total == 0 ? 0 : (int)Math.Ceiling((double)total / pageSize);

        _auditLog.Record(new AuditEvent
        {
            Action = AuditAction.BrowseList,
            Outcome = AuditOutcome.Success,
            SchoolId = schoolId,
            UserId = TryGetUserId(),
            HttpMethod = HttpContext.Request.Method,
            HttpPath = HttpContext.Request.Path.Value,
            HttpStatusCode = StatusCodes.Status200OK,
            RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        return Ok(new ArchiveListResponse
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = total,
            TotalPages = totalPages
        });
    }

    [HttpGet("{documentId:guid}")]
    public async Task<IActionResult> GetById(
        Guid documentId,
        CancellationToken cancellationToken)
    {
        if (!TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        var item = await _readRepository.GetByDocumentIdAsync(
            schoolId, documentId, cancellationToken);
        if (item is null)
        {
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.BrowseGetById,
                Outcome = AuditOutcome.ForbiddenTenantAccess,
                ReasonCode = "ARCHIVE_NOT_FOUND",
                SchoolId = schoolId,
                UserId = TryGetUserId(),
                DocumentId = documentId,
                HttpMethod = HttpContext.Request.Method,
                HttpPath = HttpContext.Request.Path.Value,
                HttpStatusCode = StatusCodes.Status404NotFound,
                RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
            });
            return NotFound(new ErrorResponse { Code = "ARCHIVE_NOT_FOUND" });
        }

        _auditLog.Record(new AuditEvent
        {
            Action = AuditAction.BrowseGetById,
            Outcome = AuditOutcome.Success,
            SchoolId = schoolId,
            UserId = TryGetUserId(),
            DocumentId = documentId,
            OriginalName = item.OriginalName,
            HttpMethod = HttpContext.Request.Method,
            HttpPath = HttpContext.Request.Path.Value,
            HttpStatusCode = StatusCodes.Status200OK,
            RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        return Ok(item);
    }

    [HttpGet("{documentId:guid}/download")]
    public async Task<IActionResult> Download(
        Guid documentId,
        CancellationToken cancellationToken)
    {
        if (!TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        var item = await _readRepository.GetByDocumentIdAsync(
            schoolId, documentId, cancellationToken);
        if (item is null)
        {
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.BrowseDownload,
                Outcome = AuditOutcome.ForbiddenTenantAccess,
                ReasonCode = "ARCHIVE_NOT_FOUND",
                SchoolId = schoolId,
                UserId = TryGetUserId(),
                DocumentId = documentId,
                HttpMethod = HttpContext.Request.Method,
                HttpPath = HttpContext.Request.Path.Value,
                HttpStatusCode = StatusCodes.Status404NotFound,
                RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
            });
            return NotFound(new ErrorResponse { Code = "ARCHIVE_NOT_FOUND" });
        }

        var sas = _sasGenerator.GenerateRead(
            schoolId, documentId, item.BlobObjectName, _timeProvider.GetUtcNow().UtcDateTime);

        _auditLog.Record(new AuditEvent
        {
            Action = AuditAction.BrowseDownload,
            Outcome = AuditOutcome.Success,
            SchoolId = schoolId,
            UserId = TryGetUserId(),
            DocumentId = documentId,
            OriginalName = item.OriginalName,
            HttpMethod = HttpContext.Request.Method,
            HttpPath = HttpContext.Request.Path.Value,
            HttpStatusCode = StatusCodes.Status200OK,
            RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        return Ok(new ArchiveDownloadResponse
        {
            DocumentId = sas.DocumentId,
            BlobObjectName = sas.BlobObjectName,
            SignedUrl = sas.SignedUri.ToString(),
            ExpiresAtUtc = sas.ExpiresAtUtc,
            TtlMinutes = sas.TtlMinutes
        });
    }

    [HttpGet("{documentId:guid}/content")]
    public async Task<IActionResult> Content(
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var streamEnabled =
            _environment.IsDevelopment()
            && _configuration.GetValue("LocalDev:DownloadStreamEnabled", false);
        if (!streamEnabled)
        {
            return NotFound(new ErrorResponse { Code = "ARCHIVE_NOT_FOUND" });
        }

        if (!TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        var item = await _readRepository.GetByDocumentIdAsync(
            schoolId, documentId, cancellationToken);
        if (item is null)
        {
            _auditLog.Record(new AuditEvent
            {
                Action = AuditAction.BrowseContent,
                Outcome = AuditOutcome.ForbiddenTenantAccess,
                ReasonCode = "ARCHIVE_NOT_FOUND",
                SchoolId = schoolId,
                UserId = TryGetUserId(),
                DocumentId = documentId,
                HttpMethod = HttpContext.Request.Method,
                HttpPath = HttpContext.Request.Path.Value,
                HttpStatusCode = StatusCodes.Status404NotFound,
                RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
            });
            return NotFound(new ErrorResponse { Code = "ARCHIVE_NOT_FOUND" });
        }

        var result = await _downloadService.OpenReadAsync(
            schoolId, item.BlobObjectName, cancellationToken);
        if (!result.Success || result.Content is null)
        {
            return NotFound(new ErrorResponse { Code = "ARCHIVE_NOT_FOUND" });
        }

        _auditLog.Record(new AuditEvent
        {
            Action = AuditAction.BrowseContent,
            Outcome = AuditOutcome.Success,
            SchoolId = schoolId,
            UserId = TryGetUserId(),
            DocumentId = documentId,
            OriginalName = item.OriginalName,
            HttpMethod = HttpContext.Request.Method,
            HttpPath = HttpContext.Request.Path.Value,
            HttpStatusCode = StatusCodes.Status200OK,
            RemoteIp = HttpContext.Connection.RemoteIpAddress?.ToString()
        });

        return File(result.Content, result.ContentType ?? "application/octet-stream",
            item.OriginalName);
    }

    private Guid? TryGetUserId()
    {
        var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value
                    ?? User.FindFirst("user_id")?.Value;
        if (string.IsNullOrEmpty(claim)) return null;
        return Guid.TryParse(claim, out var g) ? g : null;
    }

    private bool TryGetSchoolId(out Guid schoolId)
    {
        schoolId = Guid.Empty;
        var claim = User.FindFirstValue("school_id") ?? User.FindFirstValue("schoolId");
        if (string.IsNullOrEmpty(claim)) return false;
        return Guid.TryParse(claim, out schoolId);
    }
}
