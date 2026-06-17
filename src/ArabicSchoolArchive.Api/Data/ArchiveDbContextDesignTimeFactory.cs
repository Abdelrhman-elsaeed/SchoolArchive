using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ArabicSchoolArchive.Api.Data;

// Used by `dotnet ef migrations add` / `dotnet ef database update` at design time only.
// At runtime, `Program.cs` selects the provider based on `ConnectionStrings:AzureSql`
// (Azure SQL when set, InMemory otherwise). Migrations are applied manually via CLI
// (see LOCAL_RUN.md §4.1.1); `Program.cs` does NOT call `Database.Migrate()`.
public sealed class ArchiveDbContextDesignTimeFactory : IDesignTimeDbContextFactory<ArchiveDbContext>
{
    public ArchiveDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ASA_DESIGN_TIME_CONNECTION")
            ?? "Server=(localdb)\\mssqllocaldb;Database=ArabicSchoolArchive_DesignTime;Trusted_Connection=True;TrustServerCertificate=True;";

        var options = new DbContextOptionsBuilder<ArchiveDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new ArchiveDbContext(options);
    }
}
