using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ArabicSchoolArchive.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddN8nRichMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "confidence",
                table: "Archives",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "display_name",
                table: "Archives",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "needs_review",
                table: "Archives",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "summary",
                table: "Archives",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tags_json",
                table: "Archives",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Archives_School_DisplayName",
                table: "Archives",
                columns: new[] { "school_id", "display_name" });

            migrationBuilder.CreateIndex(
                name: "IX_Archives_School_Summary",
                table: "Archives",
                columns: new[] { "school_id", "summary" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Archives_School_DisplayName",
                table: "Archives");

            migrationBuilder.DropIndex(
                name: "IX_Archives_School_Summary",
                table: "Archives");

            migrationBuilder.DropColumn(
                name: "confidence",
                table: "Archives");

            migrationBuilder.DropColumn(
                name: "display_name",
                table: "Archives");

            migrationBuilder.DropColumn(
                name: "needs_review",
                table: "Archives");

            migrationBuilder.DropColumn(
                name: "summary",
                table: "Archives");

            migrationBuilder.DropColumn(
                name: "tags_json",
                table: "Archives");
        }
    }
}
