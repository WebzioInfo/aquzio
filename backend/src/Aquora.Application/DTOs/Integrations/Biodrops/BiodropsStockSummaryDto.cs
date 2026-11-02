using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Integrations.Biodrops
{
    /// <summary>
    /// Stock summary for a Biodrops Production tenant.
    /// Never combines quantities of different units.
    /// </summary>
    public class BiodropsStockSummaryDto
    {
        [JsonPropertyName("tenantId")]
        public Guid TenantId { get; set; }

        [JsonPropertyName("companyName")]
        public string CompanyName { get; set; } = string.Empty;

        [JsonPropertyName("totalTwentyLStock")]
        public decimal TotalTwentyLStock { get; set; }

        [JsonPropertyName("totalTwentyLUnit")]
        public string TotalTwentyLUnit { get; set; } = "Jar";

        [JsonPropertyName("rawMaterials")]
        public List<BiodropsRawMaterialSummaryItemDto> RawMaterials { get; set; } = new();

        [JsonPropertyName("rawMaterialStockByUnit")]
        public List<BiodropsUnitGroupSummaryDto> RawMaterialStockByUnit { get; set; } = new();

        [JsonPropertyName("inventorySummaryTimestampUtc")]
        public DateTime InventorySummaryTimestampUtc { get; set; }
    }

    /// <summary>
    /// Individual raw material item with its distinct unit of measure.
    /// </summary>
    public class BiodropsRawMaterialSummaryItemDto
    {
        [JsonPropertyName("materialId")]
        public Guid MaterialId { get; set; }

        [JsonPropertyName("materialName")]
        public string MaterialName { get; set; } = string.Empty;

        [JsonPropertyName("sku")]
        public string Sku { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("totalQuantity")]
        public decimal TotalQuantity { get; set; }

        [JsonPropertyName("unit")]
        public string Unit { get; set; } = string.Empty;
    }

    /// <summary>
    /// Raw material stock aggregated strictly by the exact same unit.
    /// </summary>
    public class BiodropsUnitGroupSummaryDto
    {
        [JsonPropertyName("unit")]
        public string Unit { get; set; } = string.Empty;

        [JsonPropertyName("totalQuantity")]
        public decimal TotalQuantity { get; set; }

        [JsonPropertyName("itemCount")]
        public int ItemCount { get; set; }
    }
}
