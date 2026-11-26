using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Aquora.Application.DTOs.Public;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.QC;

namespace Aquora.Application.Services
{
    public class PublicWaterVerificationService : IPublicWaterVerificationService
    {
        private readonly ITenantProvider _tenantProvider;
        private readonly IPlatformDbContext _platformContext;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<PublicWaterVerificationService> _logger;

        public PublicWaterVerificationService(
            ITenantProvider tenantProvider,
            IPlatformDbContext platformContext,
            IServiceScopeFactory scopeFactory,
            ILogger<PublicWaterVerificationService> logger)
        {
            _tenantProvider = tenantProvider;
            _platformContext = platformContext;
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        public Task<PublicBatchVerificationResponseDto> VerifyBatchAsync(string batchNumber, bool full = false, CancellationToken cancellationToken = default)
        {
            return VerifyBatchAsync(batchNumber, full, null, null, null, cancellationToken);
        }

        public async Task<PublicBatchVerificationResponseDto> VerifyBatchAsync(
            string batchNumber,
            bool full,
            string? reportType,
            Guid? tenantId,
            string? tenantCode,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(batchNumber))
            {
                return new PublicBatchVerificationResponseDto
                {
                    Success = false,
                    Verified = false,
                    Code = "INVALID_BATCH_NUMBER",
                    Message = "The batch number must be provided."
                };
            }

            var normalizedBatch = batchNumber.Trim().ToLowerInvariant();
            var normalizedReportType = string.IsNullOrWhiteSpace(reportType) ? null : reportType.Trim().ToUpperInvariant();

            try
            {
                // 0. If explicit tenantId or tenantCode is provided, restrict lookup strictly to that tenant
                if (tenantId.HasValue || !string.IsNullOrWhiteSpace(tenantCode))
                {
                    var normalizedTenantCode = tenantCode?.Trim().ToLowerInvariant();
                    var explicitTenant = await _platformContext.Tenants.AsNoTracking()
                        .FirstOrDefaultAsync(t =>
                            t.IsActive &&
                            !t.IsDeleted &&
                            t.IsBiodropsProduction &&
                            !string.IsNullOrWhiteSpace(t.SchemaName) &&
                            t.SchemaName != "public" &&
                            (tenantId.HasValue
                                ? t.Id == tenantId.Value
                                : (!string.IsNullOrWhiteSpace(t.Code) && t.Code.ToLower() == normalizedTenantCode) ||
                                  (!string.IsNullOrWhiteSpace(t.Subdomain) && t.Subdomain.ToLower() == normalizedTenantCode)),
                            cancellationToken);

                    if (explicitTenant == null)
                    {
                        return new PublicBatchVerificationResponseDto
                        {
                            Success = false,
                            Verified = false,
                            Code = "BATCH_NOT_FOUND",
                            Message = "No matching company or water quality report found for this batch number."
                        };
                    }

                    var explicitResult = await VerifyBatchInTenantScopeAsync(explicitTenant, normalizedBatch, batchNumber, full, normalizedReportType, cancellationToken);
                    if (explicitResult != null)
                    {
                        return explicitResult;
                    }

                    return new PublicBatchVerificationResponseDto
                    {
                        Success = false,
                        Verified = false,
                        Code = "BATCH_NOT_FOUND",
                        Message = "No matching water quality report found for this batch number in the specified company."
                    };
                }

                // 1. Check if a specific tenant schema is already resolved (e.g. via host header, X-Tenant-Id, etc.)
                var currentSchema = _tenantProvider.TenantSchemaName;
                if (!string.IsNullOrWhiteSpace(currentSchema) && !currentSchema.Equals("public", StringComparison.OrdinalIgnoreCase))
                {
                    var preResolvedTenant = await _platformContext.Tenants.AsNoTracking()
                        .FirstOrDefaultAsync(t => t.Id == _tenantProvider.TenantId && t.IsActive && !t.IsDeleted && t.IsBiodropsProduction, cancellationToken);
                    if (preResolvedTenant != null)
                    {
                        var result = await VerifyBatchInTenantScopeAsync(preResolvedTenant, normalizedBatch, batchNumber, full, normalizedReportType, cancellationToken);
                        if (result != null)
                        {
                            return result;
                        }
                    }
                }

                // 2. Search across active BioDrops production tenant schemas
                var activeTenants = await _platformContext.Tenants
                    .AsNoTracking()
                    .Where(t => t.IsActive && !t.IsDeleted && t.IsBiodropsProduction && !string.IsNullOrWhiteSpace(t.SchemaName) && t.SchemaName != "public")
                    .ToListAsync(cancellationToken);

                bool anyProductionBatchFound = false;
                var verifiedMatches = new List<PublicBatchVerificationResponseDto>();

                foreach (var tenant in activeTenants)
                {
                    try
                    {
                        var tenantResult = await VerifyBatchInTenantScopeAsync(tenant, normalizedBatch, batchNumber, full, normalizedReportType, cancellationToken);
                        if (tenantResult != null)
                        {
                            if (tenantResult.Code == "REPORT_NOT_PUBLIC")
                            {
                                anyProductionBatchFound = true;
                            }
                            else if (tenantResult.Success && tenantResult.Verified)
                            {
                                verifiedMatches.Add(tenantResult);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[PUBLIC BATCH VERIFICATION ERROR] Failed querying tenant schema '{Schema}' for batch '{BatchNumber}'. Error: {Message}",
                            tenant.SchemaName, batchNumber, ex.Message);
                    }
                }

                if (verifiedMatches.Count > 1)
                {
                    _logger.LogWarning("[PUBLIC BATCH VERIFICATION] Ambiguous batch number '{BatchNumber}' matched {Count} Biodrops tenants.",
                        batchNumber, verifiedMatches.Count);

                    return new PublicBatchVerificationResponseDto
                    {
                        Success = false,
                        Verified = false,
                        Code = "AMBIGUOUS_BATCH_NUMBER",
                        Message = "Multiple companies have a water test report for this batch number. Please specify tenantId or tenantCode."
                    };
                }

                if (verifiedMatches.Count == 1)
                {
                    return verifiedMatches[0];
                }

                if (anyProductionBatchFound)
                {
                    return new PublicBatchVerificationResponseDto
                    {
                        Success = true,
                        Verified = false,
                        Code = "REPORT_NOT_PUBLIC",
                        Message = "No publicly verified water quality report is currently available for this batch."
                    };
                }

                _logger.LogInformation("[PUBLIC BATCH SEARCH] Batch '{BatchNumber}' not found across active tenant database schemas.", batchNumber);

                return new PublicBatchVerificationResponseDto
                {
                    Success = false,
                    Verified = false,
                    Code = "BATCH_NOT_FOUND",
                    Message = "The batch number could not be verified."
                };
            }
            catch (DbUpdateException dbEx)
            {
                _logger.LogError(dbEx, "[PUBLIC BATCH VERIFICATION EF ERROR] Database exception for batch {BatchNumber}: {Message}", batchNumber, dbEx.Message);

                return new PublicBatchVerificationResponseDto
                {
                    Success = false,
                    Verified = false,
                    Code = "SERVER_ERROR",
                    Message = "An internal database error occurred while processing your verification request."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PUBLIC BATCH VERIFICATION SYSTEM ERROR] Unexpected error for batch {BatchNumber}: {Message}", batchNumber, ex.Message);

                return new PublicBatchVerificationResponseDto
                {
                    Success = false,
                    Verified = false,
                    Code = "SERVER_ERROR",
                    Message = "An internal error occurred while processing your verification request."
                };
            }
        }

        private async Task<PublicBatchVerificationResponseDto?> VerifyBatchInTenantScopeAsync(
            Tenant platformTenant,
            string normalizedBatch,
            string originalBatchNumber,
            bool full,
            string? normalizedReportType,
            CancellationToken cancellationToken)
        {
            if (platformTenant == null || !platformTenant.IsBiodropsProduction || !platformTenant.IsActive || platformTenant.IsDeleted)
            {
                return null;
            }

            using var scope = _scopeFactory.CreateScope();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ITenantProvider>();
            tenantProvider.SetTenantId(platformTenant.Id);
            tenantProvider.SetTenantSchemaName(platformTenant.SchemaName);

            var dbContext = scope.ServiceProvider.GetRequiredService<ITenantDbContext>();

            var schemaName = platformTenant.SchemaName;

            var rawBatch = normalizedBatch
                .Replace("batch-", "", StringComparison.OrdinalIgnoreCase)
                .Replace("b-", "", StringComparison.OrdinalIgnoreCase)
                .Trim();

            var batchVariants = new[] {
                normalizedBatch,
                rawBatch,
                "b-" + rawBatch,
                "batch-" + rawBatch
            }.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.ToLowerInvariant()).Distinct().ToList();

            var v0 = batchVariants.ElementAtOrDefault(0) ?? string.Empty;
            var v1 = batchVariants.ElementAtOrDefault(1) ?? v0;
            var v2 = batchVariants.ElementAtOrDefault(2) ?? v0;
            var v3 = batchVariants.ElementAtOrDefault(3) ?? v0;

            // 1. Query matching active (non-deleted) reports associated with this batch number directly from tenant schema
            var reports = await dbContext.WaterTestReports
                .FromSqlRaw(
                    $"SELECT * FROM \"{schemaName}\".\"WaterTestReports\" WHERE \"IsDeleted\" = false AND \"IsActive\" = true AND LOWER(TRIM(\"BatchNumber\")) IN ({{0}}, {{1}}, {{2}}, {{3}})",
                    v0, v1, v2, v3)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            reports = reports
                .Where(r => string.IsNullOrWhiteSpace(normalizedReportType) ||
                            string.Equals(r.ReportType?.Trim(), normalizedReportType, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(r => r.SampleTime ?? r.CreatedAt)
                .ThenByDescending(r => r.CreatedAt)
                .ToList();

            if (!reports.Any())
            {
                var matchingProdBatches = await dbContext.ProductionBatches
                    .FromSqlRaw(
                        $"SELECT * FROM \"{schemaName}\".\"ProductionBatches\" WHERE \"IsDeleted\" = false AND LOWER(TRIM(\"BatchNumber\")) IN ({{0}}, {{1}}, {{2}}, {{3}})",
                        v0, v1, v2, v3)
                    .AsNoTracking()
                    .ToListAsync(cancellationToken);

                var productionBatchExists = matchingProdBatches.Any();

                if (productionBatchExists)
                {
                    return new PublicBatchVerificationResponseDto
                    {
                        Success = true,
                        Verified = false,
                        Code = "REPORT_NOT_PUBLIC",
                        Message = "No publicly verified water quality report is currently available for this batch."
                    };
                }

                return null;
            }

            // 2. Select the latest report with an eligible public status (SUBMITTED, APPROVED, REVIEWED, PUBLISHED)
            var eligibleReport = reports.FirstOrDefault(r => {
                var s = (r.Status ?? "DRAFT").Trim().ToUpperInvariant();
                return s == "SUBMITTED" || s == "APPROVED" || s == "REVIEWED" || s == "PUBLISHED";
            });

            if (eligibleReport == null)
            {
                _logger.LogInformation("[PUBLIC BATCH SEARCH] Tenant '{Schema}': Batch '{BatchNumber}' has {Count} report(s), but none are in an eligible public status.",
                    schemaName, originalBatchNumber, reports.Count);

                return new PublicBatchVerificationResponseDto
                {
                    Success = true,
                    Verified = false,
                    Code = "REPORT_NOT_PUBLIC",
                    Message = "No publicly verified water quality report is currently available for this batch."
                };
            }

            var report = eligibleReport;

            // Load results and parameters explicitly from tenant schema
            var resultsList = await dbContext.WaterTestResults
                .FromSqlRaw($"SELECT * FROM \"{schemaName}\".\"WaterTestResults\" WHERE \"ReportId\" = {{0}}", report.Id)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            var paramsList = await dbContext.WaterTestParameters
                .FromSqlRaw($"SELECT * FROM \"{schemaName}\".\"WaterTestParameters\"")
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            var paramsDict = paramsList.ToDictionary(p => p.Id, p => p);
            foreach (var res in resultsList)
            {
                if (paramsDict.TryGetValue(res.ParameterId, out var pObj))
                {
                    res.Parameter = pObj;
                }
            }
            report.Results = resultsList;

            QCSettings? qcSettings = null;
            try
            {
                qcSettings = await dbContext.QCSettings
                    .FromSqlRaw($"SELECT * FROM \"{schemaName}\".\"QCSettings\" WHERE \"TenantId\" = '{report.TenantId}'")
                    .AsNoTracking()
                    .FirstOrDefaultAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[PUBLIC BATCH VERIFICATION] Could not query QCSettings for schema {Schema}: {Message}. Attempting auto-repair...", schemaName, ex.Message);
                try
                {
                    await dbContext.Database.ExecuteSqlRawAsync(
                        $"ALTER TABLE \"{schemaName}\".\"QCSettings\" ADD COLUMN IF NOT EXISTS \"FssaiNumber\" text NULL; " +
                        $"ALTER TABLE \"{schemaName}\".\"QCSettings\" ADD COLUMN IF NOT EXISTS \"BisNumber\" text NULL; " +
                        $"ALTER TABLE \"{schemaName}\".\"QCSettings\" ADD COLUMN IF NOT EXISTS \"AdditionalLicensesJson\" text NULL;",
                        cancellationToken);

                    qcSettings = await dbContext.QCSettings
                        .FromSqlRaw($"SELECT * FROM \"{schemaName}\".\"QCSettings\" WHERE \"TenantId\" = '{report.TenantId}'")
                        .AsNoTracking()
                        .FirstOrDefaultAsync(cancellationToken);
                }
                catch (Exception repairEx)
                {
                    _logger.LogError(repairEx, "[PUBLIC BATCH VERIFICATION] Auto-repair of QCSettings columns failed for schema {Schema}", schemaName);
                }
            }

            var allProdBatchesForReport = await dbContext.ProductionBatches
                .FromSqlRaw($"SELECT * FROM \"{schemaName}\".\"ProductionBatches\" WHERE \"TenantId\" = '{report.TenantId}' AND \"IsDeleted\" = false")
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            var prodBatch = allProdBatchesForReport.FirstOrDefault(b => !string.IsNullOrWhiteSpace(b.BatchNumber) && batchVariants.Contains(b.BatchNumber.Trim().ToLowerInvariant()));

            DateTime mfgDateVal = report.ProductionDate 
                ?? report.SampleTime 
                ?? prodBatch?.StartedAt 
                ?? report.CreatedAt;

            DateTime expiryDateVal = mfgDateVal.AddMonths(6);

            string? phVal = null;
            string? tdsVal = null;
            string? turbidityVal = null;
            string? colourVal = null;
            string? odourVal = null;
            string? tasteVal = null;
            string? sulphateVal = null;
            string? chlorideVal = null;
            string? alkalinityVal = null;
            string? chlorineVal = null;
            string? ecoliVal = null;
            string? coliformVal = null;
            string? pseudomonasVal = null;
            string? clostridiaVal = null;
            string? amc22Val = null;
            string? amc37Val = null;
            string? yeastMoldVal = null;
            bool microFailed = false;
            bool microPending = false;
            bool sterilizationFailed = false;
            bool sterilizationPending = false;

            var parameterDtos = new List<PublicWaterTestParameterDto>();
            var utcNow = DateTime.UtcNow;

            if (report.Results != null)
            {
                foreach (var res in report.Results)
                {
                    var pName = res.Parameter?.Name?.ToLowerInvariant().Trim() ?? string.Empty;
                    var paramDisplayName = res.Parameter?.Name ?? string.Empty;
                    var category = res.Parameter?.Category ?? string.Empty;
                    var unit = res.Parameter?.Unit ?? string.Empty;
                    var hasResult = res.Value.HasValue || !string.IsNullOrWhiteSpace(res.StringValue);
                    var valStr = !string.IsNullOrWhiteSpace(res.StringValue)
                        ? res.StringValue.Trim()
                        : (res.Value.HasValue ? res.Value.Value.ToString("0.##") : null);

                    var requiredDurationHours = res.RequiredDurationHours > 0
                        ? res.RequiredDurationHours
                        : (res.Parameter?.RequiredDurationHours ?? 0);

                    string actualResultStatus;
                    if (hasResult)
                    {
                        actualResultStatus = "COMPLETED";
                    }
                    else if (requiredDurationHours > 0 || res.ExpectedCompletionAt.HasValue)
                    {
                        if ((res.ExpectedCompletionAt.HasValue && utcNow > res.ExpectedCompletionAt.Value) ||
                            string.Equals(res.ResultStatus, "OVERDUE", StringComparison.OrdinalIgnoreCase))
                        {
                            actualResultStatus = "OVERDUE";
                        }
                        else
                        {
                            actualResultStatus = "IN_PROGRESS";
                        }
                    }
                    else
                    {
                        actualResultStatus = string.Equals(res.ResultStatus, "OVERDUE", StringComparison.OrdinalIgnoreCase)
                            ? "OVERDUE"
                            : "PENDING_RESULT";
                    }

                    var isOverdue = actualResultStatus == "OVERDUE";
                    var qualityStatus = actualResultStatus == "COMPLETED"
                        ? (!string.IsNullOrWhiteSpace(res.QualityStatus) ? res.QualityStatus : (res.IsPass ? "PASS" : "FAIL"))
                        : "PENDING";

                    string? standard = null;
                    if (res.Parameter != null)
                    {
                        if (res.Parameter.MinAcceptable.HasValue && res.Parameter.MaxAcceptable.HasValue)
                        {
                            standard = $"{res.Parameter.MinAcceptable} - {res.Parameter.MaxAcceptable}";
                        }
                        else if (res.Parameter.MaxAcceptable.HasValue)
                        {
                            standard = $"≤ {res.Parameter.MaxAcceptable}";
                        }
                        else if (res.Parameter.MinAcceptable.HasValue)
                        {
                            standard = $"≥ {res.Parameter.MinAcceptable}";
                        }
                        else if (category.Equals("MICROBIOLOGY", StringComparison.OrdinalIgnoreCase))
                        {
                            standard = "Absent";
                        }
                        else if (pName.Contains("colour") || pName.Contains("color") || pName.Contains("odour") || pName.Contains("taste"))
                        {
                            standard = "Agreeable";
                        }
                    }

                    parameterDtos.Add(new PublicWaterTestParameterDto
                    {
                        Name = paramDisplayName,
                        Category = category,
                        Result = valStr,
                        Value = res.Value,
                        Unit = unit,
                        Standard = standard,
                        Status = qualityStatus,
                        QualityStatus = qualityStatus,
                        ResultStatus = actualResultStatus,
                        RequiredDurationHours = requiredDurationHours,
                        StartedAt = res.StartedAt,
                        ExpectedCompletionAt = res.ExpectedCompletionAt,
                        ActualCompletedAt = res.ActualCompletedAt,
                        IsOverdue = isOverdue
                    });

                    if (pName == "ph")
                    {
                        phVal = valStr;
                    }
                    else if (pName.Contains("tds") || pName.Contains("dissolved solids"))
                    {
                        tdsVal = valStr;
                    }
                    else if (pName.Contains("turbidity"))
                    {
                        turbidityVal = valStr;
                    }
                    else if (pName.Contains("colour") || pName.Contains("color"))
                    {
                        colourVal = valStr;
                    }
                    else if (pName.Contains("odour") || pName.Contains("odor"))
                    {
                        odourVal = valStr;
                    }
                    else if (pName.Contains("taste"))
                    {
                        tasteVal = valStr;
                    }
                    else if (pName.Contains("sulphate") || pName.Contains("sulfate"))
                    {
                        sulphateVal = valStr;
                    }
                    else if (pName.Contains("chloride"))
                    {
                        chlorideVal = valStr;
                    }
                    else if (pName.Contains("alkalinity"))
                    {
                        alkalinityVal = valStr;
                    }
                    else if (pName.Contains("chlorine"))
                    {
                        chlorineVal = valStr;
                    }
                    else if (pName.Contains("e.coli") || pName.Contains("ecoli"))
                    {
                        ecoliVal = valStr;
                    }
                    else if (pName.Contains("coliform"))
                    {
                        coliformVal = valStr;
                    }
                    else if (pName.Contains("pseudomonas"))
                    {
                        pseudomonasVal = valStr;
                    }
                    else if (pName.Contains("clostridia"))
                    {
                        clostridiaVal = valStr;
                    }
                    else if (pName.Contains("22"))
                    {
                        amc22Val = valStr;
                    }
                    else if (pName.Contains("37"))
                    {
                        amc37Val = valStr;
                    }
                    else if (pName.Contains("yeast") || pName.Contains("mold"))
                    {
                        yeastMoldVal = valStr;
                    }

                    if (category.ToUpperInvariant() == "MICROBIOLOGY")
                    {
                        if (actualResultStatus != "COMPLETED")
                        {
                            microPending = true;
                        }
                        else if (qualityStatus == "FAIL" || !res.IsPass)
                        {
                            microFailed = true;
                        }
                    }

                    if (pName.Contains("chlorine") || pName.Contains("steril"))
                    {
                        if (actualResultStatus != "COMPLETED")
                        {
                            sterilizationPending = true;
                        }
                        else if (qualityStatus == "FAIL" || !res.IsPass)
                        {
                            sterilizationFailed = true;
                        }
                    }
                }
            }

            var totalParametersCount = parameterDtos.Count;
            var completedParametersCount = parameterDtos.Count(p => p.ResultStatus == "COMPLETED");
            var overdueParametersCount = parameterDtos.Count(p => p.ResultStatus == "OVERDUE");
            var pendingParametersCount = totalParametersCount - completedParametersCount;
            var completionStatus = overdueParametersCount > 0
                ? "RESULTS_OVERDUE"
                : (totalParametersCount > 0 && completedParametersCount == totalParametersCount
                    ? "COMPLETED"
                    : (completedParametersCount > 0 ? "PARTIALLY_COMPLETED" : "PENDING_RESULTS"));

            var companyAddress = !string.IsNullOrWhiteSpace(platformTenant.Address)
                ? platformTenant.Address
                : qcSettings?.LabAddress;

            var complianceType = qcSettings != null && !string.IsNullOrWhiteSpace(qcSettings.StandardComplianceType)
                ? qcSettings.StandardComplianceType
                : "BIS IS 14543";

            var fssaiVal = !string.IsNullOrWhiteSpace(qcSettings?.FssaiNumber)
                ? qcSettings.FssaiNumber.Trim()
                : (!string.IsNullOrWhiteSpace(platformTenant.LicenseNumber) ? platformTenant.LicenseNumber.Trim() : null);

            var bisVal = !string.IsNullOrWhiteSpace(qcSettings?.BisNumber)
                ? qcSettings.BisNumber.Trim()
                : null;

            List<PublicCustomLicenseDto>? customLicenses = null;
            if (!string.IsNullOrWhiteSpace(qcSettings?.AdditionalLicensesJson))
            {
                try
                {
                    customLicenses = System.Text.Json.JsonSerializer.Deserialize<List<PublicCustomLicenseDto>>(qcSettings.AdditionalLicensesJson);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[PUBLIC BATCH VERIFICATION] Could not parse AdditionalLicensesJson for tenant {TenantId}", platformTenant.Id);
                }
            }

            return new PublicBatchVerificationResponseDto
            {
                Success = true,
                Verified = true,
                Data = new PublicBatchVerificationDataDto
                {
                    BatchNumber = report.BatchNumber,
                    ReportNumber = full ? $"RPT-{report.BatchNumber}" : null,
                    SampleNumber = full ? report.SampleNumber : null,
                    SampleCode = full ? (report.SampleNumber ?? report.BatchNumber) : null,
                    TestedBy = full ? report.TestedBy : null,
                    VerifiedBy = full ? report.VerifiedBy : null,
                    CollectedBy = full ? report.CollectedBy : null,
                    ReportType = report.ReportType,
                    Status = report.Status,
                    CompletionStatus = completionStatus,
                    TotalParametersCount = totalParametersCount,
                    CompletedParametersCount = completedParametersCount,
                    PendingParametersCount = pendingParametersCount,
                    OverdueParametersCount = overdueParametersCount,
                    SampleTime = full && report.SampleTime.HasValue ? report.SampleTime.Value.ToString("dd MMM yyyy, hh:mm tt") : null,
                    CollectedOn = full && report.SampleTime.HasValue ? report.SampleTime.Value.ToString("dd MMM yyyy, hh:mm tt") : null,
                    Remarks = full ? report.Remarks : null,
                    Manufacturer = new PublicManufacturerDto
                    {
                        Id = platformTenant.Id,
                        Name = platformTenant.Name,
                        Code = platformTenant.Code,
                        Subdomain = platformTenant.Subdomain,
                        CustomDomain = platformTenant.CustomDomain,
                        LogoUrl = platformTenant.LogoUrl,
                        BadgeLetters = !string.IsNullOrWhiteSpace(platformTenant.BadgeLetters) ? platformTenant.BadgeLetters.Trim().ToUpper() : null,
                        Address = companyAddress,
                        Location = companyAddress ?? "India",
                        LicenseNumber = fssaiVal,
                        GstNumber = platformTenant.GstNumber,
                        PanNumber = platformTenant.PanNumber,
                        Email = platformTenant.OwnerEmail,
                        Phone = platformTenant.OwnerPhone,
                        IsBiodropsProduction = platformTenant.IsBiodropsProduction,
                        CreatedAt = platformTenant.CreatedAt
                    },
                    Manufacturing = new PublicManufacturingDto
                    {
                        ManufacturedDate = mfgDateVal.ToString("yyyy-MM-dd")
                    },
                    Expiry = new PublicExpiryDto
                    {
                        BestBefore = expiryDateVal.ToString("yyyy-MM-dd"),
                        ShelfLifeMonths = 6
                    },
                    Licenses = new PublicLicensesDto
                    {
                        Fssai = fssaiVal,
                        Bis = bisVal,
                        Others = customLicenses != null && customLicenses.Count > 0 ? customLicenses : null
                    },
                    WaterQuality = new PublicWaterQualityDto
                    {
                        Ph = phVal,
                        Tds = tdsVal,
                        Turbidity = turbidityVal,
                        Colour = full ? colourVal : null,
                        Odour = full ? odourVal : null,
                        Taste = full ? tasteVal : null,
                        Sulphate = full ? sulphateVal : null,
                        Chloride = full ? chlorideVal : null,
                        Alkalinity = full ? alkalinityVal : null,
                        ResidualFreeChlorine = full ? chlorineVal : null,
                        EColi = full ? ecoliVal : null,
                        Coliform = full ? coliformVal : null,
                        Pseudomonas = full ? pseudomonasVal : null,
                        Clostridia = full ? clostridiaVal : null,
                        AerobicCount22 = full ? amc22Val : null,
                        AerobicCount37 = full ? amc37Val : null,
                        YeastAndMold = full ? yeastMoldVal : null,
                        Microbiology = microFailed ? "Failed" : (microPending ? "Pending" : "Passed"),
                        Sterilization = sterilizationFailed ? "Failed" : (sterilizationPending ? "Pending" : "Passed")
                    },
                    Parameters = full ? parameterDtos : null,
                    Report = new PublicReportDto
                    {
                        Available = true,
                        PublicDownloadAvailable = true
                    }
                }
            };
        }
    }
}
