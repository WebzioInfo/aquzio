using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Aquora.Application.DTOs.Integrations.Biodrops
{
    /// <summary>
    /// Complete Biodrops Production inventory for a tenant.
    /// </summary>
    public class BiodropsInventoryDto
    {
        [JsonPropertyName("tenantId")]
        public Guid TenantId { get; set; }

        [JsonPropertyName("companyName")]
        public string CompanyName { get; set; } = string.Empty;

        [JsonPropertyName("inventoryTimestampUtc")]
        public DateTime InventoryTimestampUtc { get; set; }

        [JsonPropertyName("finishedProducts")]
        public List<BiodropsProductStockDto> FinishedProducts { get; set; } = new();

        [JsonPropertyName("rawMaterials")]
        public List<BiodropsRawMaterialStockDto> RawMaterials { get; set; } = new();
    }

    /// <summary>
    /// 20L Jar finished product inventory details.
    /// </summary>
    public class BiodropsProductStockDto
    {
        [JsonPropertyName("productId")]
        public Guid ProductId { get; set; }

        [JsonPropertyName("productName")]
        public string ProductName { get; set; } = string.Empty;

        [JsonPropertyName("sku")]
        public string? Sku { get; set; }

        [JsonPropertyName("productCategory")]
        public string ProductCategory { get; set; } = string.Empty;

        [JsonPropertyName("availableStock")]
        public decimal AvailableStock { get; set; }

        [JsonPropertyName("reservedStock")]
        public decimal ReservedStock { get; set; }

        [JsonPropertyName("damagedStock")]
        public decimal DamagedStock { get; set; }

        [JsonPropertyName("unit")]
        public string Unit { get; set; } = "Jar";

        [JsonPropertyName("lastUpdatedUtc")]
        public DateTime? LastUpdatedUtc { get; set; }

        [JsonPropertyName("lastUpdatedBy")]
        public string? LastUpdatedBy { get; set; }

        [JsonPropertyName("lastSource")]
        public string? LastSource { get; set; }

        [JsonPropertyName("lastMovementNotes")]
        public string? LastMovementNotes { get; set; }
    }

    /// <summary>
    /// Raw material stock and consumption tracking details.
    /// </summary>
    public class BiodropsRawMaterialStockDto
    {
        [JsonPropertyName("materialId")]
        public Guid MaterialId { get; set; }

        [JsonPropertyName("materialName")]
        public string MaterialName { get; set; } = string.Empty;

        [JsonPropertyName("sku")]
        public string Sku { get; set; } = string.Empty;

        [JsonPropertyName("materialCategory")]
        public string MaterialCategory { get; set; } = string.Empty;

        [JsonPropertyName("availableQuantity")]
        public decimal AvailableQuantity { get; set; }

        [JsonPropertyName("usedQuantity")]
        public decimal UsedQuantity { get; set; }

        [JsonPropertyName("wastedQuantity")]
        public decimal WastedQuantity { get; set; }

        [JsonPropertyName("configuredUnit")]
        public string ConfiguredUnit { get; set; } = string.Empty;

        [JsonPropertyName("reorderLevel")]
        public decimal? ReorderLevel { get; set; }

        [JsonPropertyName("lastUpdatedUtc")]
        public DateTime? LastUpdatedUtc { get; set; }

        [JsonPropertyName("lastUpdatedBy")]
        public string? LastUpdatedBy { get; set; }

        [JsonPropertyName("lastSource")]
        public string? LastSource { get; set; }

        [JsonPropertyName("lastMovementNotes")]
        public string? LastMovementNotes { get; set; }
    }
}

