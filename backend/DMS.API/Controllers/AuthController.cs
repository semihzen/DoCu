using DMS.API.Data;
using DMS.API.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace DMS.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _config;
        private readonly IPasswordHasher<User> _passwordHasher;

        public AuthController(AppDbContext context, IConfiguration config, IPasswordHasher<User> passwordHasher)
        {
            _context = context;
            _config = config;
            _passwordHasher = passwordHasher;
        }

    [HttpPost("login")]
public IActionResult Login([FromBody] UserDto dto)
{
    var user = _context.Users.SingleOrDefault(u => u.Email == dto.Email);
    if (user == null)
        return Unauthorized("E-posta veya şifre hatalı");

    var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, dto.Password);
    if (result != PasswordVerificationResult.Success)
        return Unauthorized("E-posta veya şifre hatalı");

    // 🔐 JWT Key'i .env'den al
    var jwtKey = Environment.GetEnvironmentVariable("JWT__Key");
    if (string.IsNullOrEmpty(jwtKey))
    {
        Console.WriteLine("⚠️ JWT__Key bulunamadı!");
        return StatusCode(500, "Sunucu yapılandırma hatası (JWT key eksik)");
    }

    // Token oluştur
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Role, user.Role)
    };

    var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

    var token = new JwtSecurityToken(
        issuer: Environment.GetEnvironmentVariable("JWT__Issuer"),
        audience: Environment.GetEnvironmentVariable("JWT__Audience"),
        claims: claims,
        expires: DateTime.Now.AddMinutes(Convert.ToDouble(Environment.GetEnvironmentVariable("JWT__ExpireMinutes"))),
        signingCredentials: creds
    );

    var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

    return Ok(new
    {
        token = tokenString,
        email = user.Email,
        role = user.Role
    });
}

    }
}
