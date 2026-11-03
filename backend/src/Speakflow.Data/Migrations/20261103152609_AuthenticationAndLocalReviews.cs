using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Speakflow.Data.Migrations
{
    /// <inheritdoc />
    public partial class AuthenticationAndLocalReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "ReviewedOn",
                table: "Reviews",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.Sql("UPDATE [Reviews] SET [ReviewedOn] = CONVERT(date, [ReviewedAt]);");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LoginWindowStartedAt",
                table: "AspNetUsers",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UserSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSessions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Reviews_UserId_ReviewedOn",
                table: "Reviews",
                columns: new[] { "UserId", "ReviewedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_UserSessions_UserId",
                table: "UserSessions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserSessions");

            migrationBuilder.DropIndex(
                name: "IX_Reviews_UserId_ReviewedOn",
                table: "Reviews");

            migrationBuilder.DropColumn(
                name: "ReviewedOn",
                table: "Reviews");

            migrationBuilder.DropColumn(
                name: "LoginWindowStartedAt",
                table: "AspNetUsers");
        }
    }
}
