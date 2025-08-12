namespace DMS.API.Models
{
    public record CreateFolderDto(
        string Name,
        Guid? ParentId,
        List<string>? Tags // 👈 Yeni eklendi
    );

    public record FolderVm(
        Guid Id,
        string Name,
        Guid? ParentId,
        string Path,
        int Level,
        int OwnerId,          // INT: Users.Id ile eşleşir
        string? OwnerEmail,
        string? OwnerName,
        DateTime? UpdatedAt
    );
}
