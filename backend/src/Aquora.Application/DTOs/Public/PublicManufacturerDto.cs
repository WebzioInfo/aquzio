using System;
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

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }
}
