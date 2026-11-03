namespace Speakflow.Api.Features;

public sealed record SrsState(int IntervalDays, double Ease, int Reps);

public static class Srs
{
    public static SrsState Plan(int interval, double ease, int reps, int grade)
    {
        if (grade is < 0 or > 3) throw new ArgumentOutOfRangeException(nameof(grade));
        if (grade == 0) return new(0, Math.Max(1.3, ease - 0.2), 0);
        var days = reps == 0 ? (grade == 3 ? 3 : 1)
            : reps == 1 ? (grade == 1 ? 2 : grade == 2 ? 3 : 5)
            : (int)Math.Floor(interval * (grade == 1 ? 1.2 : grade == 2 ? ease : ease * 1.3) + 0.5);
        var nextEase = grade == 1 ? Math.Max(1.3, ease - 0.15) : grade == 3 ? ease + 0.15 : ease;
        return new(Math.Max(1, days), nextEase, reps + 1);
    }
}
