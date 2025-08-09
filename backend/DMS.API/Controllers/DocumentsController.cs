using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using DMS.API.Data;
using DMS.API.Models;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    public DocumentsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db; _env = env;
    }

    // Liste: Admin/SU tümü; User sadece kendi klasörleri
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? folderId, [FromQuery] string? q, [FromQuery] string? tag)
    {
        var uid = User.GetUserId();
        var isAll = User.IsAdmin() || User.IsSuperUser();

        var docs = _db.Documents
            .Include(d => d.Folder)
            .Include(d => d.DocumentTags).ThenInclude(dt => dt.Tag)
            .AsQueryable();

        if (!isAll) docs = docs.Where(d => d.Folder.OwnerId == uid);
        if (folderId.HasValue) docs = docs.Where(d => d.FolderId == folderId);
        if (!string.IsNullOrWhiteSpace(q))
            docs = docs.Where(d => d.Title.Contains(q) || (d.Description ?? "").Contains(q));
        if (!string.IsNullOrWhiteSpace(tag))
            docs = docs.Where(d => d.DocumentTags.Any(t => t.Tag.Name == tag));

        var result = await docs
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new {
                d.Id, d.Title, d.VersionNumber, d.FileName, d.MimeType, d.FileSizeBytes,
                Folder = d.Folder.Name,
                Tags = d.DocumentTags.Select(t => t.Tag.Name)
            })
            .ToListAsync();

        return Ok(result);
    }

    // Yükleme (etiketlerle)
    [HttpPost]
    [RequestSizeLimit(200_000_000)] // 200MB örnek
    public async Task<IActionResult> Upload([FromForm] CreateDocumentDto dto, IFormFile file)
    {
        var uid = User.GetUserId();

        var folder = await _db.Folders.FindAsync(dto.FolderId);
        if (folder is null) return NotFound("Folder not found");

        if (!User.IsAdmin() && !User.IsSuperUser() && folder.OwnerId != uid)
            return Forbid();

        var (pathOnDisk, storedFileName, sha) = await SaveFileAsync(file);

        var doc = new Document
        {
            Title = dto.Title,
            Description = dto.Description,
            FolderId = folder.Id,
            OwnerId = uid,
            FileName = file.FileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSizeBytes = file.Length,
            StoragePath = pathOnDisk,
            HashSha256 = sha,
            VersionNumber = 1
        };
        _db.Documents.Add(doc);

        // Version 1
        _db.DocumentVersions.Add(new DocumentVersion
        {
            Document = doc,
            VersionNumber = 1,
            StoragePath = pathOnDisk,
            FileName = file.FileName,
            MimeType = doc.MimeType,
            FileSizeBytes = file.Length,
            HashSha256 = sha,
            CreatedBy = uid
        });

        // Etiketler
        if (dto.Tags is { Count: > 0 })
        {
            foreach (var name in dto.Tags.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()))
            {
                var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Name == name)
                          ?? _db.Tags.Add(new Tag { Name = name }).Entity;
                _db.DocumentTags.Add(new DocumentTag { Document = doc, Tag = tag });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { doc.Id, doc.Title, doc.VersionNumber });
    }

    // Yeni sürüm ekle
    [HttpPost("{id:guid}/versions")]
    public async Task<IActionResult> AddVersion(Guid id, IFormFile file)
    {
        var uid = User.GetUserId();
        var doc = await _db.Documents.Include(d => d.Folder).FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        var canEditOwn = User.IsAdmin() || doc.Folder.OwnerId == uid;
        if (!canEditOwn) return Forbid();

        var (pathOnDisk, storedFileName, sha) = await SaveFileAsync(file);
        var newVer = doc.VersionNumber + 1;

        _db.DocumentVersions.Add(new DocumentVersion
        {
            DocumentId = doc.Id,
            VersionNumber = newVer,
            StoragePath = pathOnDisk,
            FileName = file.FileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSizeBytes = file.Length,
            HashSha256 = sha,
            CreatedBy = uid
        });

        doc.VersionNumber = newVer;
        doc.StoragePath = pathOnDisk;
        doc.FileName = file.FileName;
        doc.MimeType = file.ContentType ?? "application/octet-stream";
        doc.FileSizeBytes = file.Length;
        doc.HashSha256 = sha;
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { doc.Id, doc.VersionNumber });
    }

    // Etiket ekle/çıkar
    [HttpPost("{id:guid}/tags")]
    public async Task<IActionResult> SetTags(Guid id, [FromBody] List<string> tags)
    {
        var uid = User.GetUserId();
        var doc = await _db.Documents.Include(d => d.Folder).Include(d => d.DocumentTags)
                                     .FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();
        if (!User.IsAdmin() && doc.Folder.OwnerId != uid) return Forbid();

        // mevcutları kaldır
        _db.DocumentTags.RemoveRange(doc.DocumentTags);

        // yenileri ekle
        foreach (var name in tags.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()))
        {
            var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Name == name)
                      ?? _db.Tags.Add(new Tag { Name = name }).Entity;
            _db.DocumentTags.Add(new DocumentTag { DocumentId = doc.Id, Tag = tag });
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Sil
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var uid = User.GetUserId();
        var doc = await _db.Documents.Include(d => d.Folder).FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();
        if (!User.IsAdmin() && doc.Folder.OwnerId != uid) return Forbid();

        // ilişkileri EF halleder (DocumentTags/Versions)
        _db.Documents.Remove(doc);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // --- yardımcı ---
    private async Task<(string pathOnDisk, string storedFileName, string sha256)> SaveFileAsync(IFormFile file)
    {
        var root = Path.Combine(_env.ContentRootPath, "wwwroot", "uploads");
        Directory.CreateDirectory(root);

        var ext = Path.GetExtension(file.FileName);
        var stored = $"{Guid.NewGuid():N}{ext}";
        var full = Path.Combine(root, stored);

        using (var fs = System.IO.File.Create(full))
        {
            await file.CopyToAsync(fs);
        }

        using var stream = System.IO.File.OpenRead(full);
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(stream));

        // StoragePath'e tam disk yolu yazdım; istersen /uploads/{stored} şeklinde göreli yaz.
        return (full, stored, hash);
    }
}
