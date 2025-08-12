// Models/DocumentBackupOnce.cs
using System;
using System.ComponentModel.DataAnnotations.Schema;

[Table("Documents_backup_Once")] // tablo adın
public class DocumentBackupOnce
{
    public Guid Id { get; set; }               // orijinal Document.Id
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? FileName { get; set; }
    public string? MimeType { get; set; }
    public long FileSizeBytes { get; set; }
    public string? StoragePath { get; set; }
    public string? HashSha256 { get; set; }
    public Guid? FolderId { get; set; }
    public int OwnerId { get; set; }
    public int VersionNumber { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public bool IsArchived { get; set; } = true; // senin tablonda var
}
