using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Speakflow.Data;
using Speakflow.Data.Entities;

namespace Speakflow.Tests;

[TestClass]
public sealed class SpeakflowDbContextModelTests
{
    [TestMethod]
    public void EveryUserDataTableHasRequiredUserForeignKeyAndUserFirstIndex()
    {
        var options = new DbContextOptionsBuilder<SpeakflowDbContext>()
            .UseSqlServer()
            .Options;
        using var context = new SpeakflowDbContext(options);

        AssertUserOwnedEntity<Profile>(context);
        AssertUserOwnedEntity<Card>(context);
        AssertUserOwnedEntity<Review>(context);
        AssertUserOwnedEntity<Note>(context);
        AssertUserOwnedEntity<AiRequestLog>(context);
    }

    [TestMethod]
    public void CardsAllowMultipleUserCreatedRowsWithoutASeedKey()
    {
        var options = new DbContextOptionsBuilder<SpeakflowDbContext>()
            .UseSqlServer()
            .Options;
        using var context = new SpeakflowDbContext(options);

        var seedKeyIndex = context.Model.FindEntityType(typeof(Card))!
            .GetIndexes()
            .Single(index => index.GetDatabaseName() == "UX_Cards_UserId_SeedKey");

        Assert.IsTrue(seedKeyIndex.IsUnique);
        Assert.AreEqual("[SeedKey] IS NOT NULL", seedKeyIndex.GetFilter());
    }

    [TestMethod]
    public void InitialMigrationCreatesIdentityAndV02DataTables()
    {
        var options = new DbContextOptionsBuilder<SpeakflowDbContext>()
            .UseSqlServer()
            .Options;
        using var context = new SpeakflowDbContext(options);

        var script = context.GetService<IMigrator>().GenerateScript();

        StringAssert.Contains(script, "CREATE TABLE [AspNetUsers]");
        StringAssert.Contains(script, "CREATE TABLE [Profiles]");
        StringAssert.Contains(script, "CREATE TABLE [Cards]");
        StringAssert.Contains(script, "CREATE TABLE [Reviews]");
        StringAssert.Contains(script, "CREATE TABLE [Notes]");
        StringAssert.Contains(script, "CREATE TABLE [AiRequests]");
        Assert.IsFalse(script.Contains("CREATE TABLE [Sessions]", StringComparison.Ordinal));
    }

    private static void AssertUserOwnedEntity<TEntity>(SpeakflowDbContext context)
    {
        var entity = context.Model.FindEntityType(typeof(TEntity));
        Assert.IsNotNull(entity, $"{typeof(TEntity).Name} is missing from the EF model.");

        var userId = entity.FindProperty(nameof(Profile.UserId));
        Assert.IsNotNull(userId, $"{typeof(TEntity).Name} has no UserId property.");
        Assert.IsFalse(userId.IsNullable, $"{typeof(TEntity).Name}.UserId must be required.");
        Assert.IsTrue(
            entity.GetForeignKeys().Any(foreignKey =>
                foreignKey.Properties.Contains(userId) &&
                foreignKey.PrincipalEntityType.ClrType == typeof(ApplicationUser)),
            $"{typeof(TEntity).Name}.UserId must reference ApplicationUser.");
        Assert.IsTrue(
            entity.GetIndexes().Any(index => index.Properties.FirstOrDefault()?.Name == nameof(Profile.UserId)),
            $"{typeof(TEntity).Name} needs an index beginning with UserId.");
    }
}
