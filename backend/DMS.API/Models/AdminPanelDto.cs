namespace DMS.API.Models
{
    public class AdminStatsDto
    {
        public int UsersExAdmin   { get; set; } // admin hariç kullanıcı
        public int SuperUsers     { get; set; } // role 'super' içeren
        public int TotalDocs      { get; set; } // Documents toplam
        public int TotalFolders   { get; set; } // Folders toplam
        public int BackupArchived { get; set; } // Documents_backup_Once archived=true
    }
}
