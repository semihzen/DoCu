using Microsoft.AspNetCore.Mvc;
using DMS.API.Data;
using DMS.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;

namespace DMS.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IPasswordHasher<User> _passwordHasher;

        public UsersController(AppDbContext context, IPasswordHasher<User> passwordHasher)
        {
            _context = context;
            _passwordHasher = passwordHasher;
        }

        // ====== DTO'lar ======
        public class UserDto
        {
            public string Name { get; set; } = default!;
            public string Email { get; set; } = default!;
            public string Password { get; set; } = default!;
        }

        public class RoleDto
        {
            public string Role { get; set; } = default!;
        }

        // ====== LISTE: GET /api/Users?q=... ======
        // Sadece Admin(veya admin) rolü; admin kullanıcıyı hiç döndürme.
        [HttpGet]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> GetUsers([FromQuery] string? q = null)
        {
            var query = _context.Users
                .AsNoTracking()
                .Where(u =>
                    !(
                        (u.Email ?? "").ToLower() == "admin@admin.com" ||
                        (u.Role  ?? "").ToLower().Contains("admin")     ||
                        (u.Name  ?? "").ToLower() == "admin"
                    )
                );

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim().ToLowerInvariant();
                query = query.Where(u =>
                    (u.Name  ?? string.Empty).ToLower().Contains(term) ||
                    (u.Email ?? string.Empty).ToLower().Contains(term) ||
                    (u.Role  ?? string.Empty).ToLower().Contains(term)
                );
            }

            var list = await query
                .OrderByDescending(u => u.Id)
                .Select(u => new
                {
                    id = u.Id,
                    name = u.Name,
                    email = u.Email,
                    role = u.Role,
                    // createdAt = u.CreatedAt // alan varsa aç
                })
                .ToListAsync();

            return Ok(list);
        }

        // TEK KAYIT: GET /api/Users/{id}
        [HttpGet("{id:int}")]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> GetUserById([FromRoute] int id)
        {
            var u = await _context.Users.AsNoTracking()
                .Where(x => x.Id == id)
                .Select(x => new
                {
                    Id = x.Id,
                    Name = x.Name,
                    Email = x.Email,
                    Role = x.Role,
                })
                .FirstOrDefaultAsync();

            if (u == null) return NotFound("Kullanıcı bulunamadı.");

            // admin ise göstermeyelim
            if ((u.Email ?? "").ToLower() == "admin@admin.com" ||
                (u.Role  ?? "").ToLower().Contains("admin")     ||
                (u.Name  ?? "").ToLower() == "admin")
                return Forbid();

            return Ok(u);
        }

        // ROL GÜNCELLE: PATCH /api/Users/{id}/role
        [HttpPatch("{id:int}/role")]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> UpdateRole([FromRoute] int id, [FromBody] RoleDto body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Role))
                return BadRequest("Rol boş olamaz.");

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var email = (user.Email ?? "").ToLowerInvariant();
            var role  = (user.Role  ?? "").ToLowerInvariant();
            var name  = (user.Name  ?? "").ToLowerInvariant();
            if (email == "admin@admin.com" || role.Contains("admin") || name == "admin")
                return BadRequest("Admin kullanıcının rolü değiştirilemez.");

            user.Role = body.Role.Trim();
            await _context.SaveChangesAsync();

            return Ok(new { id = user.Id, role = user.Role });
        }

        // KULLANICI SİL: DELETE /api/Users/{id}
        [HttpDelete("{id:int}")]
        [Authorize(Roles = "Admin,admin")]
        public async Task<IActionResult> DeleteUser([FromRoute] int id)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var email = (user.Email ?? "").ToLowerInvariant();
            var role  = (user.Role  ?? "").ToLowerInvariant();
            var name  = (user.Name  ?? "").ToLowerInvariant();

            if (email == "admin@admin.com" || role.Contains("admin") || name == "admin")
                return BadRequest("Admin kullanıcı silinemez.");

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // KAYIT: POST /api/Users/register (herkese açık)
        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<IActionResult> Register([FromBody] UserDto userDto)
        {
            var email = (userDto.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(userDto.Password))
                return BadRequest("Email ve şifre zorunludur.");

            if (await _context.Users.AnyAsync(u => (u.Email ?? "").ToLower() == email))
                return BadRequest("Bu email adresi zaten kayıtlı.");

            var role = email == "admin@admin.com" ? "Admin" : "User";

            var user = new User
            {
                Name = userDto.Name?.Trim(),
                Email = email,
                Role = role
            };

            user.PasswordHash = _passwordHasher.HashPassword(user, userDto.Password);

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Kayıt başarılı.",
                user = new { id = user.Id, name = user.Name, email = user.Email, role = user.Role }
            });
        }
    }
}
