using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Speakflow.Data.Migrations
{
    /// <inheritdoc />
    public partial class PreserveReviewsWhenDeletingCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Cards",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Cards");
        }
    }
}
