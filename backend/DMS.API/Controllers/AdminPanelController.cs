using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DMS.API.Data;
using DMS.API.Models; // User, Document, Folder, DocumentBackupOnce, AdminPanelDtos

namespace DMS.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize] // gerekirse kaldır/özelleştir
    public class AdminPanelController : ControllerBase
    {
        private readonly AppDbContext _db;

        public AdminPanelController(AppDbContext db)
        {
            _db = db;
        }

        // GET: /api/adminpanel/stats
        [HttpGet("stats")]
        public async Task<ActionResult<AdminStatsDto>> GetStats(CancellationToken ct)
        {
            // admin hariç kullanıcı sayısı
            var usersExAdmin = await _db.Users.AsNoTracking().CountAsync(u =>
                !((u.Role ?? "").ToLower().Contains("admin")
                  || (u.Name ?? "").ToLower() == "admin"
                  || (u.Email ?? "").ToLower().StartsWith("admin")), ct);

            // superuser sayısı
            var superUsers = await _db.Users.AsNoTracking()
                                .CountAsync(u => (u.Role ?? "").ToLower().Contains("super"), ct);

            // toplam doküman (Documents tablosu)
            var totalDocs = await _db.Documents.AsNoTracking().CountAsync(ct);

            // toplam klasör
            var totalFolders = await _db.Folders.AsNoTracking().CountAsync(ct);

            // Documents_backup_Once tablosunda KAÇ FARKLI Id varsa onu say
            var backupArchived = await _db.Set<DocumentBackupOnce>()
                                          .AsNoTracking()
                                          .Select(b => b.Id)     // Guid/string/int fark etmez
                                          .Distinct()
                                          .CountAsync(ct);

            var dto = new AdminStatsDto
            {
                UsersExAdmin   = usersExAdmin,
                SuperUsers     = superUsers,
                TotalDocs      = totalDocs,
                TotalFolders   = totalFolders,
                BackupArchived = backupArchived // artık distinct Id sayısı
            };

            return Ok(dto);
        }
    }
}
