using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Company
{
    public static class CompanyGalleryCategories
    {
        public static readonly string[] All = new[]
        {
            "COMPANY_LOGO",
            "COMPANY_COVER",
            "FACTORY_EXTERIOR",
            "PRODUCTION_FACILITY",
            "MANUFACTURING_MACHINERY",
            "WATER_PURIFICATION_PLANT",
            "QUALITY_CONTROL_LAB",
            "BOTTLING_FACILITY",
            "OTHER"
        };

        public static string Normalize(string? category)
        {
            if (string.IsNullOrWhiteSpace(category)) return "OTHER";
            var upper = category.Trim().ToUpperInvariant().Replace(" ", "_");
            return Array.IndexOf(All, upper) >= 0 ? upper : "OTHER";
        }
    }

    public class CompanyProfileDto
    {
        public Guid TenantId { get; set; }
        public string TenantName { get; set; } = string.Empty;
        public string TenantCode { get; set; } = string.Empty;
        public string? LogoUrl { get; set; }
        public string? BadgeLetters { get; set; }
        public string? LicenseNumber { get; set; }
        public bool IsBiodropsProduction { get; set; }

        // Editable Public Profile Fields
        public string? DisplayName { get; set; }
        public string? ShortDescription { get; set; }
        public string? About { get; set; }
        public int? EstablishedYear { get; set; }
        public string? CoverImageUrl { get; set; }

        public string? PublicEmail { get; set; }
        public string? PublicPhone { get; set; }
        public string? WebsiteUrl { get; set; }
        public string? ContactPerson { get; set; }

        public string? FullAddress { get; set; }
        public string? City { get; set; }
        public string? District { get; set; }
        public string? State { get; set; }
        public string? PinCode { get; set; }
        public string? GoogleMapsUrl { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }

        public string? FactoryIntroduction { get; set; }
        public string? ProductionFacilityDescription { get; set; }
        public string? ManufacturingInfrastructure { get; set; }
        public string? QualityControlFacilities { get; set; }

        public bool IsPublic { get; set; } = true;
        public DateTime? UpdatedAt { get; set; }
    }

    public class UpdateCompanyProfileRequest
    {
        [MaxLength(200)]
        public string? DisplayName { get; set; }

        [MaxLength(500)]
        public string? ShortDescription { get; set; }

        public string? About { get; set; }

        [Range(1900, 2100)]
        public int? EstablishedYear { get; set; }

        [EmailAddress]
        [MaxLength(200)]
        public string? PublicEmail { get; set; }

        [MaxLength(50)]
        public string? PublicPhone { get; set; }

        [MaxLength(500)]
        public string? WebsiteUrl { get; set; }

        [MaxLength(200)]
        public string? ContactPerson { get; set; }

        [MaxLength(500)]
        public string? FullAddress { get; set; }

        [MaxLength(120)]
        public string? City { get; set; }

        [MaxLength(120)]
        public string? District { get; set; }

        [MaxLength(120)]
        public string? State { get; set; }

        [MaxLength(20)]
        public string? PinCode { get; set; }

        [MaxLength(1000)]
        public string? GoogleMapsUrl { get; set; }

        public double? Latitude { get; set; }
        public double? Longitude { get; set; }

        public string? FactoryIntroduction { get; set; }
        public string? ProductionFacilityDescription { get; set; }
        public string? ManufacturingInfrastructure { get; set; }
        public string? QualityControlFacilities { get; set; }

        public bool IsPublic { get; set; } = true;
    }

    public class CompanyGalleryImageDto
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
        public string Category { get; set; } = "OTHER";
        public string? Caption { get; set; }
        public string? Format { get; set; }
        public long Bytes { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int DisplayOrder { get; set; }
        public bool IsPublic { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class UpdateGalleryImageRequest
    {
        [MaxLength(64)]
        public string? Category { get; set; }

        [MaxLength(300)]
        public string? Caption { get; set; }

        public bool? IsPublic { get; set; }
    }

    public class ReorderGalleryRequest
    {
        [Required]
        public List<Guid> ImageIds { get; set; } = new();
    }
}

