public class CreateDocumentDto
{
    public string Title { get; set; } = default!;
    public string? Description { get; set; }
    public Guid FolderId { get; set; }
    public List<string>? Tags { get; set; } // ["Finans","2025"]
}
