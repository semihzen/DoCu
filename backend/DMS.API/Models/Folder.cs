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

        // İstersen tip adını tam niteleyelim, çakışma varsa kesin çözüm:
        public ICollection<global::DMS.API.Models.Document> Documents { get; set; } 
            = new List<global::DMS.API.Models.Document>();
    }
}
