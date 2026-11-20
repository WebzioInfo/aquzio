using System;
using System.Collections.Generic;

namespace Aquora.Domain.Entities.QC
{
    public class QCDefaultParameterDefinition
    {
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty; // PHYSICAL, CHEMICAL, MICROBIOLOGY
        public string Unit { get; set; } = string.Empty;
        public double? MinWarning { get; set; }
        public double? MinAcceptable { get; set; }
        public double? MaxAcceptable { get; set; }
        public double? MaxWarning { get; set; }
        public int DisplayOrder { get; set; }
        public string ResultInputType { get; set; } = "NUMERIC"; // NUMERIC, SELECT_DESCRIPTOR, SELECT_PRESENCE_ABSENCE
        public int RequiredDurationHours { get; set; } = 0; // 0 for immediate, 24/48/72 for incubation/delayed
        public string Frequency { get; set; } = "DAILY"; // DAILY, WEEKLY, MONTHLY
    }

    public static class QCDefaultParameters
    {
        public static readonly IReadOnlyList<QCDefaultParameterDefinition> Catalog = new List<QCDefaultParameterDefinition>
        {
            // Physical & Chemical Parameters (10 Items - Immediate / 0h)
            new() { Name = "pH", Category = "PHYSICAL", Unit = "—", MinWarning = 4.5, MinAcceptable = 6.0, MaxAcceptable = 8.5, MaxWarning = 10.0, DisplayOrder = 1, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "TDS", Category = "PHYSICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 500, MaxWarning = 800, DisplayOrder = 2, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "Turbidity", Category = "PHYSICAL", Unit = "NTU", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 1.0, MaxWarning = 3.0, DisplayOrder = 3, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "Sulphate", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 200, MaxWarning = 300, DisplayOrder = 4, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "Colour", Category = "PHYSICAL", Unit = "Descriptor", MinWarning = null, MinAcceptable = null, MaxAcceptable = null, MaxWarning = null, DisplayOrder = 5, ResultInputType = "SELECT_DESCRIPTOR", RequiredDurationHours = 0 },
            new() { Name = "Odour", Category = "PHYSICAL", Unit = "Descriptor", MinWarning = null, MinAcceptable = null, MaxAcceptable = null, MaxWarning = null, DisplayOrder = 6, ResultInputType = "SELECT_DESCRIPTOR", RequiredDurationHours = 0 },
            new() { Name = "Taste", Category = "PHYSICAL", Unit = "Descriptor", MinWarning = null, MinAcceptable = null, MaxAcceptable = null, MaxWarning = null, DisplayOrder = 7, ResultInputType = "SELECT_DESCRIPTOR", RequiredDurationHours = 0 },
            new() { Name = "Residual Free Chlorine", Category = "CHEMICAL", Unit = "mg/L", MinWarning = null, MinAcceptable = null, MaxAcceptable = 0.2, MaxWarning = null, DisplayOrder = 8, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "Alkalinity", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 200, MaxWarning = 400, DisplayOrder = 9, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },
            new() { Name = "Chloride", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 250, MaxWarning = 500, DisplayOrder = 10, ResultInputType = "NUMERIC", RequiredDurationHours = 0 },

            // Microbiological Parameters (7 Items - Incubated / Delayed)
            new() { Name = "E.coli", Category = "MICROBIOLOGY", Unit = "CFU/100ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 0, MaxWarning = null, DisplayOrder = 11, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 24 },
            new() { Name = "Coliform", Category = "MICROBIOLOGY", Unit = "CFU/100ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 0, MaxWarning = null, DisplayOrder = 12, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 24 },
            new() { Name = "Pseudomonas", Category = "MICROBIOLOGY", Unit = "CFU/250ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 0, MaxWarning = null, DisplayOrder = 13, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 48 },
            new() { Name = "Clostridia", Category = "MICROBIOLOGY", Unit = "CFU/100ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 0, MaxWarning = null, DisplayOrder = 14, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 48 },
            new() { Name = "Aerobic Microbial Count 22°C", Category = "MICROBIOLOGY", Unit = "CFU/ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 100, MaxWarning = null, DisplayOrder = 15, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 72 },
            new() { Name = "Aerobic Microbial Count 37°C", Category = "MICROBIOLOGY", Unit = "CFU/ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 20, MaxWarning = null, DisplayOrder = 16, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 24 },
            new() { Name = "Yeast & Mold", Category = "MICROBIOLOGY", Unit = "CFU/100ml", MinWarning = null, MinAcceptable = 0, MaxAcceptable = 0, MaxWarning = null, DisplayOrder = 17, ResultInputType = "SELECT_PRESENCE_ABSENCE", RequiredDurationHours = 72 },

            // Weekly Chemical Test Parameters (IS 14543)
            new() { Name = "Calcium", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 75, MaxWarning = 100, DisplayOrder = 18, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" },
            new() { Name = "Magnesium", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 30, MaxWarning = 50, DisplayOrder = 19, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" },
            new() { Name = "Aluminium", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 0.03, MaxWarning = 0.05, DisplayOrder = 20, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" },
            new() { Name = "Sulphide", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 0.05, MaxWarning = 0.1, DisplayOrder = 21, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" },
            new() { Name = "Nitrate", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 45, MaxWarning = 50, DisplayOrder = 22, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" },
            new() { Name = "Nitrite", Category = "CHEMICAL", Unit = "mg/L", MinWarning = 0, MinAcceptable = 0, MaxAcceptable = 0.02, MaxWarning = 0.05, DisplayOrder = 23, ResultInputType = "NUMERIC", RequiredDurationHours = 0, Frequency = "WEEKLY" }
        };

        public static string NormalizeKey(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return string.Empty;
            return name.Trim().Replace(" ", "").Replace(".", "").ToLowerInvariant();
        }
    }
}
