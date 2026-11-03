namespace Speakflow.Data.Entities;

public sealed class Note
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Vi { get; set; } = string.Empty;
    public string OptionsJson { get; set; } = "[]";
    public int[] Carded { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; }
}
