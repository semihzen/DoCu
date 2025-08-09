public class AuditLog
{
    public long Id { get; set; }
    public int? UserId { get; set; }
    public string Action { get; set; } = default!;   // Upload/Delete/Move/Download/Login...
    public string? Target { get; set; }              // Document/Folder/Tag/User
    public string? TargetId { get; set; }
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
