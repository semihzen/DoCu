// AdminPanelController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DMS.API.Data;
using DMS.API.Models; // User, DocumentBackupOnce, AdminPanelDtos

namespace DMS.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // sadece login şart; rol kontrolünü içeride yapacağız
    public class AdminPanelController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IWebHostEnvironment _env;

        public AdminPanelController(AppDbContext db, IWebHostEnvironment env)
        {
            _db = db;
            _env = env;
        }

        // ---- helpers --------------------------------------------------------
        private static string GetRole(ClaimsPrincipal user)
        {
            // Birçok olası claim tipine bakıyoruz ve küçük harfe indiriyoruz
            var r =
                user.FindFirst(ClaimTypes.Role)?.Value ??
                user.FindFirst("role")?.Value ??
                user.FindFirst("roles")?.Value ??
                user.FindFirst("http://schemas.microsoft.com/ws/2008/06/identity/claims/role")?.Value ??
                "";
            return r?.Trim()?.ToLowerInvariant() ?? "";
        }

        private static bool IsPrivileged(ClaimsPrincipal user)
        {
            var role = GetRole(user);
            return role == "admin" || role == "superuser";
        }

        private string UploadsRoot()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
            var uploads = Path.Combine(webRoot, "uploads");
            Directory.CreateDirectory(uploads);
            return uploads;
        }

        // GET: /api/AdminPanel/stats
        [HttpGet("stats")]
        public async Task<ActionResult<AdminStatsDto>> GetStats(CancellationToken ct)
        {
            if (!IsPrivileged(User)) return Forbid();

            var usersExAdmin = await _db.Users.AsNoTracking().CountAsync(u =>
                !((u.Role ?? "").ToLower().Contains("admin")
                  || (u.Name ?? "").ToLower() == "admin"
                  || (u.Email ?? "").ToLower().StartsWith("admin")), ct);

            var superUsers   = await _db.Users.AsNoTracking()
                                   .CountAsync(u => (u.Role ?? "").ToLower().Contains("super"), ct);

            var totalDocs    = await _db.Documents.AsNoTracking().CountAsync(ct);
            var totalFolders = await _db.Folders.AsNoTracking().CountAsync(ct);

            // yedek tabloda tekil Id adedi
            var backupArchived = await _db.Set<DocumentBackupOnce>()
                                          .AsNoTracking()
                                          .Select(b => b.Id)
                                          .Distinct()
                                          .CountAsync(ct);

            return Ok(new AdminStatsDto
            {
                UsersExAdmin   = usersExAdmin,
                SuperUsers     = superUsers,
                TotalDocs      = totalDocs,
                TotalFolders   = totalFolders,
                BackupArchived = backupArchived
            });
        }

        // GET: /api/AdminPanel/archived-docs?folderId=<guid|null>
        [HttpGet("archived-docs")]
        public async Task<IActionResult> GetArchivedDocs([FromQuery] Guid? folderId = null)
        {
            if (!IsPrivileged(User)) return Forbid();

            var q = _db.Set<DocumentBackupOnce>().AsNoTracking().AsQueryable();
            q = folderId.HasValue ? q.Where(b => b.FolderId == folderId)
                                  : q.Where(b => b.FolderId == null); // root görünümü

            var list = await (
                from b in q
                join u in _db.Users.AsNoTracking() on b.OwnerId equals u.Id into bu
                from u in bu.DefaultIfEmpty()
                orderby (b.UpdatedAt ?? b.CreatedAt) descending
                select new
                {
                    b.Id,
                    Title = b.Title,
                    b.Description,
                    b.OwnerId,
                    OwnerEmail = u != null ? u.Email : null,
                    OwnerName  = u != null ? u.Name  : null,
                    b.FolderId,
                    b.FileName,
                    b.MimeType,
                    b.FileSizeBytes,
                    b.VersionNumber,
                    UpdatedAt = b.UpdatedAt,
                    CreatedAt = b.CreatedAt
                    // İsterseniz burada tag bilgisi de eklenebilir; backup tabloya bağlı değilse boş bırakın.
                }
            ).ToListAsync();

            return Ok(list);
        }

        // (Opsiyonel) İndir: /api/AdminPanel/archived-docs/{id}/download
        [HttpGet("archived-docs/{id:guid}/download")]
        public async Task<IActionResult> DownloadArchived(Guid id)
        {
            if (!IsPrivileged(User)) return Forbid();

            var b = await _db.Set<DocumentBackupOnce>().AsNoTracking()
                             .FirstOrDefaultAsync(x => x.Id == id);
            if (b is null) return NotFound("Archive row not found.");

            var full = Path.IsPathRooted(b.StoragePath ?? "")
                ? b.StoragePath!
                : Path.Combine(UploadsRoot(), b.StoragePath ?? "");

            if (!System.IO.File.Exists(full)) return NotFound("File content not found.");

            var name = string.IsNullOrWhiteSpace(b.FileName) ? (b.Title ?? "document") : b.FileName;
            var mime = string.IsNullOrWhiteSpace(b.MimeType) ? "application/octet-stream" : b.MimeType;

            var stream = System.IO.File.OpenRead(full);
            return File(stream, mime, fileDownloadName: name);
        }
    }
}
