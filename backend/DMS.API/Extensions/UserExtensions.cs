using System.Security.Claims;

public static class UserExtensions
{
    public static int GetUserId(this ClaimsPrincipal user)
        => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!); // JWT'de sub/NameIdentifier

    public static bool IsAdmin(this ClaimsPrincipal user) => user.IsInRole("Admin");
    public static bool IsSuperUser(this ClaimsPrincipal user) => user.IsInRole("SuperUser");
}
