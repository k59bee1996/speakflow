using Speakflow.Api.Features;

namespace Speakflow.Tests;

[TestClass]
public sealed class SrsTests
{
    [TestMethod]
    [DataRow(0, 0, 0, 0, 2.3, 0)]
    [DataRow(0, 0, 1, 1, 2.35, 1)]
    [DataRow(0, 0, 2, 1, 2.5, 1)]
    [DataRow(0, 0, 3, 3, 2.65, 1)]
    [DataRow(1, 1, 0, 0, 2.3, 0)]
    [DataRow(1, 1, 1, 2, 2.35, 2)]
    [DataRow(1, 1, 2, 3, 2.5, 2)]
    [DataRow(1, 1, 3, 5, 2.65, 2)]
    [DataRow(10, 2, 0, 0, 2.3, 0)]
    [DataRow(10, 2, 1, 12, 2.35, 3)]
    [DataRow(10, 2, 2, 25, 2.5, 3)]
    [DataRow(10, 2, 3, 33, 2.65, 3)]
    public void PreservesAllFourGradesAtEachRepetitionStage(int interval, int reps, int grade, int days, double ease, int nextReps)
    {
        var result = Srs.Plan(interval, 2.5, reps, grade);
        Assert.AreEqual(days, result.IntervalDays); Assert.AreEqual(ease, result.Ease, 0.000001); Assert.AreEqual(nextReps, result.Reps);
    }

    [TestMethod]
    public void EaseNeverDropsBelowFloor()
    {
        Assert.AreEqual(1.3, Srs.Plan(1, 1.3, 3, 0).Ease);
        Assert.AreEqual(1.3, Srs.Plan(1, 1.3, 3, 1).Ease);
    }
}
