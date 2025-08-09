using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace DMS.API.Models
{
    public class Document
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [MaxLength(256)]
        public string Title { get; set; } = default!;
        public string? Description { get; set; }

        [MaxLength(260)]
        public string FileName { get; set; } = default!;
        [MaxLength(128)]
        public string MimeType { get; set; } = default!;
        public long FileSizeBytes { get; set; }
        [MaxLength(512)]
        public string StoragePath { get; set; } = default!;
        public string? HashSha256 { get; set; }

        public Guid FolderId { get; set; }
        public Folder Folder { get; set; } = default!;

        public int OwnerId { get; set; }
        public int VersionNumber { get; set; } = 1;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }
        public bool IsArchived { get; set; }

        public ICollection<DocumentVersion> Versions { get; set; } = new List<DocumentVersion>();
        public ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();
    }
}
