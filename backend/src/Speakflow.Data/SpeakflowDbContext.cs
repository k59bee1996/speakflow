using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Speakflow.Data.Entities;

namespace Speakflow.Data;

public sealed class SpeakflowDbContext(
    DbContextOptions<SpeakflowDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<Card> Cards => Set<Card>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<AiRequestLog> AiRequests => Set<AiRequestLog>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasKey(session => session.Id);
            entity.HasIndex(session => session.UserId);
            entity.HasOne<ApplicationUser>().WithMany()
                .HasForeignKey(session => session.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Profile>(entity =>
        {
            entity.ToTable("Profiles", table =>
                table.HasCheckConstraint("CK_Profiles_Mode", "[Mode] IN ('30', '60')"));
            entity.HasKey(profile => profile.UserId);
            entity.HasIndex(profile => profile.UserId).HasDatabaseName("IX_Profiles_UserId");
            entity.Property(profile => profile.Mode).HasMaxLength(2).HasDefaultValue("30");
            entity.Property(profile => profile.StartDate).HasDefaultValueSql("CONVERT(date, GETUTCDATE())");
            entity.Property(profile => profile.SeededWeeks).HasColumnType("nvarchar(max)");
            entity.Property(profile => profile.Checks).HasColumnType("nvarchar(max)");
            entity.Property(profile => profile.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasOne<ApplicationUser>()
                .WithOne()
                .HasForeignKey<Profile>(profile => profile.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Card>(entity =>
        {
            entity.HasQueryFilter(card => !card.IsDeleted);
            entity.ToTable("Cards", table =>
            {
                table.HasCheckConstraint("CK_Cards_Front_Length", "LEN([Front]) <= 500");
                table.HasCheckConstraint("CK_Cards_Back_Length", "LEN([Back]) <= 500");
            });
            entity.HasKey(card => card.Id);
            entity.Property(card => card.Id).HasDefaultValueSql("NEWID()");
            entity.Property(card => card.Front).HasMaxLength(500).IsRequired();
            entity.Property(card => card.Back).HasMaxLength(500).IsRequired();
            entity.Property(card => card.Note).HasDefaultValue(string.Empty).IsRequired();
            entity.Property(card => card.Week).HasDefaultValue(0);
            entity.Property(card => card.Due).HasDefaultValueSql("CONVERT(date, GETUTCDATE())");
            entity.Property(card => card.IntervalDays).HasDefaultValue(0);
            entity.Property(card => card.Ease).HasDefaultValue(2.5d);
            entity.Property(card => card.Reps).HasDefaultValue(0);
            entity.Property(card => card.Lapses).HasDefaultValue(0);
            entity.Property(card => card.IsNew).HasDefaultValue(true);
            entity.Property(card => card.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(card => new { card.UserId, card.SeedKey })
                .IsUnique()
                .HasFilter("[SeedKey] IS NOT NULL")
                .HasDatabaseName("UX_Cards_UserId_SeedKey");
            entity.HasIndex(card => new { card.UserId, card.IsNew, card.Due })
                .HasDatabaseName("IX_Cards_UserId_IsNew_Due");
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(card => card.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Review>(entity =>
        {
            entity.ToTable("Reviews", table =>
                table.HasCheckConstraint("CK_Reviews_Grade", "[Grade] BETWEEN 0 AND 3"));
            entity.HasKey(review => review.Id);
            entity.Property(review => review.Id).UseIdentityColumn();
            entity.Property(review => review.Grade).IsRequired();
            entity.Property(review => review.WasNew).HasDefaultValue(false);
            entity.Property(review => review.ReviewedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(review => new { review.UserId, review.ReviewedAt })
                .HasDatabaseName("IX_Reviews_UserId_ReviewedAt");
            entity.HasIndex(review => new { review.UserId, review.ReviewedOn });
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(review => review.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Card>()
                .WithMany()
                .HasForeignKey(review => review.CardId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Note>(entity =>
        {
            entity.ToTable("Notes", table =>
                table.HasCheckConstraint("CK_Notes_Vi_Length", "LEN([Vi]) <= 500"));
            entity.HasKey(note => note.Id);
            entity.Property(note => note.Id).HasDefaultValueSql("NEWID()");
            entity.Property(note => note.Vi).HasMaxLength(500).IsRequired();
            entity.Property(note => note.OptionsJson).HasColumnName("Options").HasColumnType("nvarchar(max)").HasDefaultValue("[]");
            entity.Property(note => note.Carded).HasColumnType("nvarchar(max)");
            entity.Property(note => note.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(note => new { note.UserId, note.CreatedAt })
                .HasDatabaseName("IX_Notes_UserId_CreatedAt");
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(note => note.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiRequestLog>(entity =>
        {
            entity.ToTable("AiRequests");
            entity.HasKey(request => request.Id);
            entity.Property(request => request.Id).UseIdentityColumn();
            entity.Property(request => request.Kind).HasMaxLength(100).HasDefaultValue("suggest");
            entity.Property(request => request.CreatedAt).HasDefaultValueSql("SYSUTCDATETIME()");
            entity.HasIndex(request => new { request.UserId, request.CreatedAt })
                .HasDatabaseName("IX_AiRequests_UserId_CreatedAt");
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(request => request.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
