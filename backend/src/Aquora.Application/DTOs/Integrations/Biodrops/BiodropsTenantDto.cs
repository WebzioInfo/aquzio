using System;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Integrations.Biodrops
{
    /// <summary>
    /// Tenant information eligible for Biodrops Production integration.
    /// Only tenants where IsBiodropsProduction is enabled are returned.
    /// </summary>
    public class BiodropsTenantDto
    {
        [JsonPropertyName("tenantId")]
        public Guid TenantId { get; set; }

        [JsonPropertyName("companyName")]
        public string CompanyName { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("code")]
        public string Code { get; set; } = string.Empty;

        [JsonPropertyName("subdomain")]
        public string Subdomain { get; set; } = string.Empty;

        [JsonPropertyName("isBiodropsProduction")]
        public bool IsBiodropsProduction { get; set; }

        [JsonPropertyName("createdAtUtc")]
        public DateTime CreatedAtUtc { get; set; }
    }
}

