using System.Security.Claims;
using System.Text.Encodings.Web;
using ArabicSchoolArchive.Api.Configuration;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace ArabicSchoolArchive.Api.Transport.Auth;

/// <summary>
/// Phase 2.5 - Development-only authentication scheme.
/// Accepts X-Dev-School-Id and X-Dev-User-Id headers in place of a real JWT
/// so a developer can smoke-test the upload pipeline with curl / Postman /
/// Bruno without standing up an identity provider.
///
/// SAFETY: The scheme only succeeds when both <see cref="AuthOptions.DevBypassEnabled"/>
/// is true AND the host environment name is "Development". The
/// <see cref="IHostEnvironment"/> check is performed in the constructor and
/// every HandleAuthenticateAsync call, so flipping the env var or the config
/// value alone cannot enable the bypass in a non-Development environment.
/// </summary>
public sealed class DevBypassAuthHandler : AuthenticationHandler<DevBypassAuthOptions>
{
    public const string SchemeName = "DevBypass";

    private readonly IHostEnvironment _env;
    private readonly IOptionsMonitor<AuthOptions> _auth;

    public DevBypassAuthHandler(
        IOptionsMonitor<DevBypassAuthOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IHostEnvironment env,
        IOptionsMonitor<AuthOptions> auth)
        : base(options, logger, encoder)
    {
        _env = env;
        _auth = auth;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!_env.IsDevelopment())
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!_auth.CurrentValue.DevBypassEnabled)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        if (!Request.Headers.TryGetValue("X-Dev-School-Id", out var schoolIdValues)
            || string.IsNullOrWhiteSpace(schoolIdValues))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var schoolIdRaw = schoolIdValues.ToString();
        if (!Guid.TryParse(schoolIdRaw, out var schoolId))
        {
            return Task.FromResult(AuthenticateResult.Fail("X-Dev-School-Id is not a valid GUID."));
        }

        Request.Headers.TryGetValue("X-Dev-User-Id", out var userIdValues);
        var userIdRaw = userIdValues.ToString();
        Guid.TryParse(userIdRaw, out var userId);

        var claims = new List<Claim>
        {
            new("school_id", schoolId.ToString()),
            new("sub", userId == Guid.Empty ? Guid.Empty.ToString() : userId.ToString()),
            new(ClaimTypes.NameIdentifier, userId == Guid.Empty ? Guid.Empty.ToString() : userId.ToString())
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

public sealed class DevBypassAuthOptions : AuthenticationSchemeOptions
{
}