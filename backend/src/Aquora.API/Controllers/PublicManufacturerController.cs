using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.DTOs.Public;
using Aquora.Application.Interfaces;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("api/public/manufacturers")]
    [Route("api/v1/public/manufacturers")]
    [Route("api/public/biodrops/manufacturers")]
    [Route("api/v1/public/biodrops/manufacturers")]
    public class PublicManufacturerController : ApiControllerBase
    {
        private readonly IPlatformDbContext _platformContext;

        public PublicManufacturerController(IPlatformDbContext platformContext)
        {
            _platformContext = platformContext;
        }

        /// <summary>
        /// Retrieves publicly exposed active BioDrops Production manufacturers.
        /// Strict Backend Rule: Returns ONLY companies where IsBiodropsProduction === true.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<ApiResponse<PagedResult<PublicManufacturerDto>>>> GetPublicManufacturers(
            [FromQuery] string? search = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            CancellationToken cancellationToken = default)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            // CRITICAL SECURITY RULE: Database level filter enforcing isBiodropsProduction == true
            var query = _platformContext.Tenants
                .AsNoTracking()
                .Where(t => t.IsActive && !t.IsDeleted && t.IsBiodropsProduction);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(t => t.Name.ToLower().Contains(term) 
                                      || t.Code.ToLower().Contains(term) 
                                      || t.Subdomain.ToLower().Contains(term));
            }

            var totalCount = await query.CountAsync(cancellationToken);

            var items = await query
                .OrderBy(t => t.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(t => new
                {
                    Tenant = t,
                    Profile = _platformContext.CompanyPublicProfiles
                        .AsNoTracking()
                        .FirstOrDefault(p => p.TenantId == t.Id && p.IsPublic)
                })
                .Select(x => new PublicManufacturerDto
                {
                    Id = x.Tenant.Id,
                    Name = (x.Profile != null && !string.IsNullOrWhiteSpace(x.Profile.DisplayName)) ? x.Profile.DisplayName : x.Tenant.Name,
                    Code = x.Tenant.Code,
                    Subdomain = x.Tenant.Subdomain,
                    CustomDomain = (x.Profile != null && !string.IsNullOrWhiteSpace(x.Profile.WebsiteUrl)) ? x.Profile.WebsiteUrl : x.Tenant.CustomDomain,
                    LogoUrl = x.Tenant.LogoUrl,
                    BadgeLetters = !string.IsNullOrWhiteSpace(x.Tenant.BadgeLetters) ? x.Tenant.BadgeLetters.Trim().ToUpper() : null,
                    Address = (x.Profile != null && !string.IsNullOrWhiteSpace(x.Profile.FullAddress)) ? x.Profile.FullAddress : x.Tenant.Address,
                    Location = x.Profile != null && (!string.IsNullOrWhiteSpace(x.Profile.City) || !string.IsNullOrWhiteSpace(x.Profile.State))
                        ? string.Join(", ", new[] { x.Profile.City, x.Profile.State }.Where(s => !string.IsNullOrWhiteSpace(s)))
                        : null,
                    LicenseNumber = x.Tenant.LicenseNumber,
                    GstNumber = x.Tenant.GstNumber,
                    PanNumber = null,
                    Email = (x.Profile != null && !string.IsNullOrWhiteSpace(x.Profile.PublicEmail)) ? x.Profile.PublicEmail : x.Tenant.OwnerEmail,
                    Phone = (x.Profile != null && !string.IsNullOrWhiteSpace(x.Profile.PublicPhone)) ? x.Profile.PublicPhone : x.Tenant.OwnerPhone,
                    IsBiodropsProduction = x.Tenant.IsBiodropsProduction,
                    ShortDescription = x.Profile != null ? x.Profile.ShortDescription : null,
                    CoverImageUrl = x.Profile != null ? x.Profile.CoverImageUrl : null,
                    City = x.Profile != null ? x.Profile.City : null,
                    State = x.Profile != null ? x.Profile.State : null,
                    CreatedAt = x.Tenant.CreatedAt
                })
                .ToListAsync(cancellationToken);

            var pagedResult = new PagedResult<PublicManufacturerDto>(items, totalCount, page, pageSize);
            return Success(pagedResult, "Public BioDrops manufacturers retrieved successfully.");
        }

        /// <summary>
        /// Retrieves details of a specific BioDrops Production manufacturer by ID.
        /// Returns 404 if not found or if IsBiodropsProduction is false.
        /// </summary>
        [HttpGet("{id:guid}")]
        public async Task<ActionResult<ApiResponse<PublicManufacturerDto>>> GetPublicManufacturerById(
            Guid id,
            CancellationToken cancellationToken = default)
        {
            // CRITICAL SECURITY RULE: Strict DB filter enforcing isBiodropsProduction == true
            var manufacturer = await _platformContext.Tenants
                .AsNoTracking()
                .Where(t => t.Id == id && t.IsActive && !t.IsDeleted && t.IsBiodropsProduction)
                .Select(t => new PublicManufacturerDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    Code = t.Code,
                    Subdomain = t.Subdomain,
                    CustomDomain = t.CustomDomain,
                    LogoUrl = t.LogoUrl,
                    BadgeLetters = !string.IsNullOrWhiteSpace(t.BadgeLetters) ? t.BadgeLetters.Trim().ToUpper() : null,
                    Address = t.Address,
                    LicenseNumber = t.LicenseNumber,
                    GstNumber = t.GstNumber,
                    PanNumber = t.PanNumber,
                    Email = t.OwnerEmail,
                    Phone = t.OwnerPhone,
                    IsBiodropsProduction = t.IsBiodropsProduction,
                    CreatedAt = t.CreatedAt
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (manufacturer == null)
            {
                return Failure<PublicManufacturerDto>("Manufacturer not found or not enabled for BioDrops Production.", "Not Found", System.Net.HttpStatusCode.NotFound);
            }

            return Success(manufacturer, "Public BioDrops manufacturer details retrieved successfully.");
        }

        /// <summary>
        /// Retrieves the complete public profile and public gallery for a specific BioDrops Production manufacturer.
        /// Enforces IsActive, !IsDeleted, IsBiodropsProduction == true, and only returns IsPublic gallery images.
        /// </summary>
        [HttpGet("{id:guid}/profile")]
        public async Task<ActionResult<ApiResponse<PublicManufacturerProfileDto>>> GetPublicManufacturerProfile(
            Guid id,
            CancellationToken cancellationToken = default)
        {
            var tenant = await _platformContext.Tenants
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id && t.IsActive && !t.IsDeleted && t.IsBiodropsProduction, cancellationToken);

            if (tenant == null)
            {
                return Failure<PublicManufacturerProfileDto>(
                    "Manufacturer not found or not enabled for BioDrops Production.",
                    "Not Found",
                    System.Net.HttpStatusCode.NotFound);
            }

            var profile = await _platformContext.CompanyPublicProfiles
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.TenantId == id, cancellationToken);

            if (profile != null && !profile.IsPublic)
            {
                return Failure<PublicManufacturerProfileDto>(
                    "This manufacturer profile is not publicly visible.",
                    "Not Found",
                    System.Net.HttpStatusCode.NotFound);
            }

            var gallery = await _platformContext.CompanyGalleryImages
                .AsNoTracking()
                .Where(g => g.TenantId == id && !g.IsDeleted && g.IsPublic)
                .OrderBy(g => g.DisplayOrder)
                .ThenBy(g => g.CreatedAt)
                .Select(g => new PublicGalleryImageDto
                {
                    Id = g.Id,
                    Url = g.ImageUrl,
                    Category = g.Category,
                    Caption = g.Caption,
                    Width = g.Width,
                    Height = g.Height,
                    DisplayOrder = g.DisplayOrder
                })
                .ToListAsync(cancellationToken);

            var dto = new PublicManufacturerProfileDto
            {
                Id = tenant.Id,
                Name = tenant.Name,
                DisplayName = profile?.DisplayName ?? tenant.Name,
                Code = tenant.Code,
                LogoUrl = tenant.LogoUrl,
                BadgeLetters = !string.IsNullOrWhiteSpace(tenant.BadgeLetters) ? tenant.BadgeLetters.Trim().ToUpper() : null,
                CoverImageUrl = profile?.CoverImageUrl,
                ShortDescription = profile?.ShortDescription,
                About = profile?.About,
                EstablishedYear = profile?.EstablishedYear,
                Email = profile?.PublicEmail ?? tenant.OwnerEmail,
                Phone = profile?.PublicPhone ?? tenant.OwnerPhone,
                WebsiteUrl = profile?.WebsiteUrl ?? tenant.CustomDomain,
                ContactPerson = profile?.ContactPerson,
                Address = profile?.FullAddress ?? tenant.Address,
                Location = new PublicManufacturerLocationDto
                {
                    FullAddress = profile?.FullAddress ?? tenant.Address,
                    City = profile?.City,
                    District = profile?.District,
                    State = profile?.State,
                    PinCode = profile?.PinCode,
                    GoogleMapsUrl = profile?.GoogleMapsUrl,
                    Latitude = profile?.Latitude,
                    Longitude = profile?.Longitude
                },
                LicenseNumber = tenant.LicenseNumber,
                GstNumber = tenant.GstNumber,
                IsBiodropsProduction = tenant.IsBiodropsProduction,
                FactoryIntroduction = profile?.FactoryIntroduction,
                ProductionFacilityDescription = profile?.ProductionFacilityDescription,
                ManufacturingInfrastructure = profile?.ManufacturingInfrastructure,
                QualityControlFacilities = profile?.QualityControlFacilities,
                Gallery = gallery,
                CreatedAt = tenant.CreatedAt
            };

            return Success(dto, "Public BioDrops manufacturer profile retrieved successfully.");
        }
    }
}
