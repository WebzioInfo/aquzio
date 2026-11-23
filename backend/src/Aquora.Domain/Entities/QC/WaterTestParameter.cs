using System;
using System.Collections.Generic;
using Aquora.Domain.Common;

namespace Aquora.Domain.Entities.QC
{
    public class WaterTestParameter : BaseEntity, IAuditable
    {
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty; // PHYSICAL, CHEMICAL, MICROBIOLOGY
        public string Frequency { get; set; } = "DAILY"; // DAILY, WEEKLY, MONTHLY
        public string Unit { get; set; } = string.Empty;
        public double? MinWarning { get; set; }
        public double? MinAcceptable { get; set; }
        public double? MaxAcceptable { get; set; }
        public double? MaxWarning { get; set; }
        public int RequiredDurationHours { get; set; } = 0; // 0 for immediate, 24/48/72 for incubation/delayed
        public bool IsActive { get; set; } = true;

        public virtual ICollection<WaterTestResult> Results { get; set; } = new List<WaterTestResult>();

        // Auditable fields
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
        public string? CreatedByIP { get; set; }
        public string? UpdatedByIP { get; set; }
    }
}
