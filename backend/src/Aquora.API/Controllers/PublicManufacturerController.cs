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
    }
}
