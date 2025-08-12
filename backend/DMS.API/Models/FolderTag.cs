namespace DMS.API.Models;
public class FolderTag
{
    public Guid FolderId { get; set; }
    public Guid TagId { get; set; }
    public Folder? Folder { get; set; }
    public Tag? Tag { get; set; }
}
