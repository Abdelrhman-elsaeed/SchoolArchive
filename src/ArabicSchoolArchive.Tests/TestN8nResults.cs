using ArabicSchoolArchive.Api.Clients.N8n;

namespace ArabicSchoolArchive.Tests;

internal static class TestN8nResults
{
    public static N8nResult Success(string category) =>
        new(
            Success: true,
            Category: category,
            DisplayName: null,
            Summary: null,
            Tags: Array.Empty<string>(),
            Confidence: null,
            NeedsReview: false,
            FailureReason: null,
            ReasonCode: null);

    public static N8nResult SuccessRich(
        string category,
        string? displayName,
        string? summary,
        IReadOnlyList<string> tags,
        double? confidence = null,
        bool needsReview = false) =>
        new(
            Success: true,
            Category: category,
            DisplayName: displayName,
            Summary: summary,
            Tags: tags,
            Confidence: confidence,
            NeedsReview: needsReview,
            FailureReason: null,
            ReasonCode: null);

    public static N8nResult Failure(string reasonCode, string failureReason) =>
        new(
            Success: false,
            Category: null,
            DisplayName: null,
            Summary: null,
            Tags: Array.Empty<string>(),
            Confidence: null,
            NeedsReview: false,
            FailureReason: failureReason,
            ReasonCode: reasonCode);
}
