using Microsoft.AspNetCore.Mvc;

namespace ArabicSchoolArchive.Api.Controllers;

/// <summary>
/// Development-only informational endpoint. Returns 404 in non-Development
/// environments so it is impossible to probe in production. The frontend uses
/// this on first load to decide whether the dev-only content stream route
/// should be used for downloads (the /content route exists in the dev API but
/// is gated on LocalDev:DownloadStreamEnabled=true).
/// </summary>
[ApiController]
[Route("api/v1/local-dev")]
public sealed class LocalDevController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public LocalDevController(IWebHostEnvironment environment, IConfiguration configuration)
    {
        _environment = environment;
        _configuration = configuration;
    }

    [HttpGet("info")]
    public IActionResult Info()
    {
        if (!_environment.IsDevelopment())
        {
            return NotFound();
        }

        var downloadStreamEnabled = _configuration.GetValue("LocalDev:DownloadStreamEnabled", false);
        var authDevBypassEnabled = _configuration.GetValue("Auth:DevBypassEnabled", false);

        return Ok(new
        {
            environment = _environment.EnvironmentName,
            downloadStreamEnabled = downloadStreamEnabled,
            authDevBypassEnabled = authDevBypassEnabled
        });
    }
}
