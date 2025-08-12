namespace DMS.API.Models;
public class DocumentUpdateDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public Guid? FolderId { get; set; } 
}
