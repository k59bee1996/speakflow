using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Speakflow.Data.Migrations
{
    /// <inheritdoc />
    public partial class RollingLoginFailureWindow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LoginWindowStartedAt",
                table: "AspNetUsers");

            migrationBuilder.AddColumn<string>(
                name: "LoginFailures",
                table: "AspNetUsers",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LoginFailures",
                table: "AspNetUsers");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LoginWindowStartedAt",
                table: "AspNetUsers",
                type: "datetimeoffset",
                nullable: true);
        }
    }
}
