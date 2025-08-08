using Microsoft.EntityFrameworkCore;
using DMS.API.Models; // Eğer User.cs buradaysa

namespace DMS.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
    }
}
