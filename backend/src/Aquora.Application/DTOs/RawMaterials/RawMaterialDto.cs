using System;

namespace Aquora.Application.DTOs.RawMaterials
{
    public class RawMaterialDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Unit { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public decimal CurrentStock { get; set; }
        public decimal CostPerUnit { get; set; } = 5.0m;
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
    }
}
