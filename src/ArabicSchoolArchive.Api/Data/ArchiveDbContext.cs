using ArabicSchoolArchive.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace ArabicSchoolArchive.Api.Data;

public class ArchiveDbContext : DbContext
{
    public ArchiveDbContext(DbContextOptions<ArchiveDbContext> options) : base(options)
    {
    }

    public DbSet<Archive> Archives => Set<Archive>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Archive>(entity =>
        {
            entity.ToTable("Archives");
            entity.HasKey(a => a.DocumentId);

            entity.Property(a => a.SizeBytes)
                .IsRequired();

            entity.Property(a => a.ProcessingYear)
                .IsRequired();

            entity.Property(a => a.ProcessingMonth)
                .IsRequired();

            entity.HasIndex(a => new { a.SchoolId, a.UploadedAtUtc })
                .HasDatabaseName("IX_Archives_School_UploadedAt")
                .IsDescending(false, true);

            entity.HasIndex(a => new { a.SchoolId, a.Category, a.UploadedAtUtc })
                .HasDatabaseName("IX_Archives_School_Category")
                .IsDescending(false, false, true);

            entity.HasIndex(a => new { a.SchoolId, a.OriginalName })
                .HasDatabaseName("IX_Archives_School_OriginalName");
        });
    }
}
