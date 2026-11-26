using System;
using System.ComponentModel.DataAnnotations;
using Aquora.Domain.Common;

namespace Aquora.Domain.Entities
{
    public class CompanyGalleryImage : BaseEntity, IAuditable, ISoftDelete
    {
        public Guid TenantId { get; set; }
        public virtual Tenant Tenant { get; set; } = null!;

        [MaxLength(500)]
        public string StorageKey { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string ImageUrl { get; set; } = string.Empty;

        [MaxLength(64)]
        public string Category { get; set; } = "OTHER";

        [MaxLength(300)]
        public string? Caption { get; set; }

        [MaxLength(20)]
        public string? Format { get; set; }

        public long Bytes { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }

        public int DisplayOrder { get; set; }
        public bool IsPublic { get; set; } = true;

        // Auditable fields
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = "System";
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
        public string? CreatedByIP { get; set; }
        public string? UpdatedByIP { get; set; }

        // Soft Delete fields
        public bool IsDeleted { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}

