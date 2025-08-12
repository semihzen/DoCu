using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DMS.API.Data;
using DMS.API.Models;
using DMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FoldersController : ControllerBase
{
    private readonly AppDbContext _db;
    public FoldersController(AppDbContext db) => _db = db;

    // DTOs
    public sealed record UpdateFolderDto(string Name);

    private bool IsPrivileged() => User.IsAdmin() || User.IsSuperUser();

    private bool TryGetUserId(out int userId)
    {
        userId = 0;
        var s = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User.FindFirst("sub")?.Value
                ?? User.FindFirst("userId")?.Value;
        return int.TryParse(s, out userId);
    }

    // GET /api/Folders?parentId=<guid?>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<FolderVm>>> Get([FromQuery] Guid? parentId)
    {
        var privileged = IsPrivileged();
        TryGetUserId(out var uid);

        var q = _db.Folders.AsNoTracking().AsQueryable();
        if (!privileged) q = q.Where(f => f.OwnerId == uid);
        if (parentId.HasValue) q = q.Where(f => f.ParentId == parentId);

        var items = await (
            from f in q
            join u in _db.Users.AsNoTracking() on f.OwnerId equals u.Id into fu
            from u in fu.DefaultIfEmpty()
            orderby f.Name
            select new FolderVm(
                f.Id, f.Name, f.ParentId, f.Path, f.Level, f.OwnerId,
                u != null ? u.Email : null, u != null ? u.Name : null, f.UpdatedAt
            )
        ).ToListAsync();

        return Ok(items);
    }

    // POST /api/Folders
    [HttpPost]
    public async Task<ActionResult<FolderVm>> Create([FromBody] CreateFolderDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Folder name is required.");
        if (!TryGetUserId(out var uid)) return Forbid();

        Folder? parent = null;
        if (dto.ParentId.HasValue)
        {
            parent = await _db.Folders.FirstOrDefaultAsync(x => x.Id == dto.ParentId.Value);
            if (parent is null) return NotFound("Parent folder not found.");
            if (!IsPrivileged() && parent.OwnerId != uid) return Forbid();
        }

        var name = dto.Name.Trim();

        // aynı parent altında aynı isim olmasın
        var exists = await _db.Folders.AnyAsync(f =>
            f.ParentId == dto.ParentId &&
            f.Name.ToLower() == name.ToLower());
        if (exists) return BadRequest($"'{name}' isimli klasör zaten mevcut.");

        var folder = new Folder
        {
            Name = name,
            ParentId = dto.ParentId,
            OwnerId = uid,
            Path = parent is null ? $"/{name}" : $"{parent.Path}/{name}",
            Level = parent is null ? 0 : parent.Level + 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Folders.Add(folder);
        await _db.SaveChangesAsync(); // Id oluştu

        // TAG EKLE (isteğe bağlı)
        if (dto.Tags != null && dto.Tags.Count > 0)
        {
            var names = dto.Tags
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => t.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var tagName in names)
            {
                var tag = await _db.Tags.FirstOrDefaultAsync(t => t.Name == tagName)
                          ?? _db.Tags.Add(new Tag { Name = tagName }).Entity;

                _db.FolderTags.Add(new FolderTag { FolderId = folder.Id, TagId = tag.Id });
            }
            await _db.SaveChangesAsync();
        }

        var owner = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid);
        return Ok(new FolderVm(
            folder.Id, folder.Name, folder.ParentId, folder.Path, folder.Level,
            folder.OwnerId, owner?.Email, owner?.Name, folder.UpdatedAt
        ));
    }

    // PUT /api/Folders/{id}
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFolderDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest("Folder name is required.");

        if (!TryGetUserId(out var uid)) return Forbid();

        var folder = await _db.Folders.FirstOrDefaultAsync(f => f.Id == id);
        if (folder is null) return NotFound();

        if (!(IsPrivileged() || folder.OwnerId == uid)) return Forbid();

        var newName = dto.Name.Trim();

        // aynı parent altında çakışan isim var mı?
        var exists = await _db.Folders.AnyAsync(f =>
            f.Id != id &&
            f.ParentId == folder.ParentId &&
            f.Name.ToLower() == newName.ToLower()
        );
        if (exists) return BadRequest($"'{newName}' isimli klasör zaten mevcut.");

        // path güncelle
        var oldPath = folder.Path; // /A/B/Eski
        var lastSlash = oldPath.LastIndexOf('/');
        var parentPath = (lastSlash <= 0) ? "" : oldPath.Substring(0, lastSlash);
        var newPath = string.IsNullOrEmpty(parentPath) ? $"/{newName}" : $"{parentPath}/{newName}";

        folder.Name = newName;
        folder.Path = newPath;
        folder.UpdatedAt = DateTime.UtcNow;

        // altların path'ini taşı
        var descendants = await _db.Folders
            .Where(f => f.Path.StartsWith(oldPath + "/"))
            .ToListAsync();

        foreach (var d in descendants)
            d.Path = newPath + d.Path.Substring(oldPath.Length);

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/Folders/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var target = await _db.Folders.FirstOrDefaultAsync(f => f.Id == id);
        if (target is null) return NotFound();

        var privileged = IsPrivileged();
        var isOwner = target.OwnerId == uid;
        if (!(privileged || isOwner)) return Forbid();

        var tree = await _db.Folders.Where(f => f.Path.StartsWith(target.Path)).ToListAsync();
        var treeIds = tree.Select(f => f.Id).ToList();

        var docs = await _db.Documents
            .Where(d => d.FolderId.HasValue && treeIds.Contains(d.FolderId.Value))
            .ToListAsync();
        var docIds = docs.Select(d => d.Id).ToList();

        _db.DocumentTags.RemoveRange(_db.DocumentTags.Where(x => docIds.Contains(x.DocumentId)));
        _db.DocumentVersions.RemoveRange(_db.DocumentVersions.Where(x => docIds.Contains(x.DocumentId)));
        _db.Documents.RemoveRange(docs);

        _db.Folders.RemoveRange(tree);
        await _db.SaveChangesAsync();

        // kullanılmayan tag'leri temizle
        await TagsController.CleanupUnusedTagsAsync(_db);

        return NoContent();
    }

    // GET /api/Folders/{id}/tags
    [HttpGet("{id:guid}/tags")]
    public async Task<IActionResult> GetFolderTags(Guid id)
    {
        var items = await _db.FolderTags
            .Where(ft => ft.FolderId == id)
            .Select(ft => new { id = ft.TagId, name = ft.Tag!.Name })
            .ToListAsync();

        return Ok(items);
    }

    // POST /api/Folders/{id}/tags
    [HttpPost("{id:guid}/tags")]
    public async Task<IActionResult> SetFolderTags(
        Guid id,
        [FromBody] List<string> tagNames,
        [FromQuery] bool propagate = true,
        [FromQuery] bool recursive = false)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var folder = await _db.Folders
            .Include(f => f.FolderTags)
            .FirstOrDefaultAsync(f => f.Id == id);
        if (folder is null) return NotFound();
        if (!(IsPrivileged() || folder.OwnerId == uid)) return Forbid();

        _db.FolderTags.RemoveRange(folder.FolderTags);

        var names = (tagNames ?? new List<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var n in names)
        {
            var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Name == n)
                      ?? _db.Tags.Add(new Tag { Name = n }).Entity;

            _db.FolderTags.Add(new FolderTag { FolderId = id, TagId = tag.Id });
        }

        await _db.SaveChangesAsync();

        if (propagate)
        {
            if (recursive) await PropagateTagsRecursive(id);
            else await PropagateTagsOneLevel(id);
        }

        // kullanılmayan tag'leri temizle (olabilir)
        await TagsController.CleanupUnusedTagsAsync(_db);

        return NoContent();
    }

    // === helpers ===
    private async Task PropagateTagsOneLevel(Guid folderId)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO dbo.DocumentTags (DocumentId, TagId)
SELECT d.Id, ft.TagId
FROM dbo.Documents d
JOIN dbo.FolderTags ft ON ft.FolderId = {folderId}
LEFT JOIN dbo.DocumentTags dt ON dt.DocumentId = d.Id AND dt.TagId = ft.TagId
WHERE d.FolderId = {folderId} AND dt.DocumentId IS NULL;
");
    }

    private async Task PropagateTagsRecursive(Guid folderId)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync($@"
WITH subfolders AS (
    SELECT Id FROM dbo.Folders WHERE Id = {folderId}
    UNION ALL
    SELECT f.Id FROM dbo.Folders f
    JOIN subfolders s ON f.ParentId = s.Id
)
INSERT INTO dbo.DocumentTags (DocumentId, TagId)
SELECT d.Id, ft.TagId
FROM dbo.Documents d
JOIN subfolders s ON d.FolderId = s.Id
JOIN dbo.FolderTags ft ON ft.FolderId = {folderId}
LEFT JOIN dbo.DocumentTags dt ON dt.DocumentId = d.Id AND dt.TagId = ft.TagId
WHERE dt.DocumentId IS NULL;
");
    }
}
