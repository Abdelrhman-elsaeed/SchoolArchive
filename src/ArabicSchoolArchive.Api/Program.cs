using ArabicSchoolArchive.Api.Configuration;
using ArabicSchoolArchive.Api.Data;
using ArabicSchoolArchive.Api.Services;
using Azure.Storage.Blobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.InMemory;
var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<UploadOptions>(
    builder.Configuration.GetSection(UploadOptions.SectionName));
builder.Services.Configure<N8nOptions>(
    builder.Configuration.GetSection(N8nOptions.SectionName));
builder.Services.Configure<BlobOptions>(
    builder.Configuration.GetSection(BlobOptions.SectionName));

var connectionString = builder.Configuration.GetConnectionString("AzureSql");
if (!string.IsNullOrEmpty(connectionString))
{
    builder.Services.AddDbContext<ArchiveDbContext>(options =>
        options.UseSqlServer(connectionString));
}
else
{
    builder.Services.AddDbContext<ArchiveDbContext>(options =>
        options.UseInMemoryDatabase("ArchiveDb"));
}

builder.Services.AddSingleton(TimeProvider.System);

var blobConnection = builder.Configuration.GetSection(BlobOptions.SectionName)["ConnectionString"];
if (!string.IsNullOrEmpty(blobConnection))
{
    builder.Services.AddSingleton(_ => new BlobServiceClient(blobConnection));
}
else
{
    builder.Services.AddSingleton(_ => new BlobServiceClient("UseDevelopmentStorage=true;"));
}

builder.Services.AddHttpClient<IN8nClient, N8nClient>();
builder.Services.AddScoped<IFileValidator, FileValidator>();
builder.Services.AddScoped<IBlobStorageService, BlobStorageService>();
builder.Services.AddScoped<IArchiveRepository, ArchiveRepository>();
builder.Services.AddScoped<IUploadOrchestrator, UploadOrchestrator>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 25L * 1024 * 1024;
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

public partial class Program { }
