using DMS.API.Data;
using DMS.API.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;

// .env yükle (opsiyonel)
DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Ortam değişkenlerini de oku
builder.Configuration.AddEnvironmentVariables();

// ================== Services ==================

// CORS (React için)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalhost3000", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// DbContext
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Şifre hashleme (mevcut Users tablonla uyumlu)
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();

// Dosya upload limitleri (isteğe göre artır/azalt)
builder.Services.Configure<FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = 200_000_000; // 200 MB
    o.BufferBodyLengthLimit = 200_000_000;
});

// JWT Authentication
var jwtIssuer   = builder.Configuration["JWT:Issuer"];
var jwtAudience = builder.Configuration["JWT:Audience"];
var jwtKey      = builder.Configuration["JWT:Key"];

if (!string.IsNullOrWhiteSpace(jwtIssuer) &&
    !string.IsNullOrWhiteSpace(jwtAudience) &&
    !string.IsNullOrWhiteSpace(jwtKey))
{
    var keyBytes = Encoding.UTF8.GetBytes(jwtKey);

    builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false; // dev için; prod'da true yap
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });

    // (İstersen rol politikalarını da açarsın)
    builder.Services.AddAuthorization();
}
else
{
    // JWT ayarlanmamışsa en azından Authorization servislerini ekleyelim
    builder.Services.AddAuthorization();
}

// Controllers
builder.Services.AddControllers();

// Swagger + JWT şeması
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    // Basit JWT şeması (Swagger'da Authorize butonu için)
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "JWT token'ı 'Bearer {token}' formatında girin."
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// ================== Middleware ==================

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// HTTPS
app.UseHttpsRedirection();

// Static files (upload edilenleri servis et)
var uploadsRoot = Path.Combine(app.Environment.ContentRootPath, "wwwroot", "uploads");
Directory.CreateDirectory(uploadsRoot);
app.UseStaticFiles(); // wwwroot/* için

// CORS (Auth'tan önce bile olur, önemli olan MapControllers'tan önce olması)
app.UseCors("AllowLocalhost3000");

// Auth
app.UseAuthentication(); // JWT varsa çalışır; yoksa no-op
app.UseAuthorization();

// API endpoints
app.MapControllers();

app.Run();
