using System;
using System.ComponentModel.DataAnnotations;

namespace Aquora.Application.DTOs.Integrations.Biodrops
{
    /// <summary>
    /// Payload sent by eDrops to adjust stock in an authorized Aquzio manufacturing tenant.
    /// </summary>
    public class BiodropsStockAdjustmentRequestDto
    {
        [Required]
        public Guid TenantId { get; set; }

        [Required]
        public string Sku { get; set; } = string.Empty;

        [Required]
        public string ItemType { get; set; } = string.Empty; // "RAW_MATERIAL" or "FINISHED_PRODUCT" / "PRODUCT"

        [Required]
        public string Action { get; set; } = string.Empty; // "ADD", "SET", "DEDUCT"

        [Range(0, double.MaxValue, ErrorMessage = "Quantity must be greater than or equal to 0.")]
        public decimal Quantity { get; set; }

        /// <summary>
        /// Asserted new balance sent by client. Ignored by Aquzio for authoritative balance calculation.
        /// </summary>
        public decimal? CalculatedNewQuantity { get; set; }

        [Required]
        public string Unit { get; set; } = string.Empty;

        public string? MovementType { get; set; } = "EDROPS_ADJUSTMENT";

        public string? Description { get; set; }

        public string? Reason { get; set; }

        public string? Notes { get; set; }

        public string? Operator { get; set; }

        public string? Reference { get; set; }

        public DateTime? AdjustedAt { get; set; }
    }

    /// <summary>
    /// Authoritative committed stock adjustment result returned by Aquzio to eDrops.
    /// </summary>
    public class BiodropsStockAdjustmentResultDto
    {
        public Guid TransactionId { get; set; }

        public Guid MovementId { get; set; }

        public Guid TenantId { get; set; }

        public string Sku { get; set; } = string.Empty;

        public string ItemType { get; set; } = string.Empty;

        public string Action { get; set; } = string.Empty;

        public decimal PreviousQuantity { get; set; }

        public decimal AdjustmentQuantity { get; set; }

        public decimal NewQuantity { get; set; }

        public string Unit { get; set; } = string.Empty;

        public string Source { get; set; } = "EDROPS";

        public string Reference { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; }
    }
}
