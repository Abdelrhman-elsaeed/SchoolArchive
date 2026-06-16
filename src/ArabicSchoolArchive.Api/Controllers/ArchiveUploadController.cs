using System.Security.Claims;
using ArabicSchoolArchive.Api.Dtos;
using ArabicSchoolArchive.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ArabicSchoolArchive.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/archive")]
public sealed class ArchiveUploadController : ControllerBase
{
    private readonly IUploadOrchestrator _orchestrator;
    private readonly ILogger<ArchiveUploadController> _logger;

    public ArchiveUploadController(IUploadOrchestrator orchestrator, ILogger<ArchiveUploadController> logger)
    {
        _orchestrator = orchestrator;
        _logger = logger;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(25L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 25L * 1024 * 1024, ValueLengthLimit = int.MaxValue)]
    public async Task<IActionResult> Upload([FromForm] IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new ErrorResponse { Code = "EMPTY_BATCH" });
        }

        if (!TryGetSchoolId(out var schoolId))
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new ErrorResponse { Code = "TENANT_MISSING" });
        }

        if (!TryGetUserId(out var userId))
        {
            userId = Guid.Empty;
        }

        var response = await _orchestrator.UploadAsync(file, schoolId, userId, cancellationToken);
        return Ok(response);
    }

    private bool TryGetSchoolId(out Guid schoolId)
    {
        schoolId = Guid.Empty;
        var claim = User.FindFirstValue("school_id") ?? User.FindFirstValue("schoolId");
        if (string.IsNullOrEmpty(claim)) return false;
        return Guid.TryParse(claim, out schoolId);
    }

    private bool TryGetUserId(out Guid userId)
    {
        userId = Guid.Empty;
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? User.FindFirstValue("sub")
                    ?? User.FindFirstValue("user_id");
        if (string.IsNullOrEmpty(claim)) return false;
        return Guid.TryParse(claim, out userId);
    }
}
