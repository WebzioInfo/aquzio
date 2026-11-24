using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    [Authorize]
    public class CompanyController : ApiControllerBase
    {
        private readonly ITenantDbContext _tenantContext;
        private readonly IPlatformDbContext _platformContext;
        private readonly ICurrentUserContext _userContext;
        private readonly IStationConfigurationService _stationConfigService;
        private readonly IPasswordHasher _passwordHasher;
        private readonly ICloudinaryMediaService _cloudinaryService;

        private static readonly ConcurrentDictionary<Guid, (int FailedCount, DateTime LockoutExpiry)> _pinFailedAttempts = new();

        public CompanyController(
            ITenantDbContext tenantContext,
            IPlatformDbContext platformContext,
            ICurrentUserContext userContext,
            IStationConfigurationService stationConfigService,
            IPasswordHasher passwordHasher,
            ICloudinaryMediaService cloudinaryService)
        {
            _tenantContext = tenantContext;
            _platformContext = platformContext;
            _userContext = userContext;
            _stationConfigService = stationConfigService;
            _passwordHasher = passwordHasher;
            _cloudinaryService = cloudinaryService;
        }

        private bool IsCompanyAdmin()
        {
            var roles = User.FindAll(System.Security.Claims.ClaimTypes.Role).Select(c => c.Value.ToUpperInvariant()).ToList();
            return roles.Contains("COMPANYADMIN") || roles.Contains("ACCOUNTANT") || roles.Contains("SUPERADMIN") || roles.Contains("PLATFORMADMIN");
        }

        private string GetSecurityPinFilePath(Guid tenantId)
        {
            var dir = System.IO.Path.Combine(AppContext.BaseDirectory, "settings");
            if (!System.IO.Directory.Exists(dir))
            {
                System.IO.Directory.CreateDirectory(dir);
            }
            return System.IO.Path.Combine(dir, $"security-settings-{tenantId}.json");
        }

        private string? GetFilePinHash(Guid tenantId)
        {
            var path = GetSecurityPinFilePath(tenantId);
            if (!System.IO.File.Exists(path)) return null;
            try
            {
                var json = System.IO.File.ReadAllText(path);
                var dict = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                return dict != null && dict.TryGetValue("SecretPinHash", out var hash) ? hash : null;
            }
            catch
            {
                return null;
            }
        }

        private void SaveFilePinHash(Guid tenantId, string pinHash)
        {
            try
            {
                var path = GetSecurityPinFilePath(tenantId);
                var dict = new Dictionary<string, string> { { "SecretPinHash", pinHash } };
                var json = System.Text.Json.JsonSerializer.Serialize(dict);
                System.IO.File.WriteAllText(path, json);
            }
            catch { }
        }

        private async Task<Company> GetOrCreateCompanyAsync(Guid tenantId)
        {
            var company = tenantId != Guid.Empty
                ? await _tenantContext.Companies.FirstOrDefaultAsync(c => c.TenantId == tenantId && !c.IsDeleted)
                : await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);

            if (company != null)
            {
                return company;
            }

            company = tenantId != Guid.Empty
                ? await _tenantContext.Companies.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.TenantId == tenantId)
                : null;

            if (company != null)
            {
                company.IsDeleted = false;
                await _tenantContext.SaveChangesAsync();
                return company;
            }

            var tenant = tenantId != Guid.Empty
                ? await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId)
                : null;

            company = new Company
            {
                Id = Guid.NewGuid(),
                Name = tenant?.Name ?? "Aquora Water ERP",
                Code = tenant?.Code ?? "AQUORA",
                TenantId = tenantId != Guid.Empty ? tenantId : Guid.NewGuid(),
                TimeZone = tenant?.Timezone ?? "Asia/Kolkata",
                DateFormat = "dd MMM yyyy",
                TimeFormat = "12h",
                CreatedAt = DateTime.UtcNow,
                CreatedBy = _userContext.UserId != null ? _userContext.UserId.ToString()! : "System"
            };

            _tenantContext.Companies.Add(company);
            await _tenantContext.SaveChangesAsync();
            return company;
        }

        [HttpGet("settings")]
        public async Task<ActionResult<ApiResponse<object>>> GetSettings()
        {
            try
            {
                var tenantId = _userContext.TenantId;
                var company = await GetOrCreateCompanyAsync(tenantId);

                var tenant = tenantId != Guid.Empty
                    ? await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId)
                    : null;

                // Ensure tenant currency defaults to INR
                if (tenant != null && (string.IsNullOrWhiteSpace(tenant.Currency) || tenant.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase)))
                {
                    tenant.Currency = "INR";
                    try { await _platformContext.SaveChangesAsync(); } catch { }
                }

                var resolvedName = !string.IsNullOrWhiteSpace(tenant?.Name)
                    ? tenant.Name
                    : (!string.IsNullOrWhiteSpace(company.Name) && company.Name != "Company"
                        ? company.Name
                        : "Aiwa Minerals");

                var currencyCode = !string.IsNullOrWhiteSpace(tenant?.Currency) && !tenant.Currency.Equals("USD", StringComparison.OrdinalIgnoreCase)
                    ? tenant.Currency
                    : "INR";

                return Success<object>(new
                {
                    Name = resolvedName,
                    DisplayName = resolvedName,
                    BadgeLetters = tenant?.BadgeLetters ?? string.Empty,
                    Email = tenant?.OwnerEmail ?? string.Empty,
                    Phone = tenant?.OwnerPhone ?? string.Empty,
                    GstNumber = tenant?.GstNumber ?? string.Empty,
                    Address = tenant?.Address ?? string.Empty,
                    LogoUrl = tenant?.LogoUrl ?? string.Empty,
                    LogoPublicId = tenant?.LogoPublicId ?? string.Empty,
                    TenantId = (tenant?.Id ?? tenantId).ToString(),
                    TenantCode = tenant?.Code ?? company.Code ?? "AQUORA",
                    SchemaName = tenant?.SchemaName ?? "public",
                    SubscriptionPlan = tenant?.SubscriptionPlan ?? "Starter",
                    TimeZone = company.TimeZone ?? tenant?.Timezone ?? "Asia/Kolkata",
                    Language = tenant?.Language ?? "en",
                    Currency = currencyCode,
                    CurrencySymbol = currencyCode == "INR" ? "₹" : "$",
                    CurrencyName = currencyCode == "INR" ? "Indian Rupee" : "US Dollar",
                    DateFormat = company.DateFormat ?? "dd MMM yyyy",
                    TimeFormat = company.TimeFormat ?? "12h",
                    CreatedAt = company.CreatedAt
                }, "Company settings loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>($"Failed to load company settings: {ex.Message}", "InternalServerError", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPost("logo/upload")]
        [RequestSizeLimit(5 * 1024 * 1024)]
        public async Task<ActionResult<ApiResponse<object>>> UploadLogo(Microsoft.AspNetCore.Http.IFormFile file)
        {
            if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin or Owner privileges required to update company logo.", "Forbidden"));

            if (file == null || file.Length == 0)
            {
                return BadRequest(Failure<object>("Please select a valid image file to upload as the company logo.", "Invalid File"));
            }

            try
            {
                var tenantId = _userContext.TenantId;
                var tenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
                if (tenant == null)
                {
                    return NotFound(Failure<object>("Tenant workspace could not be found.", "NotFound"));
                }

                var oldPublicId = tenant.LogoPublicId;

                // 1. Upload logo to Cloudinary in folder: aquzio/tenants/{tenantId}/company/logo
                using var stream = file.OpenReadStream();
                var uploadResult = await _cloudinaryService.UploadImageAsync(
                    stream,
                    file.FileName,
                    file.ContentType,
                    Aquora.Application.DTOs.Media.MediaAssetType.CompanyLogo,
                    tenant.Id,
                    Guid.TryParse(_userContext.UserId, out var uid) ? uid : null);

                // 2. Persist LogoUrl and LogoPublicId in Database
                tenant.LogoUrl = uploadResult.Url;
                tenant.LogoPublicId = uploadResult.PublicId;
                tenant.UpdatedAt = DateTime.UtcNow;
                tenant.UpdatedBy = _userContext.UserId?.ToString() ?? "System";

                await _platformContext.SaveChangesAsync();

                // 3. Compensating cleanup of previous logo asset
                if (!string.IsNullOrWhiteSpace(oldPublicId) && oldPublicId != uploadResult.PublicId)
                {
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _cloudinaryService.DeleteAssetAsync(oldPublicId, "image");
                        }
                        catch { }
                    });
                }

                return await GetSettings();
            }
            catch (Exception ex)
            {
                return Failure<object>(ex.Message, "Failed to upload company logo.");
            }
        }

        [HttpDelete("logo")]
        public async Task<ActionResult<ApiResponse<object>>> RemoveLogo()
        {
            if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin or Owner privileges required to remove company logo.", "Forbidden"));

            try
            {
                var tenantId = _userContext.TenantId;
                var tenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
                if (tenant == null)
                {
                    return NotFound(Failure<object>("Tenant workspace could not be found.", "NotFound"));
                }

                var oldPublicId = tenant.LogoPublicId;

                tenant.LogoUrl = null;
                tenant.LogoPublicId = null;
                tenant.UpdatedAt = DateTime.UtcNow;
                tenant.UpdatedBy = _userContext.UserId?.ToString() ?? "System";

                await _platformContext.SaveChangesAsync();

                if (!string.IsNullOrWhiteSpace(oldPublicId))
                {
                    await _cloudinaryService.DeleteAssetAsync(oldPublicId, "image");
                }

                return await GetSettings();
            }
            catch (Exception ex)
            {
                return Failure<object>(ex.Message, "Failed to remove company logo.");
            }
        }

        [HttpPut("settings")]
        public async Task<ActionResult<ApiResponse<object>>> UpdateSettings([FromBody] UpdateSettingsRequest request)
        {
            if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin privileges required.", "Forbidden"));

            var tenantId = _userContext.TenantId;
            var company = await GetOrCreateCompanyAsync(tenantId);

            company.Name = request.Name;
            company.TimeZone = request.Timezone ?? "Asia/Kolkata";
            company.DateFormat = request.DateFormat ?? "dd MMM yyyy";
            company.TimeFormat = request.TimeFormat ?? "12h";
            company.UpdatedAt = DateTime.UtcNow;
            company.UpdatedBy = _userContext.UserId != null ? _userContext.UserId.ToString()! : "System";

            // Sync with Platform DB Tenant record
            var tenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == _userContext.TenantId);
            if (tenant != null)
            {
                tenant.Name = request.Name;
                if (request.BadgeLetters != null)
                {
                    var cleaned = new string(request.BadgeLetters.Where(char.IsLetterOrDigit).Take(4).ToArray()).ToUpperInvariant();
                    tenant.BadgeLetters = string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
                }
                tenant.OwnerEmail = request.Email;
                tenant.OwnerPhone = request.Phone;
                tenant.GstNumber = request.GstNumber;
                tenant.Address = request.Address;
                tenant.Timezone = request.Timezone ?? "Asia/Kolkata";
                tenant.Language = request.Language ?? "en";
                tenant.LogoUrl = request.LogoUrl;
                tenant.Currency = !string.IsNullOrWhiteSpace(request.Currency) ? request.Currency : "INR";
                await _platformContext.SaveChangesAsync();
            }

            await _tenantContext.SaveChangesAsync();
            return await GetSettings();
        }

        [HttpGet("security")]
        public async Task<ActionResult<ApiResponse<object>>> GetSecurity()
        {
            try
            {
                var tenantId = _userContext.TenantId;
                var company = await GetOrCreateCompanyAsync(tenantId);

                var fileHash = GetFilePinHash(tenantId);
                var hasAdminPin = !string.IsNullOrEmpty(company.AdminPinHash) || !string.IsNullOrEmpty(fileHash);

                return Success<object>(new
                {
                    HasAdminPin = hasAdminPin,
                    HasSecretKey = hasAdminPin,
                    IsPinSet = hasAdminPin,
                    ApiKey = company.ApiKey ?? string.Empty
                }, "Security configuration loaded.");
            }
            catch (Exception ex)
            {
                return Failure<object>($"Failed to load security configuration: {ex.Message}", "InternalServerError", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPut("security/admin-pin")]
        [HttpPut("security")]
        public async Task<ActionResult<ApiResponse<object>>> UpdateAdminPin([FromBody] UpdateSecurityRequest request)
        {
            try
            {
                if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin privileges required.", "Forbidden"));

                var pin = request.ResolvedAdminPin;
                var confirmPin = request.ResolvedConfirmPin;

                if (string.IsNullOrWhiteSpace(pin) || pin.Length != 4 || !pin.All(char.IsDigit))
                {
                    return BadRequest(Failure<object>("PIN must be exactly 4 digits.", "ValidationError"));
                }

                if (pin != confirmPin)
                {
                    return BadRequest(Failure<object>("PINs do not match.", "ValidationError"));
                }

                var tenantId = _userContext.TenantId;
                var pinHash = _passwordHasher.HashPassword(pin);

                var company = await GetOrCreateCompanyAsync(tenantId);
                company.AdminPinHash = pinHash;
                company.UpdatedAt = DateTime.UtcNow;
                company.UpdatedBy = _userContext.UserId != null ? _userContext.UserId.ToString()! : "System";

                await _tenantContext.SaveChangesAsync();
                SaveFilePinHash(tenantId, pinHash);

                return Success<object>(new { isPinSet = true }, "Admin PIN saved successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>($"Failed to update Admin PIN: {ex.Message}", "InternalServerError", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPost("security/verify-admin-pin")]
        public async Task<ActionResult<ApiResponse<object>>> VerifyAdminPin([FromBody] VerifyAdminPinRequest request)
        {
            try
            {
                var tenantId = _userContext.TenantId;

                if (_pinFailedAttempts.TryGetValue(tenantId, out var record) && record.LockoutExpiry > DateTime.UtcNow)
                {
                    var remaining = Math.Ceiling((record.LockoutExpiry - DateTime.UtcNow).TotalMinutes);
                    return BadRequest(Failure<object>($"Too many failed PIN attempts. Account locked for {remaining} minutes.", "RateLimitExceeded"));
                }

                var pin = request.ResolvedAdminPin;
                if (string.IsNullOrWhiteSpace(pin) || pin.Length != 4 || !pin.All(char.IsDigit))
                {
                    return BadRequest(Failure<object>("PIN must be exactly 4 digits.", "ValidationError"));
                }

                Company? company = null;
                try
                {
                    company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                }
                catch { }

                var hash = company?.AdminPinHash;
                if (string.IsNullOrEmpty(hash))
                {
                    hash = GetFilePinHash(tenantId);
                }

                if (string.IsNullOrEmpty(hash))
                {
                    return BadRequest(Failure<object>("Admin PIN has not been configured. Please set one in Company Settings → Security.", "NotConfigured"));
                }

                var isValid = _passwordHasher.VerifyPassword(pin, hash);
                if (!isValid)
                {
                    var newCount = record.FailedCount + 1;
                    var expiry = newCount >= 5 ? DateTime.UtcNow.AddMinutes(5) : DateTime.MinValue;
                    _pinFailedAttempts[tenantId] = (newCount, expiry);
                    return BadRequest(Failure<object>("Invalid admin PIN.", "ValidationError"));
                }

                _pinFailedAttempts.TryRemove(tenantId, out _);

                return Success<object>(new { verified = true, timestamp = DateTime.UtcNow.AddMinutes(15) }, "Admin PIN verified successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>($"Failed to verify Admin PIN: {ex.Message}", "InternalServerError", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPost("security/regenerate-api-key")]
        public async Task<ActionResult<ApiResponse<object>>> RegenerateApiKey()
        {
            try
            {
                if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin privileges required.", "Forbidden"));

                var keyBytes = new byte[24];
                using (var rng = RandomNumberGenerator.Create())
                {
                    rng.GetBytes(keyBytes);
                }
                var apiKey = "aq_live_" + Convert.ToHexString(keyBytes).ToLower();

                Company? company = null;
                try
                {
                    company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                }
                catch { }

                if (company != null)
                {
                    try
                    {
                        company.ApiKey = apiKey;
                        await _tenantContext.SaveChangesAsync();
                    }
                    catch { }
                }

                return Success<object>(new { apiKey }, "API Key regenerated successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>($"Failed to regenerate API Key: {ex.Message}", "InternalServerError", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpGet("stations")]
        public async Task<ActionResult<ApiResponse<object>>> GetStations()
        {
            var result = await _stationConfigService.GetStationConfigurationsAsync(_userContext.TenantId);
            return Success<object>(result, "Stations loaded.");
        }

        [HttpPut("stations")]
        public async Task<ActionResult<ApiResponse<object>>> UpdateStations([FromBody] UpdateStationsRequest request)
        {
            if (!IsCompanyAdmin()) return StatusCode(403, Failure<object>("CompanyAdmin privileges required.", "Forbidden"));

            var configs = request.Stations.Select(s => new StationConfigDto
            {
                Name = s.Name,
                IsEnabled = s.IsEnabled
            }).ToList();

            await _stationConfigService.UpdateStationConfigurationsAsync(_userContext.TenantId, configs);
            return await GetStations();
        }

        [HttpGet("user-security")]
        public async Task<ActionResult<ApiResponse<object>>> GetUserSecurity()
        {
            var userMemberships = await _platformContext.UserMemberships
                .Where(m => m.TenantId == _userContext.TenantId)
                .Select(m => m.PlatformUserId)
                .ToListAsync();

            var totalEmployees = await _platformContext.Users
                .Where(u => userMemberships.Contains(u.Id) && !u.IsDeleted)
                .CountAsync();

            var activeEmployees = await _platformContext.Users
                .Where(u => userMemberships.Contains(u.Id) && u.IsActive && !u.IsDeleted)
                .CountAsync();

            var lockedUsers = await _platformContext.Users
                .Where(u => userMemberships.Contains(u.Id) && !u.IsActive && !u.IsDeleted)
                .CountAsync();

            var pendingInvitations = await _platformContext.TenantInvitations
                .Where(i => i.TenantId == _userContext.TenantId && i.Status == "Pending")
                .CountAsync();

            return Success<object>(new
            {
                TotalEmployees = totalEmployees,
                ActiveEmployees = activeEmployees,
                LockedUsers = lockedUsers,
                PendingInvitations = pendingInvitations
            }, "User security statistics loaded.");
        }
    }

    public class UpdateSettingsRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? DisplayName { get; set; }
        public string? BadgeLetters { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? GstNumber { get; set; }
        public string? Address { get; set; }
        public string Timezone { get; set; } = "UTC";
        public string Language { get; set; } = "en";
        public string DateFormat { get; set; } = "YYYY-MM-DD";
        public string TimeFormat { get; set; } = "12h";
        public string? LogoUrl { get; set; }
        public string? Currency { get; set; } = "INR";
    }

    public class UpdateSecurityRequest
    {
        public string? AdminPin { get; set; }
        public string? Pin { get; set; }
        public string? ConfirmAdminPin { get; set; }
        public string? ConfirmPin { get; set; }
        public string? SecretKey { get; set; }
        public string? ConfirmSecret { get; set; }
        public string? ApiKey { get; set; }

        public string ResolvedAdminPin => !string.IsNullOrWhiteSpace(AdminPin)
            ? AdminPin.Trim()
            : (!string.IsNullOrWhiteSpace(Pin) ? Pin.Trim() : (SecretKey?.Trim() ?? string.Empty));

        public string ResolvedConfirmPin => !string.IsNullOrWhiteSpace(ConfirmAdminPin)
            ? ConfirmAdminPin.Trim()
            : (!string.IsNullOrWhiteSpace(ConfirmPin) ? ConfirmPin.Trim() : (ConfirmSecret?.Trim() ?? string.Empty));
    }

    public class VerifyAdminPinRequest
    {
        public string? AdminPin { get; set; }
        public string? Pin { get; set; }

        public string ResolvedAdminPin => !string.IsNullOrWhiteSpace(AdminPin)
            ? AdminPin.Trim()
            : (Pin?.Trim() ?? string.Empty);
    }

    public class UpdateStationsRequest
    {
        public StationReq[] Stations { get; set; } = Array.Empty<StationReq>();
    }

    public class StationReq
    {
        public string Name { get; set; } = string.Empty;
        public bool IsEnabled { get; set; }
    }
}
