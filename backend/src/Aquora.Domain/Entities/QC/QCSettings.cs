using System;
using Aquora.Domain.Common;

namespace Aquora.Domain.Entities.QC
{
    public class QCSettings : BaseEntity, IMultiTenant, ICompanySpecific, IAuditable
    {
        public Guid TenantId { get; set; }
        public Guid CompanyId { get; set; }
        public virtual Company Company { get; set; } = null!;

        public bool AutoGenerateCAPAOnFailure { get; set; } = true;
        public bool RequireVerificationBeforeSubmit { get; set; } = false;
        public string StandardComplianceType { get; set; } = "BIS_IS_14543"; // BIS Drinking Water Standard
        public string DigitalSignatureTitle { get; set; } = "Quality Assurance Manager";
        public string LabAddress { get; set; } = string.Empty;
        public string ContactEmail { get; set; } = string.Empty;
        public string NotificationRecipients { get; set; } = string.Empty; // Comma separated emails/users

        // Regulatory & Plant Licenses
        public string? FssaiNumber { get; set; }
        public string? BisNumber { get; set; }
        public string? AdditionalLicensesJson { get; set; } // JSON array of custom licenses [{ "name": "...", "number": "..." }]

        // Auditable fields
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
        public string? CreatedByIP { get; set; }
        public string? UpdatedByIP { get; set; }
    }
}
