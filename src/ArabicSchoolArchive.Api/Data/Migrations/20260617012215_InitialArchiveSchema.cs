using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ArabicSchoolArchive.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialArchiveSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Archives",
                columns: table => new
                {
                    document_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    school_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    original_name = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    safe_name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    blob_object_name = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    mime_type = table.Column<string>(type: "nvarchar(127)", maxLength: 127, nullable: false),
                    category = table.Column<string>(type: "nvarchar(127)", maxLength: 127, nullable: true),
                    uploaded_by_user_id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    uploaded_at_utc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    processing_year = table.Column<int>(type: "int", nullable: false),
                    processing_month = table.Column<byte>(type: "tinyint", nullable: false),
                    content_hash_sha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Archives", x => x.document_id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Archives_School_Category",
                table: "Archives",
                columns: new[] { "school_id", "category", "uploaded_at_utc" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "IX_Archives_School_OriginalName",
                table: "Archives",
                columns: new[] { "school_id", "original_name" });

            migrationBuilder.CreateIndex(
                name: "IX_Archives_School_UploadedAt",
                table: "Archives",
                columns: new[] { "school_id", "uploaded_at_utc" },
                descending: new[] { false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Archives");
        }
    }
}
