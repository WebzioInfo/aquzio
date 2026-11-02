using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Serilog;
using Aquora.API.Authorization;
using Aquora.API.Middleware;
using Aquora.API.Hubs;
using Aquora.Application;
using Aquora.Application.Interfaces;
using Aquora.Infrastructure;
using Aquora.Persistence;
using Aquora.Persistence.Context;
using Aquora.Domain.Entities;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// Production-grade .env & Environment Variable Loader
LoadEnvironmentVariables(builder);
// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .CreateLogger();

builder.Host.UseSerilog();

// Read and validate connection string
var rawConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrEmpty(rawConnectionString))
{
    throw new InvalidOperationException("DefaultConnection connection string is missing from configuration.");
}

var connBuilder = new Npgsql.NpgsqlConnectionStringBuilder(rawConnectionString);

if (string.IsNullOrEmpty(connBuilder.Host)) throw new InvalidOperationException("Database Host is missing in connection string.");
if (string.IsNullOrEmpty(connBuilder.Database)) throw new InvalidOperationException("Database Name is missing in connection string.");
if (string.IsNullOrEmpty(connBuilder.Username)) throw new InvalidOperationException("Database Username is missing in connection string.");
if (string.IsNullOrEmpty(connBuilder.Password)) throw new InvalidOperationException("Database Password is missing in connection string.");

var validatedConnString = connBuilder.ConnectionString;
builder.Configuration["ConnectionStrings:DefaultConnection"] = validatedConnString;

// Determine configuration source
string? configSource = null;
if (builder.Configuration is IConfigurationRoot root)
{
    foreach (var provider in root.Providers)
    {
        if (provider.TryGet("ConnectionStrings:DefaultConnection", out _))
        {
            configSource = provider.ToString();
        }
    }
}

configSource ??= "Unknown";

// Log runtime diagnostics (Phase 3)
var maskedBuilder = new Npgsql.NpgsqlConnectionStringBuilder(validatedConnString);
maskedBuilder.Password = "********";
var maskedConnectionString = maskedBuilder.ConnectionString;

// Check files on disk
var appsettingsExists = System.IO.File.Exists(System.IO.Path.Combine(AppContext.BaseDirectory, "appsettings.json")) || System.IO.File.Exists(System.IO.Path.Combine(builder.Environment.ContentRootPath, "appsettings.json"));
var appsettingsDevExists = System.IO.File.Exists(System.IO.Path.Combine(AppContext.BaseDirectory, "appsettings.Development.json")) || System.IO.File.Exists(System.IO.Path.Combine(builder.Environment.ContentRootPath, "appsettings.Development.json"));

Log.Information("--------------------------------------------------");
Log.Information("PHASE 3: Application Startup Connection Audit Details:");
Log.Information("  Environment: {Environment}", builder.Environment.EnvironmentName);
Log.Information("  Database Host: {Host}", connBuilder.Host);
Log.Information("  Database Name: {Database}", connBuilder.Database);
Log.Information("  Database User: {Username}", connBuilder.Username);
Log.Information("  Provider: Npgsql.EntityFrameworkCore.PostgreSQL");
Log.Information("  Resolved Connection String (Masked): {MaskedConn}", maskedConnectionString);
Log.Information("  Configuration Source: {ConfigSource}", configSource);
Log.Information("  Loaded Appsettings files: appsettings.json ({AppsettingsExists}), appsettings.Development.json ({AppsettingsDevExists})", appsettingsExists, appsettingsDevExists);
Log.Information("  Loaded Environment Variables:");
Log.Information("    ASPNETCORE_ENVIRONMENT: {EnvVar}", Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Not Set");
Log.Information("    DOTNET_ENVIRONMENT: {EnvVar}", Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT") ?? "Not Set");
Log.Information("    DATABASE_URL: {EnvVar}", Environment.GetEnvironmentVariable("DATABASE_URL") != null ? "Set (value masked)" : "Not Set");
Log.Information("    POSTGRES_CONNECTION: {EnvVar}", Environment.GetEnvironmentVariable("POSTGRES_CONNECTION") != null ? "Set (value masked)" : "Not Set");
Log.Information("    SUPABASE_DB: {EnvVar}", Environment.GetEnvironmentVariable("SUPABASE_DB") ?? "Not Set");
Log.Information("    SUPABASE_URL: {EnvVar}", Environment.GetEnvironmentVariable("SUPABASE_URL") ?? "Not Set");
Log.Information("    ConnectionStrings:DefaultConnection: {EnvVar}", builder.Configuration["ConnectionStrings:DefaultConnection"] != null ? "Set (value masked)" : "Not Set");
Log.Information("    ConnectionStrings:TenantConnection: {EnvVar}", builder.Configuration["ConnectionStrings:TenantConnection"] != null ? "Set (value masked)" : "Not Set");
Log.Information("--------------------------------------------------");

// Add Clean Architecture Layers
// Validate Biodrops External Integration Configuration at application startup
var biodropsValidation = Aquora.Application.Services.BiodropsConfigurationValidator.Validate(builder.Configuration, builder.Environment.IsProduction());
if (!biodropsValidation.IsValid)
{
    Log.Warning("[BIODROPS CONFIG AUDIT] Configuration validation warning: {ErrorMessage}", biodropsValidation.ErrorMessage);
    if (builder.Environment.IsProduction())
    {
        Log.Error("[BIODROPS SECURITY CRITICAL] Integration API key missing or invalid in Production environment. Set 'Integration__Biodrops__ApiKey'. External integration requests will be safely rejected.");
    }
}
else
{
    Log.Information("[BIODROPS CONFIG AUDIT] Biodrops integration status: {Status}",
        biodropsValidation.IsConfigured ? "Configured (API key active)" : "Unconfigured (integration requests will fail safe)");
}

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddPersistence(builder.Configuration);
builder.Services.AddScoped<Aquora.Application.Interfaces.Services.IOperationsIssueNotificationService, Aquora.API.Services.OperationsIssueNotificationService>();

// Configure Reverse Proxy Forwarded Headers (X-Forwarded-For & X-Forwarded-Proto)
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// Permission Authorization Core
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();

    // Rate Limiting
    builder.Services.AddRateLimiter(options =>
    {
        options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<Microsoft.AspNetCore.Http.HttpContext, string>(httpContext =>
            System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.User.Identity?.Name ?? httpContext.Request.Headers.Host.ToString(),
                factory: partition => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                {
                    AutoReplenishment = true,
                    PermitLimit = 100,
                    QueueLimit = 0,
                    Window = TimeSpan.FromMinutes(1)
                }));

        // Dedicated Rate Limiting Policy for Biodrops External Integration
        options.AddPolicy("BiodropsIntegrationPolicy", httpContext =>
        {
            var headerKey = httpContext.Request.Headers["X-API-Key"].ToString();
            var partitionKey = !string.IsNullOrWhiteSpace(headerKey)
                ? "key_" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(headerKey.Trim())))[..12]
                : "ip_" + (httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown");

            return System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: partitionKey,
                factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
                {
                    AutoReplenishment = true,
                    PermitLimit = 120,
                    QueueLimit = 0,
                    Window = TimeSpan.FromMinutes(1)
                });
        });
    });

    // Configure Forwarded Headers for Reverse Proxy (Nginx / Cloudflare / Docker)
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
    });

    // Controllers, SignalR and CORS
    builder.Services.AddControllers()
        .ConfigureApiBehaviorOptions(options =>
        {
            options.InvalidModelStateResponseFactory = context =>
            {
                var errors = new List<object>();
                foreach (var state in context.ModelState)
                {
                    foreach (var error in state.Value.Errors)
                    {
                        errors.Add(error.ErrorMessage);
                    }
                }
                var response = Aquora.Shared.Models.ApiResponse<object>.CreateFailure(errors, "Validation failed.", context.HttpContext.TraceIdentifier);
                response.Code = "VALIDATION_ERROR";
                return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(response);
            };
        });
builder.Services.AddSignalR();
builder.Services.AddHealthChecks();
builder.Services.AddTransient<Aquora.Application.Interfaces.Services.IProvisioningProgressReporter, Aquora.API.Services.ProvisioningProgressReporter>();
builder.Services.AddTransient<Aquora.Persistence.Services.DatabaseSchemaValidator>();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Aquora API SaaS Foundation", Version = "v1" });
    
    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "JWT Authentication",
        Description = "Enter JWT Bearer token **_only_**",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Id = JwtBearerDefaults.AuthenticationScheme,
            Type = ReferenceType.SecurityScheme
        }
    };
    c.AddSecurityDefinition(securityScheme.Reference.Id, securityScheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });

    var apiKeyScheme = new OpenApiSecurityScheme
    {
        Name = "X-API-Key",
        Description = "Dedicated API Key for Biodrops Production External Integration (Header: X-API-Key)",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "ApiKey",
        Reference = new OpenApiReference
        {
            Id = "BiodropsApiKey",
            Type = ReferenceType.SecurityScheme
        }
    };
    c.AddSecurityDefinition(apiKeyScheme.Reference.Id, apiKeyScheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { apiKeyScheme, Array.Empty<string>() }
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        var origins = new List<string>
        {
            // Production Frontend Origins
            "https://aquora-webzio.vercel.app",
            "https://aquora-backend.webziointernational.in",
            "https://aquora.webziointernational.in",
            "https://aquzio.webziotech.in",
            "https://app.aquora.com",
            "https://biodrops.in",
            "https://www.biodrops.in",
            
            // Local Development Origins
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://127.0.0.1:3000"
        };

        // 1. Read from Env / AppSettings direct keys
        var frontendUrl = builder.Configuration["FRONTEND_URL"];
        if (!string.IsNullOrEmpty(frontendUrl))
            origins.Add(frontendUrl);

        var allowedOrigins = builder.Configuration["ALLOWED_ORIGINS"];
        if (!string.IsNullOrEmpty(allowedOrigins))
            origins.AddRange(allowedOrigins.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(o => o.Trim()));

        // 2. Read from "Cors:AllowedOrigins" array/section
        var corsSection = builder.Configuration.GetSection("Cors:AllowedOrigins");
        if (corsSection.Exists())
        {
            var sectionOrigins = corsSection.Get<string[]>();
            if (sectionOrigins != null)
            {
                origins.AddRange(sectionOrigins.Where(o => !string.IsNullOrEmpty(o)).Select(o => o.Trim()));
            }
        }

        // Clean and deduplicate origins (remove trailing slashes to match exact browser origin strings)
        var uniqueOrigins = origins
            .Where(o => !string.IsNullOrWhiteSpace(o))
            .Select(o => o.Trim().TrimEnd('/'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        policy.SetIsOriginAllowed(origin =>
              {
                  if (string.IsNullOrWhiteSpace(origin)) return false;
                  try
                  {
                      var uri = new Uri(origin);
                      var host = uri.Host;
                      return host.EndsWith("vercel.app", StringComparison.OrdinalIgnoreCase) ||
                             host.EndsWith("webziointernational.in", StringComparison.OrdinalIgnoreCase) ||
                             host.Equals("app.aquora.com", StringComparison.OrdinalIgnoreCase) ||
                             host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                             host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                             uniqueOrigins.Any(u => string.Equals(u, origin.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));
                  }
                  catch
                  {
                      return false;
                  }
              })
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials()
              .SetPreflightMaxAge(TimeSpan.FromHours(1));
    });
});

var app = builder.Build();

// Microsoft Recommended Middleware Pipeline Order for SaaS APIs behind Reverse Proxies
// 1. Process Reverse Proxy Forwarded Headers (Host, Scheme, Proto)
app.UseForwardedHeaders();

// 2. Routing (MUST be executed before UseCors to evaluate endpoint policies)
app.UseRouting();

// 3. CORS Policy (MUST be placed immediately after UseRouting & before ExceptionHandling/Auth!)
app.UseCors("CorsPolicy");

// 4. Global Exception Middleware (Wrapped inside CORS so error responses retain CORS headers)
app.UseMiddleware<ExceptionHandlingMiddleware>();

// 5. Swagger Documentation
if (app.Environment.IsDevelopment() || true)
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Aquora API SaaS Foundation v1"));
}

// 6. Rate Limiting
app.UseRateLimiter();

// 7. Authentication
app.UseAuthentication();

// 8. Tenant Resolution Middleware (after Authentication to read JWT claims)
app.UseMiddleware<TenantResolutionMiddleware>();

// 9. Authorization
app.UseAuthorization();

// 10. Endpoint Mapping
app.MapControllers();
app.MapHealthChecks("/health");
app.MapHealthChecks("/api/v1/health");
app.MapHub<NotificationHub>("/hub/notifications");
app.MapHub<NotificationHub>("/hubs/notifications");
app.MapHub<ProvisioningHub>("/hub/provisioning");
app.MapHub<ProvisioningHub>("/hubs/provisioning");
app.MapHub<DashboardHub>("/hub/dashboard");
app.MapHub<DashboardHub>("/hubs/dashboard");

// Database migration and seeding
// Database connectivity check and optional maintenance
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var platformContext = services.GetRequiredService<PlatformDbContext>();

        Log.Information("Aquzio API starting...");
        Log.Information("Verifying database connectivity...");
        
        bool canConnect = false;
        Exception? lastConnectEx = null;
        const int maxAttempts = 3;

        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                if (attempt > 1)
                {
                    Log.Information("Retrying database connectivity check (attempt {Attempt} of {MaxAttempts})...", attempt, maxAttempts);
                }

                await platformContext.Database.OpenConnectionAsync();
                try
                {
                    using var cmd = platformContext.Database.GetDbConnection().CreateCommand();
                    cmd.CommandText = "SELECT 1;";
                    cmd.CommandTimeout = 15;
                    var result = await cmd.ExecuteScalarAsync();
                    canConnect = result != null && Convert.ToInt32(result) == 1;
                }
                finally
                {
                    await platformContext.Database.CloseConnectionAsync();
                }

                if (canConnect)
                {
                    break;
                }
            }
            catch (Exception connectEx)
            {
                lastConnectEx = connectEx;
                Log.Warning("Database connectivity attempt {Attempt} of {MaxAttempts} failed: {ErrorMessage}", attempt, maxAttempts, connectEx.Message);

                if (attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
                }
            }
        }

        if (!canConnect)
        {
            Log.Fatal(lastConnectEx, "Database connectivity check failed after {MaxAttempts} attempts. Please verify network access and Supabase credentials.", maxAttempts);
            throw new InvalidOperationException($"Database connectivity check failed: {lastConnectEx?.Message}", lastConnectEx);
        }
        Log.Information("Database connection verified.");

        bool autoMigrate = builder.Configuration.GetValue<bool>("AUTO_MIGRATE_ON_STARTUP") || builder.Configuration.GetValue<bool>("Database:AutoMigrate");
        bool autoRepair = builder.Configuration.GetValue<bool>("AUTO_REPAIR_ON_STARTUP") || builder.Configuration.GetValue<bool>("Database:AutoRepair");
        bool isMigrateCommand = args.Contains("migrate", StringComparer.OrdinalIgnoreCase);
        bool isRepairSchemaCommand = args.Contains("repair-schema", StringComparer.OrdinalIgnoreCase);
        bool isRepairDateTimeCommand = args.Contains("repair-datetime", StringComparer.OrdinalIgnoreCase);
        bool isMaintenanceCommand = isMigrateCommand || isRepairSchemaCommand || isRepairDateTimeCommand;

        if (autoMigrate || autoRepair || isMaintenanceCommand)
        {
            try
            {
                Log.Information("[DATABASE MAINTENANCE]: Running database migration and schema repair (explicitly requested)...");
                var schemaValidator = services.GetRequiredService<Aquora.Persistence.Services.DatabaseSchemaValidator>();
                await schemaValidator.EnsureAllTenantSchemasRepairedAsync(platformContext);

                var migrationService = services.GetRequiredService<IMigrationService>();
                await migrationService.MigrateAllAsync();
                Log.Information("[DATABASE MAINTENANCE]: Migration and schema repair completed successfully.");

                if (isMaintenanceCommand)
                {
                    Log.Information("[DATABASE MAINTENANCE]: CLI Maintenance Command completed. Exiting process.");
                    Environment.Exit(0);
                    return;
                }
            }
            catch (Exception migrationEx)
            {
                Log.Fatal(migrationEx, "[DATABASE MAINTENANCE ERROR]: A fatal error occurred during database migration execution.");
                throw;
            }
        }
        else
        {
            Log.Information("Aquzio API ready.");
        }
    }
    catch (Exception ex)
    {
        Log.Fatal(ex, "A fatal error occurred during application startup.");
        throw;
    }
}

try
{
    Log.Information("Starting Aquora API SaaS Foundation host...");
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Host terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

static void LoadEnvironmentVariables(WebApplicationBuilder builder)
{
    // Use DotNetEnv for local development support
    // Does NOT fail or require a .env file on Railway / Render
    try
    {
        DotNetEnv.Env.TraversePath().Load();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[ENV LOADER INFO] DotNetEnv load notice: {ex.Message}");
    }

    // Process environment variables from host (Railway/Render/Docker) take precedence
    builder.Configuration.AddEnvironmentVariables();
}

