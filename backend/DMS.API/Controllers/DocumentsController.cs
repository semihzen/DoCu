using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using DMS.API.Data;
using DMS.API.Models;
using DMS.API.Controllers;
using System.Linq; // ADDED

// ADDED: Sadece güncellemede kullanılacak DTO
public class DocumentUpdateDto
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public Guid? FolderId { get; set; }
}

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

    // ==== helpers ====
    private bool IsPrivileged() => User.IsAdmin() || User.IsSuperUser();

    // Users.Id INT olduğu için claim'den INT çekiyoruz
    private bool TryGetUserId(out int userId)
    {
        userId = 0;
        var s = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User.FindFirst("sub")?.Value
                ?? User.FindFirst("userId")?.Value;
        return int.TryParse(s, out userId);
    }

    // ADDED: Tek-kayıt arşiv (UPDATE/DELETE öncesi mevcut satırı dbo.Documents_backup_Once'a kopyalar)
  // Her doküman için sadece 1 yedek satır tutar (en güncel "önceki" hâl)
private async Task ArchiveOnceAsync(Document doc)
{
    // 1) Aynı Id için varsa eski yedeği sil
    await _db.Database.ExecuteSqlInterpolatedAsync(
        $"DELETE FROM [dbo].[Documents_backup_Once] WHERE [Id] = {doc.Id};");

    // 2) Mevcut (güncellemeden/ silmeden önceki) hâlini ekle
    await _db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO [dbo].[Documents_backup_Once]
([Id],[Title],[Description],[FileName],[MimeType],[FileSizeBytes],
 [StoragePath],[HashSha256],[FolderId],[OwnerId],[VersionNumber],
 [CreatedAt],[UpdatedAt],[IsArchived])
VALUES
({doc.Id},{doc.Title},{doc.Description},{doc.FileName},{doc.MimeType},{doc.FileSizeBytes},
 {doc.StoragePath},{doc.HashSha256},{doc.FolderId},{doc.OwnerId},{doc.VersionNumber},
 {doc.CreatedAt},{doc.UpdatedAt},{true});");
}


    // GET /api/Documents?scope=all|mine&folderId=&q=&tag=&tagId=
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string scope = "mine",
        [FromQuery] Guid? folderId = null,
        [FromQuery] string? q = null,
        [FromQuery] string? tag = null,
        [FromQuery] Guid? tagId = null)
    {
        TryGetUserId(out var uid);
        var isPrivileged = IsPrivileged();

        var docs = _db.Documents
            .Include(d => d.Folder)
            .Include(d => d.DocumentTags).ThenInclude(dt => dt.Tag)
            .AsQueryable();

        if (!(isPrivileged && scope.Equals("all", StringComparison.OrdinalIgnoreCase)))
            docs = docs.Where(d => d.OwnerId == uid);

        if (folderId.HasValue)
            docs = docs.Where(d => d.FolderId == folderId);
        else
            docs = docs.Where(d => d.FolderId == null); // root görünümü

        if (!string.IsNullOrWhiteSpace(q))
            docs = docs.Where(d => d.Title.Contains(q) || (d.Description ?? "").Contains(q));

        if (tagId.HasValue)
            docs = docs.Where(d => d.DocumentTags.Any(t => t.TagId == tagId));
        else if (!string.IsNullOrWhiteSpace(tag))
            docs = docs.Where(d => d.DocumentTags.Any(t => t.Tag.Name == tag));

        // Owner bilgisi join
        var result = await (
            from d in docs
            join u in _db.Users.AsNoTracking() on d.OwnerId equals u.Id into du
            from u in du.DefaultIfEmpty()
            orderby (d.UpdatedAt ?? d.CreatedAt) descending
            select new
            {
                d.Id,
                Title = d.Title,
                d.Description,
                d.OwnerId,
                OwnerEmail = u != null ? u.Email : null,
                OwnerName  = u != null ? u.Name  : null,
                d.FolderId,
                d.FileName,
                d.MimeType,
                d.FileSizeBytes,
                d.VersionNumber,
                UpdatedAt = d.UpdatedAt,
                tags = d.DocumentTags.Select(t => new { id = t.TagId, name = t.Tag.Name })
            }
        ).ToListAsync();

        return Ok(result);
    }

    // DocumentsController.cs
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DocumentUpdateDto req)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound("Document not found");

        var canEdit = IsPrivileged() || doc.OwnerId == uid;
        if (!canEdit) return Forbid();

        // ADDED: Güncellemeden ÖNCE mevcut halini arşivle
        await ArchiveOnceAsync(doc);

        // Title
        if (!string.IsNullOrWhiteSpace(req.Title))
            doc.Title = req.Title.Trim();

        // Description
        if (req.Description != null)
            doc.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();

        // Folder taşıma (opsiyonel)
        if (req.FolderId.HasValue)
        {
            var folder = await _db.Folders.FindAsync(req.FolderId.Value);
            if (folder is null) return NotFound("Folder not found");
            if (!IsPrivileged() && folder.OwnerId != uid) return Forbid();
            doc.FolderId = folder.Id;
        }

        doc.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { doc.Id, doc.Title, doc.Description, doc.FolderId, doc.UpdatedAt });
    }

    // GET /api/Documents/{id}/download
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        TryGetUserId(out var uid);

        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound("Document not found");

        var canDownload = IsPrivileged() || doc.OwnerId == uid;
        if (!canDownload) return Forbid();

        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploadsRoot = Path.Combine(webRoot, "uploads");

        var candidate = doc.StoragePath ?? string.Empty;
        var fullPath = Path.IsPathRooted(candidate)
            ? candidate
            : Path.Combine(uploadsRoot, candidate);

        if (!System.IO.File.Exists(fullPath))
            return NotFound("File content not found");

        var contentType = string.IsNullOrWhiteSpace(doc.MimeType) ? "application/octet-stream" : doc.MimeType;
        var safeName = string.IsNullOrWhiteSpace(doc.FileName) ? (doc.Title ?? "document") : doc.FileName;

        var stream = System.IO.File.OpenRead(fullPath);
        return File(stream, contentType, fileDownloadName: safeName);
    }

    // POST /api/Documents (upload)
    [HttpPost]
    [RequestSizeLimit(200_000_000)]
    public async Task<IActionResult> Upload(
        [FromForm] string title,
        [FromForm] IFormFile file,
        [FromForm] Guid? folderId,
        [FromForm] string? description,
        [FromForm] List<Guid>? tagIds,
        [FromForm] List<string>? tags)
    {
        if (file == null || file.Length == 0) return BadRequest("File is required.");
        if (string.IsNullOrWhiteSpace(title)) return BadRequest("Title is required.");
        if (!TryGetUserId(out var uid)) return Forbid();

        Folder? folder = null;
        if (folderId.HasValue)
        {
            folder = await _db.Folders.FindAsync(folderId.Value);
            if (folder is null) return NotFound("Folder not found");
            if (!IsPrivileged() && folder.OwnerId != uid) return Forbid();
        }

        var (pathOnDisk, storedFileName, sha) = await SaveFileAsync(file);

        var doc = new Document
        {
            Title = title.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description!.Trim(),
            FolderId = folder?.Id,
            OwnerId = uid,
            FileName = file.FileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSizeBytes = file.Length,
            StoragePath = storedFileName, // sadece dosya adı
            HashSha256 = sha,
            VersionNumber = 1,
            CreatedAt = DateTime.UtcNow
        };
        _db.Documents.Add(doc);

        _db.DocumentVersions.Add(new DocumentVersion
        {
            Document = doc,
            VersionNumber = 1,
            StoragePath = storedFileName,
            FileName = file.FileName,
            MimeType = doc.MimeType,
            FileSizeBytes = file.Length,
            HashSha256 = sha,
            CreatedBy = uid,
            CreatedAt = DateTime.UtcNow
        });

        if (tagIds is { Count: > 0 })
        {
            foreach (var id in tagIds.Distinct())
                _db.DocumentTags.Add(new DocumentTag { Document = doc, TagId = id });
        }
        else if (tags is { Count: > 0 })
        {
            foreach (var name in tags.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).Distinct())
            {
                var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Name == name)
                          ?? _db.Tags.Add(new Tag { Name = name }).Entity;
                _db.DocumentTags.Add(new DocumentTag { Document = doc, Tag = tag });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new { doc.Id, doc.Title, doc.VersionNumber });
    }

    // POST /api/Documents/{id}/versions
    [HttpPost("{id:guid}/versions")]
    public async Task<IActionResult> AddVersion(Guid id, IFormFile file)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var doc = await _db.Documents.Include(d => d.Folder).FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        var canEdit = IsPrivileged() || doc.OwnerId == uid;
        if (!canEdit) return Forbid();

        var (pathOnDisk, storedFileName, sha) = await SaveFileAsync(file);
        var newVer = doc.VersionNumber + 1;

        _db.DocumentVersions.Add(new DocumentVersion
        {
            DocumentId = doc.Id,
            VersionNumber = newVer,
            StoragePath = storedFileName,
            FileName = file.FileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSizeBytes = file.Length,
            HashSha256 = sha,
            CreatedBy = uid,
            CreatedAt = DateTime.UtcNow
        });

        doc.VersionNumber = newVer;
        doc.StoragePath = storedFileName;
        doc.FileName = file.FileName;
        doc.MimeType = file.ContentType ?? "application/octet-stream";
        doc.FileSizeBytes = file.Length;
        doc.HashSha256 = sha;
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new { doc.Id, doc.VersionNumber });
    }

    // POST /api/Documents/{id}/tags
    [HttpPost("{id:guid}/tags")]
    public async Task<IActionResult> SetTags(Guid id, [FromBody] List<string> tagNames)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var doc = await _db.Documents
            .Include(d => d.DocumentTags)
            .FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        var canEdit = IsPrivileged() || doc.OwnerId == uid;
        if (!canEdit) return Forbid();

        _db.DocumentTags.RemoveRange(doc.DocumentTags);

        foreach (var name in tagNames.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).Distinct())
        {
            var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Name == name)
                      ?? _db.Tags.Add(new Tag { Name = name }).Entity;
            _db.DocumentTags.Add(new DocumentTag { DocumentId = doc.Id, Tag = tag });
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    // DELETE /api/Documents/{id}  ✅ DOKÜMAN SİL (DB + dosya)
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetUserId(out var uid)) return Forbid();

        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        var canDelete = IsPrivileged() || doc.OwnerId == uid;
        if (!canDelete) return Forbid();

        // ADDED: Silmeden ÖNCE mevcut halini arşivle
        await ArchiveOnceAsync(doc);

        // Dosyayı wwwroot/uploads'tan da sil
        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploadsRoot = Path.Combine(webRoot, "uploads");
        var candidate = doc.StoragePath ?? string.Empty;
        var fullPath = Path.IsPathRooted(candidate) ? candidate : Path.Combine(uploadsRoot, candidate);

        try
        {
            if (System.IO.File.Exists(fullPath))
                System.IO.File.Delete(fullPath);
        }
        catch
        {
            // isteğe bağlı: logla
        }

        _db.Documents.Remove(doc); // FK ile versions/tags da gider
        await _db.SaveChangesAsync();
        await TagsController.CleanupUnusedTagsAsync(_db);
        return NoContent();
    }

    // --- file save helper ---
    private async Task<(string pathOnDisk, string storedFileName, string sha256)> SaveFileAsync(IFormFile file)
    {
        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var root = Path.Combine(webRoot, "uploads");
        Directory.CreateDirectory(root);

        var ext = Path.GetExtension(file.FileName);
        var stored = $"{Guid.NewGuid():N}{ext}";
        var full = Path.Combine(root, stored);

        using (var fs = System.IO.File.Create(full))
            await file.CopyToAsync(fs);

        using var stream = System.IO.File.OpenRead(full);
        using var sha = SHA256.Create();
        var hash = Convert.ToHexString(sha.ComputeHash(stream));

        return (full, stored, hash);
    }
}
