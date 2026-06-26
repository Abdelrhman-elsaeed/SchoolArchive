using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Services.Upload;
using ArabicSchoolArchive.Api.Shared;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/archive")]
public sealed class ArchiveUploadController : ControllerBase
{
    private const long DefaultMaxRequestBodyBytes = 25L * 1024 * 1024;

    private readonly IUploadOrchestrator _orchestrator;
    private readonly UploadOptions _uploadOptions;
    private readonly ILogger<ArchiveUploadController> _logger;

    public ArchiveUploadController(
        IUploadOrchestrator orchestrator,
        IOptions<UploadOptions> uploadOptions,
        ILogger<ArchiveUploadController> logger)
    {
        _orchestrator = orchestrator;
        _uploadOptions = uploadOptions.Value;
        _logger = logger;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(DefaultMaxRequestBodyBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = DefaultMaxRequestBodyBytes, ValueLengthLimit = int.MaxValue)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile? file,
        [FromForm] IFormFileCollection? files,
        CancellationToken cancellationToken)
    {
        if (!User.TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        var userId = User.FindUserId() ?? Guid.Empty;

        var hasFiles = files is not null && files.Count > 0;
        var hasSingle = file is not null && file.Length > 0;

        if (hasFiles)
        {
            var totalBytes = files!.Sum(f => f.Length);
            if (totalBytes > _uploadOptions.MaxBatchSizeBytes)
            {
                _logger.LogWarning(
                    "Batch size {TotalBytes} exceeds MaxBatchSizeBytes {Max} (SchoolId={SchoolId})",
                    totalBytes, _uploadOptions.MaxBatchSizeBytes, schoolId);
                return BadRequest(new ErrorResponse
                {
                    Code = "BODY_TOO_LARGE"
                });
            }

            var batch = await _orchestrator.UploadBatchAsync(
                files.ToList(), schoolId, userId, cancellationToken);
            return Ok(batch);
        }

        if (hasSingle)
        {
            var single = await _orchestrator.UploadAsync(file!, schoolId, userId, cancellationToken);
            return Ok(single);
        }

        return BadRequest(new ErrorResponse { Code = "EMPTY_BATCH" });
    }
}
