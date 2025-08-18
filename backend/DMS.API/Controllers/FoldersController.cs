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

    public sealed record UpdateFolderDto(string Name);

    private bool TryGetUserId(out int userId)
    {
        userId = 0;
        var s = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User.FindFirst("sub")?.Value
                ?? User.FindFirst("userId")?.Value;
        return int.TryParse(s, out userId);
    }

    private (bool IsAdmin, bool IsSuperUser, int UserId) GetAuth()
    {
        TryGetUserId(out var uid);

        var roleValues = User.FindAll(ClaimTypes.Role).Select(r => r.Value)
            .Concat(User.FindAll("role").Select(r => r.Value))
            .Concat(User.FindAll("roles").Select(r => r.Value))
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim().ToLowerInvariant())
            .ToList();

        bool isAdmin = roleValues.Contains("admin") || roleValues.Contains("administrator");
        bool isSuperUser = roleValues.Contains("superuser") || roleValues.Contains("super_user") || roleValues.Contains("super-user");

        return (isAdmin, isSuperUser, uid);
    }

    // GET /api/Folders?parentId=<guid?>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<FolderVm>>> Get([FromQuery] Guid? parentId)
    {
        var auth = GetAuth();

        var q = _db.Folders.AsNoTracking().AsQueryable();

        // Görüntüleme: admin & superuser tüm klasörleri; user sadece kendi klasörlerini
        if (!(auth.IsAdmin || auth.IsSuperUser))
            q = q.Where(f => f.OwnerId == auth.UserId);

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
        var auth = GetAuth();

        Folder? parent = null;
        if (dto.ParentId.HasValue)
        {
            parent = await _db.Folders.FirstOrDefaultAsync(x => x.Id == dto.ParentId.Value);
            if (parent is null) return NotFound("Parent folder not found.");

            // Başkasının klasörü altına ekleme: admin serbest; super/user kendi klasörü
            if (!(auth.IsAdmin || parent.OwnerId == auth.UserId)) return Forbid();
        }

        var name = dto.Name.Trim();

        var exists = await _db.Folders.AnyAsync(f =>
            f.ParentId == dto.ParentId &&
            f.Name.ToLower() == name.ToLower());
        if (exists) return BadRequest($"'{name}' isimli klasör zaten mevcut.");

        var folder = new Folder
        {
            Name = name,
            ParentId = dto.ParentId,
            OwnerId = auth.UserId,
            Path = parent is null ? $"/{name}" : $"{parent.Path}/{name}",
            Level = parent is null ? 0 : parent.Level + 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Folders.Add(folder);
        await _db.SaveChangesAsync();

        // Tag ekleme (opsiyonel)
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

        var owner = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == auth.UserId);
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

        var auth = GetAuth();

        var folder = await _db.Folders.FirstOrDefaultAsync(f => f.Id == id);
        if (folder is null) return NotFound();

        // Düzenleme: admin herkes; super/user sadece kendi klasörü
        if (!(auth.IsAdmin || folder.OwnerId == auth.UserId)) return Forbid();

        var newName = dto.Name.Trim();

        var exists = await _db.Folders.AnyAsync(f =>
            f.Id != id &&
            f.ParentId == folder.ParentId &&
            f.Name.ToLower() == newName.ToLower()
        );
        if (exists) return BadRequest($"'{newName}' isimli klasör zaten mevcut.");

        var oldPath = folder.Path;
        var lastSlash = oldPath.LastIndexOf('/');
        var parentPath = (lastSlash <= 0) ? "" : oldPath.Substring(0, lastSlash);
        var newPath = string.IsNullOrEmpty(parentPath) ? $"/{newName}" : $"{parentPath}/{newName}";

        folder.Name = newName;
        folder.Path = newPath;
        folder.UpdatedAt = DateTime.UtcNow;

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
        var auth = GetAuth();

        var target = await _db.Folders.FirstOrDefaultAsync(f => f.Id == id);
        if (target is null) return NotFound();

        // Silme: admin herkes; super/user sadece kendi klasörü
        if (!(auth.IsAdmin || target.OwnerId == auth.UserId)) return Forbid();

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
        var auth = GetAuth();

        var folder = await _db.Folders
            .Include(f => f.FolderTags)
            .FirstOrDefaultAsync(f => f.Id == id);
        if (folder is null) return NotFound();

        // Tag düzenleme: admin herkes; super/user sadece kendi klasörü
        if (!(auth.IsAdmin || folder.OwnerId == auth.UserId)) return Forbid();

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
