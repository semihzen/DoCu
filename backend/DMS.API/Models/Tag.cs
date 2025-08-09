using System.Collections.Generic;

namespace DMS.API.Models
{
    public class Tag
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = default!;   // UNIQUE olacak

        public ICollection<DocumentTag> DocumentTags { get; set; } = new List<DocumentTag>();
    }
}
