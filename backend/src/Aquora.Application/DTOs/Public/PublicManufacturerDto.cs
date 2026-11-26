using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Public
{
    public class PublicManufacturerDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;

        [JsonPropertyName("subdomain")]
        public string Subdomain { get; set; } = string.Empty;

        [JsonPropertyName("customDomain")]
        public string? CustomDomain { get; set; }

        [JsonPropertyName("logoUrl")]
        public string? LogoUrl { get; set; }

        [JsonPropertyName("badgeLetters")]
        public string? BadgeLetters { get; set; }

        [JsonPropertyName("address")]
        public string? Address { get; set; }

        [JsonPropertyName("location")]
        public string? Location { get; set; }

        [JsonPropertyName("licenseNumber")]
        public string? LicenseNumber { get; set; }

        [JsonPropertyName("gstNumber")]
        public string? GstNumber { get; set; }

        [JsonPropertyName("panNumber")]
        public string? PanNumber { get; set; }

        [JsonPropertyName("email")]
        public string? Email { get; set; }

        [JsonPropertyName("phone")]
        public string? Phone { get; set; }

        [JsonPropertyName("isBiodropsProduction")]
        public bool IsBiodropsProduction { get; set; }

        [JsonPropertyName("shortDescription")]
        public string? ShortDescription { get; set; }

        [JsonPropertyName("coverImageUrl")]
        public string? CoverImageUrl { get; set; }

        [JsonPropertyName("city")]
        public string? City { get; set; }

        [JsonPropertyName("state")]
        public string? State { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    public class PublicGalleryImageDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("url")]
        public string Url { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = "OTHER";

        [JsonPropertyName("caption")]
        public string? Caption { get; set; }

        [JsonPropertyName("width")]
        public int Width { get; set; }

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("displayOrder")]
        public int DisplayOrder { get; set; }
    }

    public class PublicManufacturerLocationDto
    {
        [JsonPropertyName("fullAddress")]
        public string? FullAddress { get; set; }

        [JsonPropertyName("city")]
        public string? City { get; set; }

        [JsonPropertyName("district")]
        public string? District { get; set; }

        [JsonPropertyName("state")]
        public string? State { get; set; }

        [JsonPropertyName("pinCode")]
        public string? PinCode { get; set; }

        [JsonPropertyName("googleMapsUrl")]
        public string? GoogleMapsUrl { get; set; }

        [JsonPropertyName("latitude")]
        public double? Latitude { get; set; }

        [JsonPropertyName("longitude")]
        public double? Longitude { get; set; }
    }

    public class PublicManufacturerProfileDto
    {
        [JsonPropertyName("id")]
        public Guid Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string? DisplayName { get; set; }

        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;

        [JsonPropertyName("logoUrl")]
        public string? LogoUrl { get; set; }

        [JsonPropertyName("badgeLetters")]
        public string? BadgeLetters { get; set; }

        [JsonPropertyName("coverImageUrl")]
        public string? CoverImageUrl { get; set; }

        [JsonPropertyName("shortDescription")]
        public string? ShortDescription { get; set; }

        [JsonPropertyName("about")]
        public string? About { get; set; }

        [JsonPropertyName("establishedYear")]
        public int? EstablishedYear { get; set; }

        [JsonPropertyName("email")]
        public string? Email { get; set; }

        [JsonPropertyName("phone")]
        public string? Phone { get; set; }

        [JsonPropertyName("websiteUrl")]
        public string? WebsiteUrl { get; set; }

        [JsonPropertyName("contactPerson")]
        public string? ContactPerson { get; set; }

        [JsonPropertyName("address")]
        public string? Address { get; set; }

        [JsonPropertyName("location")]
        public PublicManufacturerLocationDto Location { get; set; } = new();

        [JsonPropertyName("licenseNumber")]
        public string? LicenseNumber { get; set; }

        [JsonPropertyName("gstNumber")]
        public string? GstNumber { get; set; }

        [JsonPropertyName("isBiodropsProduction")]
        public bool IsBiodropsProduction { get; set; }

        [JsonPropertyName("factoryIntroduction")]
        public string? FactoryIntroduction { get; set; }

        [JsonPropertyName("productionFacilityDescription")]
        public string? ProductionFacilityDescription { get; set; }

        [JsonPropertyName("manufacturingInfrastructure")]
        public string? ManufacturingInfrastructure { get; set; }

        [JsonPropertyName("qualityControlFacilities")]
        public string? QualityControlFacilities { get; set; }

        [JsonPropertyName("gallery")]
        public List<PublicGalleryImageDto> Gallery { get; set; } = new();

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}
