using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArabicSchoolArchive.Api.Entities;

[Table("Archives")]
public sealed class Archive
{
    [Key]
    [Column("document_id")]
    public Guid DocumentId { get; set; }

    [Column("school_id")]
    public Guid SchoolId { get; set; }

    [Required]
    [Column("original_name")]
    [MaxLength(512)]
    public string OriginalName { get; set; } = string.Empty;

    [Required]
    [Column("safe_name")]
    [MaxLength(255)]
    public string SafeName { get; set; } = string.Empty;

    [Required]
    [Column("blob_object_name")]
    [MaxLength(1024)]
    public string BlobObjectName { get; set; } = string.Empty;

    [Column("size_bytes")]
    public long SizeBytes { get; set; }

    [Required]
    [Column("mime_type")]
    [MaxLength(127)]
    public string MimeType { get; set; } = string.Empty;

    [Column("category")]
    [MaxLength(127)]
    public string? Category { get; set; }

    [Column("uploaded_by_user_id")]
    public Guid UploadedByUserId { get; set; }

    [Column("uploaded_at_utc")]
    public DateTime UploadedAtUtc { get; set; }

    [Column("processing_year")]
    public int ProcessingYear { get; set; }

    [Column("processing_month")]
    public byte ProcessingMonth { get; set; }

    [Column("content_hash_sha256")]
    [MaxLength(64)]
    public string? ContentHashSha256 { get; set; }

    [Column("display_name")]
    [MaxLength(512)]
    public string? DisplayName { get; set; }

    [Column("summary")]
    [MaxLength(2048)]
    public string? Summary { get; set; }

    [Column("tags_json")]
    public string? TagsJson { get; set; }

    [NotMapped]
    public List<string> Tags
    {
        get
        {
            if (string.IsNullOrWhiteSpace(TagsJson)) return new List<string>();
            try
            {
                return System.Text.Json.JsonSerializer.Deserialize<List<string>>(TagsJson) ?? new List<string>();
            }
            catch (System.Text.Json.JsonException)
            {
                return new List<string>();
            }
        }
        set
        {
            if (value is null || value.Count == 0)
            {
                TagsJson = null;
            }
            else
            {
                TagsJson = System.Text.Json.JsonSerializer.Serialize(value);
            }
        }
    }

    [Column("confidence")]
    public double? Confidence { get; set; }

    [Column("needs_review")]
    public bool NeedsReview { get; set; }
}
