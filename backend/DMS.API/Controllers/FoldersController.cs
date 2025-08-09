using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using DMS.API.Data;
using DMS.API.Models;

using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FoldersController : ControllerBase
{
    private readonly AppDbContext _db;
    public FoldersController(AppDbContext db) => _db = db;

    // Listeleme: Admin/SuperUser tümü, User sadece kendi
    [HttpGet]
    public async Task<ActionResult<IEnumerable<FolderVm>>> Get([FromQuery] Guid? parentId)
    {
        var uid = User.GetUserId();
        var isAll = User.IsAdmin() || User.IsSuperUser();

        var q = _db.Folders.AsNoTracking().AsQueryable();
        if (!isAll) q = q.Where(f => f.OwnerId == uid);
        if (parentId.HasValue) q = q.Where(f => f.ParentId == parentId);

        var list = await q.OrderBy(f => f.Name)
            .Select(f => new FolderVm(f.Id, f.Name, f.ParentId, f.Path, f.Level))
            .ToListAsync();

        return Ok(list);
    }

    // Oluştur
    [HttpPost]
    public async Task<ActionResult<FolderVm>> Create([FromBody] CreateFolderDto dto)
    {
        var uid = User.GetUserId();
        Folder? parent = null;

        if (dto.ParentId.HasValue)
        {
            parent = await _db.Folders.FindAsync(dto.ParentId.Value)
                ?? throw new Exception("Parent folder not found");

            // User ise sadece kendi klasörüne ekleyebilir
            if (!User.IsAdmin() && !User.IsSuperUser() && parent.OwnerId != uid)
                return Forbid();
        }

        var folder = new Folder
        {
            Name = dto.Name.Trim(),
            ParentId = parent?.Id,
            OwnerId = parent?.OwnerId ?? uid, // kök oluşturuyorsa sahibi kendisi
            Path = parent is null ? $"/{dto.Name}" : $"{parent.Path}/{dto.Name}",
            Level = parent is null ? 0 : parent.Level + 1
        };

        _db.Folders.Add(folder);
        await _db.SaveChangesAsync();

        return Ok(new FolderVm(folder.Id, folder.Name, folder.ParentId, folder.Path, folder.Level));
    }

    // Sil (alt ağaç + dokümanlar)
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var uid = User.GetUserId();
        var target = await _db.Folders.FirstOrDefaultAsync(f => f.Id == id);
        if (target is null) return NotFound();

        if (!User.IsAdmin() && target.OwnerId != uid) return Forbid();

        // Alt ağaç: Path ile başlıyorsa aynı ağaç
        var tree = await _db.Folders.Where(f => f.Path.StartsWith(target.Path)).ToListAsync();

        // Önce doküman ve ilişkileri
        var treeIds = tree.Select(f => f.Id).ToList();
        var docs = await _db.Documents.Where(d => treeIds.Contains(d.FolderId)).ToListAsync();

        var docIds = docs.Select(d => d.Id).ToList();
        _db.DocumentTags.RemoveRange(_db.DocumentTags.Where(x => docIds.Contains(x.DocumentId)));
        _db.DocumentVersions.RemoveRange(_db.DocumentVersions.Where(x => docIds.Contains(x.DocumentId)));
        _db.Documents.RemoveRange(docs);

        // Sonra klasörler
        _db.Folders.RemoveRange(tree);

        await _db.SaveChangesAsync();
        return NoContent();
    }
}
