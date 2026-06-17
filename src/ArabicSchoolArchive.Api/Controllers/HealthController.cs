using Microsoft.AspNetCore.Mvc;

namespace ArabicSchoolArchive.Api.Controllers;

[ApiController]
[Route("health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "ok",
            time = DateTime.UtcNow.ToString("O"),
            service = "ArabicSchoolArchive.Api",
            version = "phase-2.5"
        });
    }
}
