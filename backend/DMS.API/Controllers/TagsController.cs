using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DMS.API.Data;

namespace DMS.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class TagsController : ControllerBase
    {
        private readonly AppDbContext _db;
        public TagsController(AppDbContext db) => _db = db;

        // Tüm tag'leri listele
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var items = await _db.Tags
                .OrderBy(t => t.Name)
                .Select(t => new { id = t.Id, name = t.Name })
                .ToListAsync();

            return Ok(items);
        }

        // === Otomatik temizlik için STATIC helper ===
        // Her yerden: await TagsController.CleanupUnusedTagsAsync(_db);
        public static async Task CleanupUnusedTagsAsync(AppDbContext db)
        {
            // Hiçbir FolderTag ya da DocumentTag ile eşleşmeyen tüm tag'leri bul
            var unusedTags = await db.Tags
                .Where(t => !db.FolderTags.Any(ft => ft.TagId == t.Id)
                         && !db.DocumentTags.Any(dt => dt.TagId == t.Id))
                .ToListAsync();

            if (unusedTags.Count > 0)
            {
                db.Tags.RemoveRange(unusedTags);
                await db.SaveChangesAsync();
            }
        }
    }
}
