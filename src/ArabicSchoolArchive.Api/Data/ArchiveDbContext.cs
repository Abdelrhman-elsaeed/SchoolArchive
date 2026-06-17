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

            entity.Property(a => a.NeedsReview)
                .IsRequired()
                .HasDefaultValue(false);

            entity.Property(a => a.DisplayName)
                .HasMaxLength(512);

            entity.Property(a => a.Summary)
                .HasMaxLength(2048);

            entity.Property(a => a.TagsJson)
                .HasColumnType("nvarchar(max)");

            entity.Property(a => a.Confidence)
                .HasColumnType("float");

            entity.HasIndex(a => new { a.SchoolId, a.UploadedAtUtc })
                .HasDatabaseName("IX_Archives_School_UploadedAt")
                .IsDescending(false, true);

            entity.HasIndex(a => new { a.SchoolId, a.Category, a.UploadedAtUtc })
                .HasDatabaseName("IX_Archives_School_Category")
                .IsDescending(false, false, true);

            entity.HasIndex(a => new { a.SchoolId, a.OriginalName })
                .HasDatabaseName("IX_Archives_School_OriginalName");

            entity.HasIndex(a => new { a.SchoolId, a.DisplayName })
                .HasDatabaseName("IX_Archives_School_DisplayName");

            entity.HasIndex(a => new { a.SchoolId, a.Summary })
                .HasDatabaseName("IX_Archives_School_Summary");

            entity.Ignore(a => a.Tags);
        });
    }
}
