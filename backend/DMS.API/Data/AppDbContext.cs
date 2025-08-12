using DMS.API.Models;
using Microsoft.EntityFrameworkCore;

namespace DMS.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<User> Users => Set<User>();
        public DbSet<Folder> Folders => Set<Folder>();
        public DbSet<Document> Documents => Set<Document>();
        public DbSet<DocumentBackupOnce> DocumentBackupOnce => Set<DocumentBackupOnce>();
        public DbSet<DocumentVersion> DocumentVersions => Set<DocumentVersion>();
        public DbSet<Tag> Tags => Set<Tag>();
        public DbSet<DocumentTag> DocumentTags => Set<DocumentTag>();
        public DbSet<FolderTag> FolderTags => Set<FolderTag>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder b)
        {
            base.OnModelCreating(b);

            // ===== FOLDER =====
            b.Entity<Folder>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Name).HasMaxLength(128).IsRequired();
                e.Property(x => x.Path).HasMaxLength(1024);
                e.HasIndex(x => x.Path);
                e.HasIndex(x => x.Level);
                e.HasIndex(x => new { x.ParentId, x.Name }).IsUnique();

                e.HasOne(x => x.Parent)
                 .WithMany(x => x.Children)
                 .HasForeignKey(x => x.ParentId)
                 .OnDelete(DeleteBehavior.Restrict);
            });

            // ===== DOCUMENT =====
            b.Entity<Document>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Title).HasMaxLength(256).IsRequired();
                e.Property(x => x.FileName).HasMaxLength(260).IsRequired();
                e.Property(x => x.MimeType).HasMaxLength(128).IsRequired();
                e.Property(x => x.StoragePath).HasMaxLength(512);
                e.HasIndex(x => x.Title);

                e.HasOne(x => x.Folder)
                 .WithMany(f => f.Documents)
                 .HasForeignKey(x => x.FolderId)
                 .IsRequired(false)
                 .OnDelete(DeleteBehavior.Restrict);
            });

            // ===== DOCUMENT VERSION =====
            b.Entity<DocumentVersion>(e =>
            {
                e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.DocumentId, x.VersionNumber }).IsUnique();

                e.HasOne(x => x.Document)
                 .WithMany(d => d.Versions)
                 .HasForeignKey(x => x.DocumentId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            // ===== TAG =====
            b.Entity<Tag>(e =>
            {
                e.HasKey(x => x.Id);
                e.Property(x => x.Name).HasMaxLength(64).IsRequired();
                e.HasIndex(x => x.Name).IsUnique();
            });

            // ===== DOCUMENT–TAG (N:N) =====
            b.Entity<DocumentTag>(e =>
            {
                e.HasKey(x => new { x.DocumentId, x.TagId });

                e.HasOne(dt => dt.Document)
                 .WithMany(d => d.DocumentTags)
                 .HasForeignKey(dt => dt.DocumentId)
                 .OnDelete(DeleteBehavior.Cascade);

                e.HasOne(dt => dt.Tag)
                 .WithMany(t => t.DocumentTags)
                 .HasForeignKey(dt => dt.TagId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            // ===== FOLDER–TAG (N:N)  <<< ÖNEMLİ: TagId1 sorununu çözer
            b.Entity<FolderTag>(e =>
            {
                e.HasKey(x => new { x.FolderId, x.TagId });

                e.HasOne(x => x.Folder)
                 .WithMany(f => f.FolderTags)
                 .HasForeignKey(x => x.FolderId)
                 .OnDelete(DeleteBehavior.Cascade);

                e.HasOne(x => x.Tag)
                 .WithMany(t => t.FolderTags)
                 .HasForeignKey(x => x.TagId)
                 .OnDelete(DeleteBehavior.Cascade);
            });

            // ===== AUDIT LOG =====
            b.Entity<AuditLog>(e =>
            {
                e.HasKey(x => x.Id);
                e.HasIndex(x => new { x.UserId, x.CreatedAt });
                e.Property(x => x.Action).HasMaxLength(64).IsRequired();
            });
        }
    }
}
