
namespace DMS.API.Models

{
    public class DocumentTag
    {
        public Guid DocumentId { get; set; }
        public Document Document { get; set; } = default!;

        public Guid TagId { get; set; }
        public Tag Tag { get; set; } = default!;
    }
}
