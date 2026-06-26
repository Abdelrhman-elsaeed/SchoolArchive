using System.Security.Claims;

namespace ArabicSchoolArchive.Api.Shared;

/// <summary>
/// Extension helpers for extracting tenant and user identity from a
/// <see cref="ClaimsPrincipal"/>.  Centralises the claim-name fallback
/// logic that was previously duplicated across controllers and middlewares.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Attempts to extract the school (tenant) identifier from the standard
    /// <c>school_id</c> or legacy <c>schoolId</c> claim.
    /// </summary>
    public static bool TryGetSchoolId(this ClaimsPrincipal principal, out Guid schoolId)
    {
        schoolId = Guid.Empty;
        var claim = principal.FindFirstValue("school_id")
                    ?? principal.FindFirstValue("schoolId");
        if (string.IsNullOrEmpty(claim)) return false;
        return Guid.TryParse(claim, out schoolId);
    }

    /// <summary>
    /// Returns the authenticated user's identifier, or <c>null</c> when the
    /// claim is absent or unparseable as a <see cref="Guid"/>.
    /// </summary>
    public static Guid? FindUserId(this ClaimsPrincipal principal)
    {
        var claim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? principal.FindFirst("sub")?.Value
                    ?? principal.FindFirst("user_id")?.Value;
        if (string.IsNullOrEmpty(claim)) return null;
        return Guid.TryParse(claim, out var g) ? g : null;
    }
}
