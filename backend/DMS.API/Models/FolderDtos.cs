public record CreateFolderDto(string Name, Guid? ParentId);
public record FolderVm(Guid Id, string Name, Guid? ParentId, string Path, int Level);
