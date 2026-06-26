using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddArchiveOptions(builder.Configuration);
builder.Services.AddArchiveDatabase(builder.Configuration);
builder.Services.AddArchiveStorage(builder.Configuration);
builder.Services.AddArchiveServices();
builder.Services.AddArchiveAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddArchiveCors(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 25L * 1024 * 1024;
});

var app = builder.Build();

var corsOptions = builder.Configuration
    .GetSection(CorsOptions.SectionName)
    .Get<CorsOptions>() ?? new CorsOptions();

if (corsOptions.AllowedOrigins.Length > 0)
{
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<SubscriptionGuardMiddleware>();
app.UseMiddleware<RateLimitMiddleware>();
app.MapControllers();

app.Run();

public partial class Program { }
