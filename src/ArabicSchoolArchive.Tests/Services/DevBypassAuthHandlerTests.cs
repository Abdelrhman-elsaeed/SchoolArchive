using System.Security.Claims;
using System.Text.Encodings.Web;
using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Transport.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.WebEncoders;
using Xunit;

namespace ArabicSchoolArchive.Tests.Services;

public class DevBypassAuthHandlerTests
{
    [Fact]
    public async Task NoHeaders_ReturnsNoResult()
    {
        var ctx = NewContext(envName: "Development", bypassEnabled: true);
        var result = await Invoke(ctx);
        Assert.True(result.None);
    }

    [Fact]
    public async Task Development_WithBypassDisabled_ReturnsNoResult()
    {
        var ctx = NewContext(envName: "Development", bypassEnabled: false);
        ctx.Request.Headers["X-Dev-School-Id"] = "11111111-1111-1111-1111-111111111111";
        var result = await Invoke(ctx);
        Assert.True(result.None);
    }

    [Fact]
    public async Task Production_WithBypassEnabled_ReturnsNoResult()
    {
        var ctx = NewContext(envName: "Production", bypassEnabled: true);
        ctx.Request.Headers["X-Dev-School-Id"] = "11111111-1111-1111-1111-111111111111";
        var result = await Invoke(ctx);
        Assert.True(result.None);
    }

    [Fact]
    public async Task Development_WithValidHeaders_Succeeds()
    {
        var schoolId = "11111111-1111-1111-1111-111111111111";
        var userId = "22222222-2222-2222-2222-222222222222";
        var ctx = NewContext(envName: "Development", bypassEnabled: true);
        ctx.Request.Headers["X-Dev-School-Id"] = schoolId;
        ctx.Request.Headers["X-Dev-User-Id"] = userId;

        var result = await Invoke(ctx);

        Assert.True(result.Succeeded);
        Assert.Equal(DevBypassAuthHandler.SchemeName, result.Ticket!.AuthenticationScheme);
        Assert.Equal(schoolId, result.Principal.FindFirstValue("school_id"));
        Assert.Equal(userId, result.Principal.FindFirstValue("sub"));
        Assert.Equal(userId, result.Principal.FindFirstValue(ClaimTypes.NameIdentifier));
    }

    [Fact]
    public async Task Development_WithUserIdMissing_FallsBackToEmptyGuid()
    {
        var schoolId = "11111111-1111-1111-1111-111111111111";
        var ctx = NewContext(envName: "Development", bypassEnabled: true);
        ctx.Request.Headers["X-Dev-School-Id"] = schoolId;

        var result = await Invoke(ctx);

        Assert.True(result.Succeeded);
        Assert.Equal(Guid.Empty.ToString(), result.Principal!.FindFirstValue("sub"));
    }

    [Fact]
    public async Task Development_WithInvalidSchoolIdGuid_Fails()
    {
        var ctx = NewContext(envName: "Development", bypassEnabled: true);
        ctx.Request.Headers["X-Dev-School-Id"] = "not-a-guid";

        var result = await Invoke(ctx);

        Assert.NotNull(result.Failure);
        Assert.Contains("X-Dev-School-Id", result.Failure!.Message);
    }

    private static HttpContext NewContext(string envName, bool bypassEnabled)
    {
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnv(envName));
        services.AddLogging();
        services.Configure<AuthOptions>(o => o.DevBypassEnabled = bypassEnabled);
        var sp = services.BuildServiceProvider();

        var ctx = new DefaultHttpContext { RequestServices = sp };
        return ctx;
    }

    private static async Task<AuthenticateResult> Invoke(HttpContext ctx)
    {
        var scheme = new AuthenticationScheme(
            DevBypassAuthHandler.SchemeName,
            DevBypassAuthHandler.SchemeName,
            typeof(DevBypassAuthHandler));

        var sp = ctx.RequestServices;
        var loggerFactory = sp.GetRequiredService<ILoggerFactory>();
        var encoder = UrlEncoder.Default;
        var optionsMonitor = sp.GetRequiredService<IOptionsMonitor<DevBypassAuthOptions>>();
        var env = sp.GetRequiredService<IHostEnvironment>();
        var authOptionsMonitor = sp.GetRequiredService<IOptionsMonitor<AuthOptions>>();

        var handler = new DevBypassAuthHandler(
            optionsMonitor, loggerFactory, encoder, env, authOptionsMonitor);

        await handler.InitializeAsync(scheme, ctx);
        return await handler.AuthenticateAsync();
    }

    private sealed class TestHostEnv : IHostEnvironment
    {
        public TestHostEnv(string name) { EnvironmentName = name; }
        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
