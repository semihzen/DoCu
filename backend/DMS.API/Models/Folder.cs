using System;
using System.Collections.Generic;

namespace DMS.API.Models
{
    public class Folder
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public string Name { get; set; } = default!;

        public Guid? ParentId { get; set; }
        public Folder? Parent { get; set; }
        public ICollection<Folder> Children { get; set; } = new List<Folder>();

        public int OwnerId { get; set; }

        public string Path { get; set; } = "/";
        public int Level { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }

        // N:N (Folder <-> Tag) join navigasyonu
        public ICollection<FolderTag> FolderTags { get; set; } = new List<FolderTag>();

        // 1:N (Folder <-> Document)
        public ICollection<Document> Documents { get; set; } = new List<Document>();
    }
}
