using System;
using System.Collections.Generic;

namespace DMS.API.Models
{
    public class Tag
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        // AppDbContext’te Unique Index var (HasIndex(x => x.Name).IsUnique())
        public string Name { get; set; } = default!;

        // N:N tarafları
        public ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();
        public ICollection<FolderTag>   FolderTags   { get; set; } = new List<FolderTag>();
    }
}
