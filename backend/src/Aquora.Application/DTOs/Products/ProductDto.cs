using System;

namespace Aquora.Application.DTOs.Products
{
    public class ProductDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Guid BrandId { get; set; }
        public string BrandName { get; set; } = string.Empty;
        public string? SKU { get; set; }
        public bool IsActive { get; set; }
        public decimal CurrentStock { get; set; }
        public decimal SellingPrice { get; set; } = 15.0m;
        public decimal CostPrice { get; set; } = 10.0m;
        public decimal UnitCost { get; set; } = 10.0m;
        public decimal? GstRate { get; set; }
        public string Category { get; set; } = "Bottle";
        public int DisplayOrder { get; set; }
        public string? BottleSize { get; set; }
        public string? ImageUrl { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
    }
}
