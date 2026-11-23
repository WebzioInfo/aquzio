using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.Interfaces;
using Aquora.Domain.Entities.QC;

namespace Aquora.Application.Services
{
    public static class QCDataSeeder
    {
        public static async Task<int> SeedQCDefaultParametersAsync(ITenantDbContext tenantContext, string createdBy = "System Seeder")
        {
            if (tenantContext == null) throw new ArgumentNullException(nameof(tenantContext));

            var existingParams = await tenantContext.WaterTestParameters.ToListAsync();
            var existingMap = new Dictionary<string, WaterTestParameter>(StringComparer.OrdinalIgnoreCase);

            foreach (var p in existingParams)
            {
                if (!string.IsNullOrWhiteSpace(p.Name))
                {
                    existingMap[p.Name.Trim()] = p;
                    var norm = QCDefaultParameters.NormalizeKey(p.Name);
                    if (!string.IsNullOrWhiteSpace(norm) && !existingMap.ContainsKey(norm))
                    {
                        existingMap[norm] = p;
                    }
                }
            }

            int addedCount = 0;
            int updatedCount = 0;

            foreach (var def in QCDefaultParameters.Catalog)
            {
                var normKey = QCDefaultParameters.NormalizeKey(def.Name);
                if (existingMap.TryGetValue(def.Name, out var existing) || existingMap.TryGetValue(normKey, out existing))
                {
                    // Existing parameter found; check if repairs are needed
                    bool changed = false;

                    if (!existing.IsActive)
                    {
                        existing.IsActive = true;
                        changed = true;
                    }

                    if (string.IsNullOrWhiteSpace(existing.Category) || !existing.Category.Equals(def.Category, StringComparison.OrdinalIgnoreCase))
                    {
                        existing.Category = def.Category;
                        changed = true;
                    }

                    if ((string.IsNullOrWhiteSpace(existing.Unit) || existing.Unit == "—") && def.Unit != "—")
                    {
                        existing.Unit = def.Unit;
                        changed = true;
                    }

                    if (!existing.MinWarning.HasValue && def.MinWarning.HasValue)
                    {
                        existing.MinWarning = def.MinWarning;
                        changed = true;
                    }

                    if (!existing.MinAcceptable.HasValue && def.MinAcceptable.HasValue)
                    {
                        existing.MinAcceptable = def.MinAcceptable;
                        changed = true;
                    }

                    if (!existing.MaxAcceptable.HasValue && def.MaxAcceptable.HasValue)
                    {
                        existing.MaxAcceptable = def.MaxAcceptable;
                        changed = true;
                    }

                    if (existing.RequiredDurationHours == 0 && def.RequiredDurationHours > 0)
                    {
                        existing.RequiredDurationHours = def.RequiredDurationHours;
                        changed = true;
                    }

                    if (string.IsNullOrWhiteSpace(existing.Frequency))
                    {
                        existing.Frequency = def.Frequency ?? "DAILY";
                        changed = true;
                    }

                    if (changed)
                    {
                        existing.UpdatedAt = DateTime.UtcNow;
                        existing.UpdatedBy = createdBy;
                        updatedCount++;
                    }
                }
                else
                {
                    // Missing parameter; create new canonical record
                    var newParam = new WaterTestParameter
                    {
                        Id = Guid.NewGuid(),
                        Name = def.Name,
                        Category = def.Category,
                        Unit = def.Unit,
                        MinWarning = def.MinWarning,
                        MinAcceptable = def.MinAcceptable,
                        MaxAcceptable = def.MaxAcceptable,
                        MaxWarning = def.MaxWarning,
                        RequiredDurationHours = def.RequiredDurationHours,
                        Frequency = def.Frequency ?? "DAILY",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = createdBy
                    };

                    tenantContext.WaterTestParameters.Add(newParam);
                    existingMap[def.Name] = newParam;
                    existingMap[normKey] = newParam;
                    addedCount++;
                }
            }

            // Ensure QCSettings entity exists
            var existingSettings = await tenantContext.QCSettings.FirstOrDefaultAsync();
            if (existingSettings == null)
            {
                var company = await tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                if (company != null)
                {
                    tenantContext.QCSettings.Add(new QCSettings
                    {
                        Id = Guid.NewGuid(),
                        TenantId = company.TenantId,
                        CompanyId = company.Id,
                        AutoGenerateCAPAOnFailure = true,
                        RequireVerificationBeforeSubmit = false,
                        StandardComplianceType = "BIS_IS_14543",
                        DigitalSignatureTitle = "Quality Assurance Manager",
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = createdBy
                    });
                }
            }

            if (addedCount > 0 || updatedCount > 0 || existingSettings == null)
            {
                await tenantContext.SaveChangesAsync();
            }

            return addedCount;
        }
    }
}
