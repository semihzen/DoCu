namespace DMS.API.Models
{
    public class DocumentVersion
    {
        public long Id { get; set; }
        public Guid DocumentId { get; set; }
        public Document Document { get; set; } = default!;
        public int VersionNumber { get; set; }
        public string StoragePath { get; set; } = default!;
        public string FileName { get; set; } = default!;
        public string MimeType { get; set; } = default!;
        public long FileSizeBytes { get; set; }
        public string? HashSha256 { get; set; }
        public int CreatedBy { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
