using System;
using System.ComponentModel.DataAnnotations;
using Aquora.Domain.Common;

namespace Aquora.Domain.Entities
{
    public class CompanyPublicProfile : BaseEntity, IAuditable
    {
        public Guid TenantId { get; set; }
        public virtual Tenant Tenant { get; set; } = null!;

        // Basic Public Information
        [MaxLength(200)]
        public string? DisplayName { get; set; }

        [MaxLength(500)]
        public string? ShortDescription { get; set; }

        public string? About { get; set; }
        public int? EstablishedYear { get; set; }

        [MaxLength(1000)]
        public string? CoverImageUrl { get; set; }

        [MaxLength(500)]
        public string? CoverImagePublicId { get; set; }

        // Public Contact Information
        [MaxLength(200)]
        public string? PublicEmail { get; set; }

        [MaxLength(50)]
        public string? PublicPhone { get; set; }

        [MaxLength(500)]
        public string? WebsiteUrl { get; set; }

        [MaxLength(200)]
        public string? ContactPerson { get; set; }

        // Location Information
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

        // Manufacturing Information
        public string? FactoryIntroduction { get; set; }
        public string? ProductionFacilityDescription { get; set; }
        public string? ManufacturingInfrastructure { get; set; }
        public string? QualityControlFacilities { get; set; }

        public bool IsPublic { get; set; } = true;

        // Auditable fields
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = "System";
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
        public string? CreatedByIP { get; set; }
        public string? UpdatedByIP { get; set; }
    }
}

