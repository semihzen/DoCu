using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using DMS.API.Data;
using DMS.API.Models;
using DMS.API.Controllers;
using System.Linq;

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

    // ==== auth helpers ====
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

    // Tek-kayıt arşiv (UPDATE/DELETE öncesi)
    private async Task ArchiveOnceAsync(Document doc)
    {
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $"DELETE FROM [dbo].[Documents_backup_Once] WHERE [Id] = {doc.Id};");

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
        var auth = GetAuth();
        bool canViewAll = auth.IsAdmin || auth.IsSuperUser;

        var docs = _db.Documents
            .Include(d => d.Folder)
            .Include(d => d.DocumentTags).ThenInclude(dt => dt.Tag)
            .AsQueryable();

        // Görünürlük: admin/superuser -> tümü, user -> sadece kendi
        if (!canViewAll)
            docs = docs.Where(d => d.OwnerId == auth.UserId);

        // Klasör filtresi
        if (folderId.HasValue)
            docs = docs.Where(d => d.FolderId == folderId);
        else
            docs = docs.Where(d => d.FolderId == null); // root görünümü

        // Arama
        if (!string.IsNullOrWhiteSpace(q))
            docs = docs.Where(d => d.Title.Contains(q) || (d.Description ?? "").Contains(q));

        if (tagId.HasValue)
            docs = docs.Where(d => d.DocumentTags.Any(t => t.TagId == tagId));
        else if (!string.IsNullOrWhiteSpace(tag))
            docs = docs.Where(d => d.DocumentTags.Any(t => t.Tag.Name == tag));

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

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DocumentUpdateDto req)
    {
        var auth = GetAuth();
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound("Document not found");

        // 🔐 Admin herkesi düzenler, SuperUser SADECE kendi dokümanını düzenler
        var canEdit = auth.IsAdmin || doc.OwnerId == auth.UserId;
        if (!canEdit) return Forbid();

        await ArchiveOnceAsync(doc);

        if (!string.IsNullOrWhiteSpace(req.Title))
            doc.Title = req.Title.Trim();

        if (req.Description != null)
            doc.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();

        if (req.FolderId.HasValue)
        {
            var folder = await _db.Folders.FindAsync(req.FolderId.Value);
            if (folder is null) return NotFound("Folder not found");

            // Kendi olmayan klasöre taşıma: admin serbest; super/user sadece kendi klasörüne
            if (!(auth.IsAdmin || folder.OwnerId == auth.UserId)) return Forbid();

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
        var auth = GetAuth();
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound("Document not found");

        // Görüntüleme/indirme: admin & superuser & owner
        var canDownload = (auth.IsAdmin || auth.IsSuperUser) || doc.OwnerId == auth.UserId;
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

        var auth = GetAuth();

        Folder? folder = null;
        if (folderId.HasValue)
        {
            folder = await _db.Folders.FindAsync(folderId.Value);
            if (folder is null) return NotFound("Folder not found");

            // Kendi olmayan klasöre yükleme: admin serbest; super/user kendi klasörü
            if (!(auth.IsAdmin || folder.OwnerId == auth.UserId)) return Forbid();
        }

        var (pathOnDisk, storedFileName, sha) = await SaveFileAsync(file);

        var doc = new Document
        {
            Title = title.Trim(),
            Description = string.IsNullOrWhiteSpace(description) ? null : description!.Trim(),
            FolderId = folder?.Id,
            OwnerId = auth.UserId,
            FileName = file.FileName,
            MimeType = file.ContentType ?? "application/octet-stream",
            FileSizeBytes = file.Length,
            StoragePath = storedFileName,
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
            CreatedBy = auth.UserId,
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
        var auth = GetAuth();

        var doc = await _db.Documents.Include(d => d.Folder).FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        // 🔐 Admin herkesi, SuperUser sadece kendi dokümanını güncelleyebilir
        var canEdit = auth.IsAdmin || doc.OwnerId == auth.UserId;
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
            CreatedBy = auth.UserId,
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
        var auth = GetAuth();

        var doc = await _db.Documents
            .Include(d => d.DocumentTags)
            .FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        // 🔐 Admin herkesi, SuperUser sadece kendi dokümanını etiketleyebilir
        var canEdit = auth.IsAdmin || doc.OwnerId == auth.UserId;
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

    // DELETE /api/Documents/{id}
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var auth = GetAuth();

        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        // 🔐 Admin herkesi, SuperUser sadece kendi dokümanını silebilir
        var canDelete = auth.IsAdmin || doc.OwnerId == auth.UserId;
        if (!canDelete) return Forbid();

        await ArchiveOnceAsync(doc);

        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploadsRoot = Path.Combine(webRoot, "uploads");
        var candidate = doc.StoragePath ?? string.Empty;
        var fullPath = Path.IsPathRooted(candidate) ? candidate : Path.Combine(uploadsRoot, candidate);

        try
        {
            if (System.IO.File.Exists(fullPath))
                System.IO.File.Delete(fullPath);
        }
        catch { /* loglanabilir */ }

        _db.Documents.Remove(doc);
        await _db.SaveChangesAsync();
        await TagsController.CleanupUnusedTagsAsync(_db);
        return NoContent();
    }

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
