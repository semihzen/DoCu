using Microsoft.AspNetCore.Mvc;
using DMS.API.Data;
using DMS.API.Models;
using Microsoft.AspNetCore.Identity;

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

        [HttpPost("register")]
        public IActionResult Register(UserDto userDto)
        {
            if (_context.Users.Any(u => u.Email == userDto.Email))
            {
                return BadRequest("Bu email adresi zaten kayıtlı.");
            }

            var user = new User
            {
                Name = userDto.Name,
                Email = userDto.Email,
                Role = "User" // varsayılan rol
            };

            user.PasswordHash = _passwordHasher.HashPassword(user, userDto.Password);

            _context.Users.Add(user);
            _context.SaveChanges();

            return Ok(new { message = "Kayıt başarılı." });
        }
    }
}
