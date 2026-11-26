using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.DTOs.Company;
using Aquora.Application.DTOs.Media;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/v1/company")]
    public class CompanyProfileController : ApiControllerBase
    {
        private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        };

        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp"
        };

        private const long MaxImageBytes = 5 * 1024 * 1024; // 5 MB

        private readonly IPlatformDbContext _platformContext;
        private readonly ICurrentUserContext _userContext;
        private readonly ICloudinaryMediaService _cloudinaryService;

        public CompanyProfileController(
            IPlatformDbContext platformContext,
            ICurrentUserContext userContext,
            ICloudinaryMediaService cloudinaryService)
        {
            _platformContext = platformContext;
            _userContext = userContext;
            _cloudinaryService = cloudinaryService;
        }

        private bool IsCompanyAdmin()
        {
            var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value.ToUpperInvariant()).ToList();
            return roles.Contains("OWNER")
                || roles.Contains("COMPANYADMIN")
                || roles.Contains("ACCOUNTANT")
                || roles.Contains("SUPERADMIN")
                || roles.Contains("PLATFORMADMIN");
        }

        private Guid? GetCurrentUserId()
        {
            var val = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? _userContext.UserId;
            return Guid.TryParse(val, out var guid) ? guid : null;
        }

        private static string ValidateGalleryImageFile(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return "Empty file provided.";
            }

            if (file.Length > MaxImageBytes)
            {
                return $"File '{file.FileName}' exceeds the 5 MB size limit.";
            }

            var ext = Path.GetExtension(file.FileName) ?? string.Empty;
            if (!AllowedExtensions.Contains(ext))
            {
                return $"File '{file.FileName}' has unsupported extension '{ext}'. Allowed: JPG, PNG, WebP.";
            }

            var mime = file.ContentType?.Trim() ?? string.Empty;
            if (!AllowedMimeTypes.Contains(mime))
            {
                return $"File '{file.FileName}' has unsupported MIME type '{mime}'. Allowed: JPEG, PNG, WebP.";
            }

            return string.Empty;
        }

        private static CompanyProfileDto MapProfileDto(Tenant tenant, CompanyPublicProfile? profile)
        {
            return new CompanyProfileDto
            {
                TenantId = tenant.Id,
                TenantName = tenant.Name,
                TenantCode = tenant.Code,
                LogoUrl = tenant.LogoUrl,
                BadgeLetters = tenant.BadgeLetters,
                LicenseNumber = tenant.LicenseNumber,
                IsBiodropsProduction = tenant.IsBiodropsProduction,
                DisplayName = profile?.DisplayName ?? tenant.Name,
                ShortDescription = profile?.ShortDescription,
                About = profile?.About,
                EstablishedYear = profile?.EstablishedYear,
                CoverImageUrl = profile?.CoverImageUrl,
                PublicEmail = profile?.PublicEmail ?? tenant.OwnerEmail,
                PublicPhone = profile?.PublicPhone ?? tenant.OwnerPhone,
                WebsiteUrl = profile?.WebsiteUrl ?? tenant.CustomDomain,
                ContactPerson = profile?.ContactPerson ?? tenant.OwnerName,
                FullAddress = profile?.FullAddress ?? tenant.Address,
                City = profile?.City,
                District = profile?.District,
                State = profile?.State,
                PinCode = profile?.PinCode,
                GoogleMapsUrl = profile?.GoogleMapsUrl,
                Latitude = profile?.Latitude,
                Longitude = profile?.Longitude,
                FactoryIntroduction = profile?.FactoryIntroduction,
                ProductionFacilityDescription = profile?.ProductionFacilityDescription,
                ManufacturingInfrastructure = profile?.ManufacturingInfrastructure,
                QualityControlFacilities = profile?.QualityControlFacilities,
                IsPublic = profile?.IsPublic ?? true,
                UpdatedAt = profile?.UpdatedAt ?? tenant.UpdatedAt
            };
        }

        private static CompanyGalleryImageDto MapGalleryDto(CompanyGalleryImage img)
        {
            return new CompanyGalleryImageDto
            {
                Id = img.Id,
                TenantId = img.TenantId,
                ImageUrl = img.ImageUrl,
                Category = img.Category,
                Caption = img.Caption,
                Format = img.Format,
                Bytes = img.Bytes,
                Width = img.Width,
                Height = img.Height,
                DisplayOrder = img.DisplayOrder,
                IsPublic = img.IsPublic,
                CreatedAt = img.CreatedAt
            };
        }

        [HttpGet("profile")]
        public async Task<ActionResult<ApiResponse<CompanyProfileDto>>> GetProfile(CancellationToken cancellationToken)
        {
            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyProfileDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Tenant not found.", "NotFound"));
            }

            var profile = await _platformContext.CompanyPublicProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

            return Success(MapProfileDto(tenant, profile), "Company profile retrieved successfully.");
        }

        [HttpPut("profile")]
        public async Task<ActionResult<ApiResponse<CompanyProfileDto>>> UpdateProfile(
            [FromBody] UpdateCompanyProfileRequest request,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<CompanyProfileDto>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyProfileDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var tenant = await _platformContext.Tenants
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Tenant not found.", "NotFound"));
            }

            var profile = await _platformContext.CompanyPublicProfiles
                .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

            var userIdStr = _userContext.UserId ?? "System";
            var now = DateTime.UtcNow;

            if (profile == null)
            {
                profile = new CompanyPublicProfile
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CreatedAt = now,
                    CreatedBy = userIdStr
                };
                _platformContext.CompanyPublicProfiles.Add(profile);
            }

            profile.DisplayName = request.DisplayName?.Trim();
            profile.ShortDescription = request.ShortDescription?.Trim();
            profile.About = request.About?.Trim();
            profile.EstablishedYear = request.EstablishedYear;
            profile.PublicEmail = request.PublicEmail?.Trim();
            profile.PublicPhone = request.PublicPhone?.Trim();
            profile.WebsiteUrl = request.WebsiteUrl?.Trim();
            profile.ContactPerson = request.ContactPerson?.Trim();
            profile.FullAddress = request.FullAddress?.Trim();
            profile.City = request.City?.Trim();
            profile.District = request.District?.Trim();
            profile.State = request.State?.Trim();
            profile.PinCode = request.PinCode?.Trim();
            profile.GoogleMapsUrl = request.GoogleMapsUrl?.Trim();
            profile.Latitude = request.Latitude;
            profile.Longitude = request.Longitude;
            profile.FactoryIntroduction = request.FactoryIntroduction?.Trim();
            profile.ProductionFacilityDescription = request.ProductionFacilityDescription?.Trim();
            profile.ManufacturingInfrastructure = request.ManufacturingInfrastructure?.Trim();
            profile.QualityControlFacilities = request.QualityControlFacilities?.Trim();
            profile.IsPublic = request.IsPublic;
            profile.UpdatedAt = now;
            profile.UpdatedBy = userIdStr;

            await _platformContext.SaveChangesAsync(cancellationToken);

            return Success(MapProfileDto(tenant, profile), "Company profile updated successfully.");
        }

        [HttpGet("gallery")]
        public async Task<ActionResult<ApiResponse<List<CompanyGalleryImageDto>>>> GetGallery(CancellationToken cancellationToken)
        {
            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<List<CompanyGalleryImageDto>>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var images = await _platformContext.CompanyGalleryImages
                .AsNoTracking()
                .Where(g => g.TenantId == tenantId && !g.IsDeleted)
                .OrderBy(g => g.DisplayOrder)
                .ThenBy(g => g.CreatedAt)
                .Select(g => MapGalleryDto(g))
                .ToListAsync(cancellationToken);

            return Success(images, "Company gallery retrieved successfully.");
        }

        [HttpPost("gallery/upload")]
        [RequestSizeLimit(25 * 1024 * 1024)]
        public async Task<ActionResult<ApiResponse<List<CompanyGalleryImageDto>>>> UploadGalleryImages(
            [FromForm] List<IFormFile> files,
            [FromForm] string category = "OTHER",
            [FromForm] string? caption = null,
            [FromForm] bool isPublic = true,
            CancellationToken cancellationToken = default)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<List<CompanyGalleryImageDto>>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<List<CompanyGalleryImageDto>>("Tenant context could not be resolved.", "Unauthorized"));
            }

            if (files == null || files.Count == 0)
            {
                return BadRequest(Failure<List<CompanyGalleryImageDto>>("Please provide at least one image file.", "Invalid Request"));
            }

            if (files.Count > 10)
            {
                return BadRequest(Failure<List<CompanyGalleryImageDto>>("Maximum 10 images can be uploaded per request.", "Too Many Files"));
            }

            foreach (var file in files)
            {
                var validationError = ValidateGalleryImageFile(file);
                if (!string.IsNullOrEmpty(validationError))
                {
                    return BadRequest(Failure<List<CompanyGalleryImageDto>>(validationError, "Validation Failed"));
                }
            }

            var normalizedCategory = CompanyGalleryCategories.Normalize(category);
            var currentMaxOrder = await _platformContext.CompanyGalleryImages
                .Where(g => g.TenantId == tenantId && !g.IsDeleted)
                .Select(g => (int?)g.DisplayOrder)
                .MaxAsync(cancellationToken) ?? 0;

            var userId = GetCurrentUserId();
            var userIdStr = _userContext.UserId ?? "System";
            var uploadedEntities = new List<CompanyGalleryImage>();

            foreach (var file in files)
            {
                using var stream = file.OpenReadStream();
                var uploadResult = await _cloudinaryService.UploadImageAsync(
                    stream,
                    file.FileName,
                    file.ContentType,
                    MediaAssetType.CompanyGallery,
                    tenantId,
                    userId,
                    cancellationToken);

                currentMaxOrder += 1;
                var entity = new CompanyGalleryImage
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    StorageKey = uploadResult.PublicId,
                    ImageUrl = uploadResult.Url,
                    Category = normalizedCategory,
                    Caption = caption?.Trim(),
                    Format = uploadResult.Format,
                    Bytes = uploadResult.Bytes,
                    Width = uploadResult.Width,
                    Height = uploadResult.Height,
                    DisplayOrder = currentMaxOrder,
                    IsPublic = isPublic,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = userIdStr
                };

                _platformContext.CompanyGalleryImages.Add(entity);
                uploadedEntities.Add(entity);
            }

            await _platformContext.SaveChangesAsync(cancellationToken);

            var dtos = uploadedEntities.Select(MapGalleryDto).ToList();
            return Success(dtos, $"{dtos.Count} image(s) uploaded to company gallery.");
        }

        [HttpPatch("gallery/{id:guid}")]
        public async Task<ActionResult<ApiResponse<CompanyGalleryImageDto>>> UpdateGalleryImage(
            Guid id,
            [FromBody] UpdateGalleryImageRequest request,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<CompanyGalleryImageDto>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyGalleryImageDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var img = await _platformContext.CompanyGalleryImages
                .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId && !g.IsDeleted, cancellationToken);

            if (img == null)
            {
                return NotFound(Failure<CompanyGalleryImageDto>("Gallery image not found.", "NotFound"));
            }

            if (request.Category != null)
            {
                img.Category = CompanyGalleryCategories.Normalize(request.Category);
            }

            if (request.Caption != null)
            {
                img.Caption = request.Caption.Trim();
            }

            if (request.IsPublic.HasValue)
            {
                img.IsPublic = request.IsPublic.Value;
            }

            img.UpdatedAt = DateTime.UtcNow;
            img.UpdatedBy = _userContext.UserId ?? "System";

            await _platformContext.SaveChangesAsync(cancellationToken);

            return Success(MapGalleryDto(img), "Gallery image updated.");
        }

        [HttpPost("gallery/{id:guid}/replace")]
        [RequestSizeLimit(10 * 1024 * 1024)]
        public async Task<ActionResult<ApiResponse<CompanyGalleryImageDto>>> ReplaceGalleryImage(
            Guid id,
            [FromForm] IFormFile file,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<CompanyGalleryImageDto>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyGalleryImageDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var validationError = ValidateGalleryImageFile(file);
            if (!string.IsNullOrEmpty(validationError))
            {
                return BadRequest(Failure<CompanyGalleryImageDto>(validationError, "Validation Failed"));
            }

            var img = await _platformContext.CompanyGalleryImages
                .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId && !g.IsDeleted, cancellationToken);

            if (img == null)
            {
                return NotFound(Failure<CompanyGalleryImageDto>("Gallery image not found.", "NotFound"));
            }

            var oldStorageKey = img.StorageKey;
            using var stream = file.OpenReadStream();
            var uploadResult = await _cloudinaryService.UploadImageAsync(
                stream,
                file.FileName,
                file.ContentType,
                MediaAssetType.CompanyGallery,
                tenantId,
                GetCurrentUserId(),
                cancellationToken);

            img.StorageKey = uploadResult.PublicId;
            img.ImageUrl = uploadResult.Url;
            img.Format = uploadResult.Format;
            img.Bytes = uploadResult.Bytes;
            img.Width = uploadResult.Width;
            img.Height = uploadResult.Height;
            img.UpdatedAt = DateTime.UtcNow;
            img.UpdatedBy = _userContext.UserId ?? "System";

            await _platformContext.SaveChangesAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(oldStorageKey) && oldStorageKey != uploadResult.PublicId)
            {
                _ = Task.Run(async () =>
                {
                    try { await _cloudinaryService.DeleteAssetAsync(oldStorageKey, "image"); } catch { }
                });
            }

            return Success(MapGalleryDto(img), "Gallery image replaced successfully.");
        }

        [HttpPut("gallery/reorder")]
        public async Task<ActionResult<ApiResponse<bool>>> ReorderGallery(
            [FromBody] ReorderGalleryRequest request,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<bool>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<bool>("Tenant context could not be resolved.", "Unauthorized"));
            }

            if (request?.ImageIds == null || request.ImageIds.Count == 0)
            {
                return BadRequest(Failure<bool>("ImageIds list is required.", "Validation Failed"));
            }

            var images = await _platformContext.CompanyGalleryImages
                .Where(g => g.TenantId == tenantId && !g.IsDeleted)
                .ToListAsync(cancellationToken);

            var orderLookup = new Dictionary<Guid, int>();
            for (int i = 0; i < request.ImageIds.Count; i++)
            {
                if (!orderLookup.ContainsKey(request.ImageIds[i]))
                {
                    orderLookup[request.ImageIds[i]] = i + 1;
                }
            }

            var nextOrder = request.ImageIds.Count + 1;
            foreach (var img in images)
            {
                if (orderLookup.TryGetValue(img.Id, out var newOrder))
                {
                    img.DisplayOrder = newOrder;
                }
                else
                {
                    img.DisplayOrder = nextOrder++;
                }
                img.UpdatedAt = DateTime.UtcNow;
                img.UpdatedBy = _userContext.UserId ?? "System";
            }

            await _platformContext.SaveChangesAsync(cancellationToken);
            return Success(true, "Gallery order updated.");
        }

        [HttpPost("gallery/{id:guid}/set-cover")]
        public async Task<ActionResult<ApiResponse<CompanyProfileDto>>> SetAsCover(
            Guid id,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<CompanyProfileDto>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyProfileDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var img = await _platformContext.CompanyGalleryImages
                .AsNoTracking()
                .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId && !g.IsDeleted, cancellationToken);

            if (img == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Gallery image not found.", "NotFound"));
            }

            var tenant = await _platformContext.Tenants
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Tenant not found.", "NotFound"));
            }

            var profile = await _platformContext.CompanyPublicProfiles
                .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

            var userIdStr = _userContext.UserId ?? "System";
            if (profile == null)
            {
                profile = new CompanyPublicProfile
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = userIdStr
                };
                _platformContext.CompanyPublicProfiles.Add(profile);
            }

            profile.CoverImageUrl = img.ImageUrl;
            profile.CoverImagePublicId = img.StorageKey;
            profile.UpdatedAt = DateTime.UtcNow;
            profile.UpdatedBy = userIdStr;

            await _platformContext.SaveChangesAsync(cancellationToken);

            return Success(MapProfileDto(tenant, profile), "Company cover image updated.");
        }

        [HttpPost("gallery/{id:guid}/set-logo")]
        public async Task<ActionResult<ApiResponse<CompanyProfileDto>>> SetAsLogo(
            Guid id,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<CompanyProfileDto>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<CompanyProfileDto>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var img = await _platformContext.CompanyGalleryImages
                .AsNoTracking()
                .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId && !g.IsDeleted, cancellationToken);

            if (img == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Gallery image not found.", "NotFound"));
            }

            var tenant = await _platformContext.Tenants
                .FirstOrDefaultAsync(t => t.Id == tenantId && !t.IsDeleted, cancellationToken);

            if (tenant == null)
            {
                return NotFound(Failure<CompanyProfileDto>("Tenant not found.", "NotFound"));
            }

            tenant.LogoUrl = img.ImageUrl;
            tenant.LogoPublicId = img.StorageKey;
            tenant.UpdatedAt = DateTime.UtcNow;
            tenant.UpdatedBy = _userContext.UserId ?? "System";

            await _platformContext.SaveChangesAsync(cancellationToken);

            var profile = await _platformContext.CompanyPublicProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);

            return Success(MapProfileDto(tenant, profile), "Company logo updated.");
        }

        [HttpDelete("gallery/{id:guid}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteGalleryImage(
            Guid id,
            CancellationToken cancellationToken)
        {
            if (!IsCompanyAdmin())
            {
                return StatusCode(403, Failure<bool>("CompanyAdmin or Owner privileges required.", "Forbidden"));
            }

            var tenantId = _userContext.TenantId;
            if (tenantId == Guid.Empty)
            {
                return Unauthorized(Failure<bool>("Tenant context could not be resolved.", "Unauthorized"));
            }

            var img = await _platformContext.CompanyGalleryImages
                .FirstOrDefaultAsync(g => g.Id == id && g.TenantId == tenantId && !g.IsDeleted, cancellationToken);

            if (img == null)
            {
                return NotFound(Failure<bool>("Gallery image not found.", "NotFound"));
            }

            img.IsDeleted = true;
            img.DeletedAt = DateTime.UtcNow;
            img.DeletedBy = _userContext.UserId ?? "System";

            // Clear cover/logo reference if this image was active
            var profile = await _platformContext.CompanyPublicProfiles
                .FirstOrDefaultAsync(p => p.TenantId == tenantId, cancellationToken);
            if (profile != null && profile.CoverImagePublicId == img.StorageKey)
            {
                profile.CoverImageUrl = null;
                profile.CoverImagePublicId = null;
                profile.UpdatedAt = DateTime.UtcNow;
            }

            await _platformContext.SaveChangesAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(img.StorageKey))
            {
                var keyToDelete = img.StorageKey;
                _ = Task.Run(async () =>
                {
                    try { await _cloudinaryService.DeleteAssetAsync(keyToDelete, "image"); } catch { }
                });
            }

            return Success(true, "Gallery image deleted successfully.");
        }
    }
}

