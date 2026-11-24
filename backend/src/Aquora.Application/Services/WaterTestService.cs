using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.DTOs.QC;
using Aquora.Domain.Entities.QC;
using Aquora.Shared.Models;

namespace Aquora.Application.Services
{
    public class WaterTestService : IWaterTestService
    {
        private readonly ITenantDbContext _context;
        private readonly IPlatformDbContext _platformContext;
        private readonly ITenantProvider _tenantProvider;
        private readonly ICurrentUserContext _currentUserContext;
        private readonly IQualityEvaluationService _evaluationService;
        private readonly IQCPdfCertificateService _pdfService;
        private readonly ILogger<WaterTestService> _logger;

        public WaterTestService(
            ITenantDbContext context,
            IPlatformDbContext platformContext,
            ITenantProvider tenantProvider,
            ICurrentUserContext currentUserContext,
            IQualityEvaluationService evaluationService,
            IQCPdfCertificateService pdfService,
            ILogger<WaterTestService> logger)
        {
            _context = context;
            _platformContext = platformContext;
            _tenantProvider = tenantProvider;
            _currentUserContext = currentUserContext;
            _evaluationService = evaluationService;
            _pdfService = pdfService;
            _logger = logger;
        }

        private Guid GetTenantId() => _tenantProvider.TenantId;

        private async Task<Guid> GetCompanyIdAsync()
        {
            var company = await _context.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
            return company?.Id ?? Guid.Empty;
        }

        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _schemaCheckedTenants = new(StringComparer.OrdinalIgnoreCase);

        private async Task EnsureQCSchemaAsync()
        {
            var schema = _tenantProvider.TenantSchemaName;
            if (string.IsNullOrWhiteSpace(schema) || schema.Equals("public", StringComparison.OrdinalIgnoreCase)) return;

            if (_schemaCheckedTenants.TryGetValue(schema, out var checkedOk) && checkedOk)
            {
                return;
            }

            try
            {
                var sql = $@"
                    CREATE TABLE IF NOT EXISTS ""{schema}"".""WaterTestParameters"" (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""Name"" text NOT NULL,
                        ""Category"" text NOT NULL,
                        ""Unit"" text NOT NULL,
                        ""MinWarning"" double precision NULL,
                        ""MinAcceptable"" double precision NULL,
                        ""MaxAcceptable"" double precision NULL,
                        ""MaxWarning"" double precision NULL,
                        ""IsActive"" boolean NOT NULL DEFAULT true,
                        ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ""CreatedBy"" text NOT NULL DEFAULT 'System',
                        ""UpdatedAt"" timestamp with time zone NULL,
                        ""UpdatedBy"" text NULL,
                        ""CreatedByIP"" text NULL,
                        ""UpdatedByIP"" text NULL
                    );

                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinWarning"" double precision NULL;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxWarning"" double precision NULL;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinAcceptable"" double precision NULL;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxAcceptable"" double precision NULL;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""RequiredDurationHours"" integer NOT NULL DEFAULT 0;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""Frequency"" text NOT NULL DEFAULT 'DAILY';
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                    ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;

                    CREATE TABLE IF NOT EXISTS ""{schema}"".""WaterTestReports"" (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""TenantId"" uuid NOT NULL,
                        ""CompanyId"" uuid NOT NULL,
                        ""BatchNumber"" text NOT NULL,
                        ""SampleNumber"" text NULL,
                        ""ProductionDate"" timestamp with time zone NULL,
                        ""ReportType"" text NOT NULL DEFAULT 'DAILY',
                        ""Status"" text NOT NULL DEFAULT 'DRAFT',
                        ""SampleTime"" timestamp with time zone NULL,
                        ""TestedBy"" text NULL,
                        ""CollectedBy"" text NULL,
                        ""VerifiedBy"" text NULL,
                        ""Remarks"" text NULL,
                        ""Attachments"" text NULL,
                        ""ConcurrencyToken"" text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
                        ""IsActive"" boolean NOT NULL DEFAULT true,
                        ""IsDeleted"" boolean NOT NULL DEFAULT false,
                        ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ""CreatedBy"" text NOT NULL DEFAULT 'System',
                        ""UpdatedAt"" timestamp with time zone NULL,
                        ""UpdatedBy"" text NULL,
                        ""CreatedByIP"" text NULL,
                        ""UpdatedByIP"" text NULL,
                        ""DeletedAt"" timestamp with time zone NULL,
                        ""DeletedBy"" text NULL
                    );

                    ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""ConcurrencyToken"" text NULL;
                    UPDATE ""{schema}"".""WaterTestReports"" SET ""ConcurrencyToken"" = md5(random()::text || clock_timestamp()::text) WHERE ""ConcurrencyToken"" IS NULL OR ""ConcurrencyToken"" = '';
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ALTER COLUMN ""ConcurrencyToken"" SET DEFAULT md5(random()::text || clock_timestamp()::text);
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ALTER COLUMN ""ConcurrencyToken"" SET NOT NULL;
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""DeletedAt"" timestamp with time zone NULL;
                    ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""DeletedBy"" text NULL;

                    CREATE TABLE IF NOT EXISTS ""{schema}"".""WaterTestResults"" (
                        ""Id"" uuid NOT NULL PRIMARY KEY,
                        ""ReportId"" uuid NOT NULL,
                        ""ParameterId"" uuid NOT NULL,
                        ""Value"" double precision NULL,
                        ""StringValue"" text NULL,
                        ""IsPass"" boolean NOT NULL DEFAULT true,
                        ""QualityStatus"" text NOT NULL DEFAULT 'PASS',
                        ""RequiredDurationHours"" integer NOT NULL DEFAULT 0,
                        ""StartedAt"" timestamp with time zone NULL,
                        ""ExpectedCompletionAt"" timestamp with time zone NULL,
                        ""ActualCompletedAt"" timestamp with time zone NULL,
                        ""ResultStatus"" text NOT NULL DEFAULT 'COMPLETED',
                        ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ""CreatedBy"" text NOT NULL DEFAULT 'System',
                        ""UpdatedAt"" timestamp with time zone NULL,
                        ""UpdatedBy"" text NULL,
                        ""CreatedByIP"" text NULL,
                        ""UpdatedByIP"" text NULL
                    );

                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""QualityStatus"" text NOT NULL DEFAULT 'PASS';
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""RequiredDurationHours"" integer NOT NULL DEFAULT 0;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""StartedAt"" timestamp with time zone NULL;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""ExpectedCompletionAt"" timestamp with time zone NULL;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""ActualCompletedAt"" timestamp with time zone NULL;
                    ALTER TABLE ""{schema}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""ResultStatus"" text NOT NULL DEFAULT 'COMPLETED';
                    UPDATE ""{schema}"".""WaterTestResults"" SET ""ResultStatus"" = 'COMPLETED' WHERE ""ResultStatus"" IS NULL OR ""ResultStatus"" = '';

                    ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""AdditionalLicensesJson"" text NULL;
                    ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""FssaiNumber"" text NULL;
                    ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""BisNumber"" text NULL;
                ";

                if (_context is DbContext dbContext)
                {
                    await dbContext.Database.ExecuteSqlRawAsync(sql);
                }

                _schemaCheckedTenants[schema] = true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to self-repair QC schema columns for schema '{Schema}'", schema);
            }
        }

        private async Task<Dictionary<string, string>> ResolveUserNamesAsync(IEnumerable<string?> userIds)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var distinctIds = userIds
                    .Where(id => !string.IsNullOrWhiteSpace(id) && Guid.TryParse(id, out _))
                    .Select(id => Guid.Parse(id!))
                    .Distinct()
                    .ToList();
                if (!distinctIds.Any()) return map;

                var users = await _platformContext.Users
                    .Where(u => distinctIds.Contains(u.Id))
                    .Select(u => new { u.Id, u.FirstName, u.LastName })
                    .ToListAsync();

                foreach (var u in users)
                {
                    var fullName = $"{u.FirstName} {u.LastName}".Trim();
                    map[u.Id.ToString()] = string.IsNullOrWhiteSpace(fullName) ? "System User" : fullName;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to resolve user names for water test reports.");
            }

            return map;
        }

        public async Task<List<WaterTestParameterDto>> GetWaterTestParametersAsync()
        {
            await EnsureQCSchemaAsync();
            var activeParams = await _context.WaterTestParameters.Where(p => p.IsActive).ToListAsync();

            // Self-repair safeguard: if parameters are missing from the tenant schema, auto-seed defaults
            if (activeParams.Count < QCDefaultParameters.Catalog.Count)
            {
                var existingNames = new HashSet<string>(activeParams.Select(p => QCDefaultParameters.NormalizeKey(p.Name)));
                bool anyMissing = QCDefaultParameters.Catalog.Any(def => !existingNames.Contains(QCDefaultParameters.NormalizeKey(def.Name)));
                if (anyMissing)
                {
                    await QCDataSeeder.SeedQCDefaultParametersAsync(_context, "WaterTestService.GetWaterTestParametersAsync");
                    activeParams = await _context.WaterTestParameters.Where(p => p.IsActive).ToListAsync();
                }
            }

            var catalogOrderMap = QCDefaultParameters.Catalog
                .Select((item, idx) => (Key: QCDefaultParameters.NormalizeKey(item.Name), Index: idx))
                .ToDictionary(x => x.Key, x => x.Index);

            return activeParams
                .GroupBy(p => p.Name.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .Select(p => new WaterTestParameterDto
                {
                    Id = p.Id,
                    Name = p.Name,
                    Category = p.Category,
                    Frequency = p.Frequency ?? "DAILY",
                    Unit = p.Unit,
                    MinWarning = p.MinWarning,
                    MinAcceptable = p.MinAcceptable,
                    MaxAcceptable = p.MaxAcceptable,
                    MaxWarning = p.MaxWarning,
                    RequiredDurationHours = p.RequiredDurationHours
                })
                .OrderBy(p => {
                    var norm = QCDefaultParameters.NormalizeKey(p.Name);
                    return catalogOrderMap.TryGetValue(norm, out var idx) ? idx : 999;
                })
                .ThenBy(p => p.Category)
                .ThenBy(p => p.Name)
                .ToList();
        }

        public async Task<PagedResult<WaterTestReportDto>> GetWaterTestReportsAsync(
            int pageNumber,
            int pageSize,
            string? search,
            string? type,
            string? status,
            DateTime? startDate,
            DateTime? endDate)
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            pageNumber = Math.Max(1, pageNumber);
            pageSize = pageSize <= 0 ? 15 : Math.Min(100, pageSize);

            var query = _context.WaterTestReports
                .AsNoTracking()
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .Where(r => r.TenantId == tenantId && !r.IsDeleted)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(r => (r.BatchNumber != null && r.BatchNumber.ToLower().Contains(s)) 
                                      || (r.SampleNumber != null && r.SampleNumber.ToLower().Contains(s))
                                      || (r.TestedBy != null && r.TestedBy.ToLower().Contains(s)));
            }

            if (!string.IsNullOrWhiteSpace(type) && !type.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.ReportType == type);
            }

            var now = DateTime.UtcNow;
            var todayStart = now.Date;
            var todayEnd = todayStart.AddDays(1);

            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                var normStatus = status.Trim().ToLower();
                if (normStatus == "due_today" || normStatus == "due")
                {
                    query = query.Where(r => r.Results.Any(res => res.ResultStatus != "COMPLETED" && !res.Value.HasValue && string.IsNullOrWhiteSpace(res.StringValue) && res.ExpectedCompletionAt >= todayStart && res.ExpectedCompletionAt < todayEnd));
                }
                else if (normStatus == "overdue")
                {
                    query = query.Where(r => r.Results.Any(res => res.ResultStatus != "COMPLETED" && !res.Value.HasValue && string.IsNullOrWhiteSpace(res.StringValue) && res.ExpectedCompletionAt != null && res.ExpectedCompletionAt < now));
                }
                else if (normStatus == "in_progress" || normStatus == "partially_completed")
                {
                    query = query.Where(r => r.Results.Any(res => res.ResultStatus != "COMPLETED" && !res.Value.HasValue && string.IsNullOrWhiteSpace(res.StringValue)));
                }
                else if (normStatus == "completed")
                {
                    query = query.Where(r => r.Status == "COMPLETED" || (r.Results.Any() && r.Results.All(res => res.ResultStatus == "COMPLETED" || res.Value.HasValue || (!string.IsNullOrWhiteSpace(res.StringValue) && res.StringValue != "—"))));
                }
                else
                {
                    query = query.Where(r => r.Status == status);
                }
            }

            if (startDate.HasValue)
            {
                query = query.Where(r => r.SampleTime >= startDate.Value.ToUniversalTime());
            }

            if (endDate.HasValue)
            {
                query = query.Where(r => r.SampleTime <= endDate.Value.ToUniversalTime());
            }

            var totalCount = await query.CountAsync();
            var items = await query
                .OrderByDescending(r => r.SampleTime ?? r.CreatedAt)
                .ThenByDescending(r => r.CreatedAt)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var userIds = items
                .Select(r => r.CreatedBy)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct()
                .ToList();
            var userNames = await ResolveUserNamesAsync(userIds);

            var dtos = items.Select(r => MapToDto(r, userNames)).ToList();

            return new PagedResult<WaterTestReportDto>(dtos, totalCount, pageNumber, pageSize);
        }

        public async Task<WaterTestReportDto?> GetWaterTestReportByIdAsync(Guid id)
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var report = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId && !r.IsDeleted);

            if (report == null) return null;

            var userNames = await ResolveUserNamesAsync(new[] { report.CreatedBy });
            return MapToDto(report, userNames);
        }

        private string NormalizeParameterKey(string rawKey)
        {
            if (string.IsNullOrWhiteSpace(rawKey)) return string.Empty;
            var trimmed = rawKey.Trim();

            if (trimmed.StartsWith("seed-micro-", StringComparison.OrdinalIgnoreCase))
            {
                var sub = trimmed.Substring("seed-micro-".Length).Trim();
                if (sub.Contains("22")) return "Aerobic Microbial Count 22°C";
                if (sub.Contains("37")) return "Aerobic Microbial Count 37°C";
                if (sub.Equals("e.coli", StringComparison.OrdinalIgnoreCase)) return "E.coli";
                if (sub.Equals("coliform", StringComparison.OrdinalIgnoreCase)) return "Coliform";
                if (sub.Equals("pseudomonas", StringComparison.OrdinalIgnoreCase)) return "Pseudomonas";
                if (sub.Equals("clostridia", StringComparison.OrdinalIgnoreCase)) return "Clostridia";
                if (sub.Contains("yeast")) return "Yeast & Mold";
                return sub;
            }
            if (trimmed.Equals("taste-parameter-id", StringComparison.OrdinalIgnoreCase))
            {
                return "Taste";
            }

            return trimmed;
        }

        public async Task<WaterTestReportDto> CreateWaterTestReportAsync(CreateWaterTestReportRequest request)
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var companyId = await GetCompanyIdAsync();
            var currentUserId = _currentUserContext.UserId ?? "System";

            var report = new WaterTestReport
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CompanyId = companyId,
                BatchNumber = request.BatchNumber,
                SampleNumber = request.SampleNumber,
                ProductionDate = request.ProductionDate?.ToUniversalTime(),
                ReportType = request.ReportType,
                Status = request.Status,
                SampleTime = request.SampleTime?.ToUniversalTime() ?? DateTime.UtcNow,
                TestedBy = request.TestedBy,
                CollectedBy = request.CollectedBy,
                VerifiedBy = request.VerifiedBy,
                Remarks = request.Remarks,
                Attachments = request.Attachments,
                ConcurrencyToken = Guid.NewGuid().ToString(),
                CreatedAt = DateTime.UtcNow,
                CreatedBy = currentUserId
            };

            var parameters = await _context.WaterTestParameters.ToListAsync();
            var parameterMap = new Dictionary<string, WaterTestParameter>(StringComparer.OrdinalIgnoreCase);

            foreach (var p in parameters)
            {
                parameterMap[p.Id.ToString()] = p;
                if (!string.IsNullOrWhiteSpace(p.Name))
                {
                    parameterMap[p.Name.Trim()] = p;
                }
            }

            var now = DateTime.UtcNow;

            foreach (var rReq in request.Results)
            {
                if (string.IsNullOrWhiteSpace(rReq.ParameterId)) continue;

                var param = ResolveOrCreateParameter(rReq.ParameterId, parameters, parameterMap, currentUserId);
                var qualityStatus = _evaluationService.EvaluateParameter(param, rReq.Value, rReq.StringValue);

                var requiredHours = param.RequiredDurationHours;
                var startedAt = rReq.StartedAt?.ToUniversalTime() ?? report.SampleTime ?? report.CreatedAt;
                var expectedCompletionAt = rReq.ExpectedCompletionAt?.ToUniversalTime() ?? (requiredHours > 0 ? startedAt.AddHours(requiredHours) : startedAt);

                bool hasEnteredResult = rReq.Value.HasValue || (!string.IsNullOrWhiteSpace(rReq.StringValue) && rReq.StringValue != "—" && !rReq.StringValue.Equals("pending", StringComparison.OrdinalIgnoreCase) && !rReq.StringValue.Equals("not entered", StringComparison.OrdinalIgnoreCase));

                string resultStatus;
                DateTime? actualCompletedAt = null;

                if (hasEnteredResult)
                {
                    resultStatus = "COMPLETED";
                    actualCompletedAt = rReq.ActualCompletedAt?.ToUniversalTime() ?? now;
                }
                else
                {
                    if (now > expectedCompletionAt)
                    {
                        resultStatus = "OVERDUE";
                    }
                    else if (requiredHours > 0)
                    {
                        resultStatus = "IN_PROGRESS";
                    }
                    else
                    {
                        resultStatus = "PENDING_RESULT";
                    }
                }

                report.Results.Add(new WaterTestResult
                {
                    Id = Guid.NewGuid(),
                    ReportId = report.Id,
                    ParameterId = param.Id,
                    Value = rReq.Value,
                    StringValue = rReq.StringValue,
                    IsPass = qualityStatus == "PASS",
                    QualityStatus = qualityStatus,
                    RequiredDurationHours = requiredHours,
                    StartedAt = startedAt,
                    ExpectedCompletionAt = expectedCompletionAt,
                    ActualCompletedAt = actualCompletedAt,
                    ResultStatus = resultStatus,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = currentUserId
                });
            }

            _context.WaterTestReports.Add(report);
            await CheckAndGenerateCAPAsAsync(report);
            await LogQCActionAsync(report.Id, report.Id.ToString().Substring(0, 8).ToUpper(), "REPORT_CREATE", $"Created Water Test Report #{report.Id.ToString().Substring(0, 8).ToUpper()} for Batch '{report.BatchNumber}'. Status: {report.Status}");
            await _context.SaveChangesAsync();

            var userNames = await ResolveUserNamesAsync(new[] { currentUserId });
            return MapToDto(report, userNames);
        }

        public async Task<WaterTestReportDto?> UpdateWaterTestReportAsync(Guid id, CreateWaterTestReportRequest request)
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var currentUserId = _currentUserContext.UserId ?? "System";

            var report = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId && !r.IsDeleted);

            if (report == null) return null;

            // The report and its results are materialized by this context and remain tracked
            // for the entire update.  Do not attach or map a detached request entity here.
            // EnsureQCSchemaAsync establishes this invariant for both new and legacy schemas.
            if (string.IsNullOrWhiteSpace(report.ConcurrencyToken))
            {
                throw new InvalidOperationException(
                    $"Water test report {id} has no concurrency token after schema validation.");
            }

            if (string.IsNullOrWhiteSpace(request.ConcurrencyToken))
            {
                throw new ArgumentException("A concurrency token from the current report is required.", nameof(request));
            }

            // EF keeps the database token as OriginalValue, so the generated UPDATE is scoped
            // by both Id and the value the client read.  Compare first to return a genuine
            // conflict before changing any tracked state.
            if (!string.Equals(request.ConcurrencyToken, report.ConcurrencyToken, StringComparison.Ordinal))
            {
                _logger.LogWarning(
                    "[CONCURRENCY CONFLICT DETECTED] WaterTestReport {ReportId} update rejected. " +
                    "Client Token: '{RequestToken}', DB Token: '{DbToken}', User: '{UserId}'",
                    id, request.ConcurrencyToken, report.ConcurrencyToken, currentUserId);

                throw new Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException(
                    "This report was updated by another session or user. Please reload the latest version before saving.");
            }

            // Assigning a new value marks the token as modified. EF uses the value loaded
            // above as its OriginalValue in the UPDATE WHERE clause.
            report.ConcurrencyToken = Guid.NewGuid().ToString();

            // Audit Delta Snapshot
            var oldBatchNumber = report.BatchNumber;
            var oldStatus = report.Status;
            var oldRemarks = report.Remarks;
            var oldResultsSnapshot = report.Results.ToDictionary(
                r => r.Id,
                r => new { Name = r.Parameter?.Name ?? "Unknown", Val = r.Value?.ToString() ?? r.StringValue ?? "N/A" }
            );

            report.BatchNumber = request.BatchNumber;
            report.SampleNumber = request.SampleNumber;
            report.ProductionDate = request.ProductionDate?.ToUniversalTime();
            report.ReportType = request.ReportType;
            report.Status = request.Status;
            report.SampleTime = request.SampleTime?.ToUniversalTime() ?? report.SampleTime;
            report.TestedBy = request.TestedBy;
            report.CollectedBy = request.CollectedBy;
            report.VerifiedBy = request.VerifiedBy;
            report.Remarks = request.Remarks;
            report.Attachments = request.Attachments;
            report.UpdatedAt = DateTime.UtcNow;
            report.UpdatedBy = currentUserId;

            var parameters = await _context.WaterTestParameters.ToListAsync();
            var parameterMap = new Dictionary<string, WaterTestParameter>(StringComparer.OrdinalIgnoreCase);

            foreach (var p in parameters)
            {
                parameterMap[p.Id.ToString()] = p;
                if (!string.IsNullOrWhiteSpace(p.Name))
                {
                    parameterMap[p.Name.Trim()] = p;
                }
            }

            // Deduplicate incoming request results by resolved WaterTestParameter.Id
            var deduplicatedResults = new List<(Guid? ResultId, WaterTestParameter Parameter, double? Value, string? StringValue)>();
            var seenParamIds = new HashSet<Guid>();

            foreach (var rReq in request.Results)
            {
                if (string.IsNullOrWhiteSpace(rReq.ParameterId)) continue;

                var param = ResolveOrCreateParameter(rReq.ParameterId, parameters, parameterMap, currentUserId);
                if (seenParamIds.Contains(param.Id)) continue;
                seenParamIds.Add(param.Id);

                Guid? reqResultId = null;
                if (!string.IsNullOrWhiteSpace(rReq.Id) && Guid.TryParse(rReq.Id, out var parsedResultId))
                {
                    reqResultId = parsedResultId;
                }

                deduplicatedResults.Add((reqResultId, param, rReq.Value, rReq.StringValue));
            }

            var existingResultsById = report.Results.ToDictionary(r => r.Id, r => r);
            var existingResultsByParamId = report.Results.GroupBy(r => r.ParameterId).ToDictionary(g => g.Key, g => g.First());
            var existingResultsByParamName = report.Results
                .Where(r => r.Parameter != null && !string.IsNullOrWhiteSpace(r.Parameter.Name))
                .GroupBy(r => r.Parameter.Name.Trim().ToLower())
                .ToDictionary(g => g.Key, g => g.First());

            var updatedResultIds = new HashSet<Guid>();

            var now = DateTime.UtcNow;

            foreach (var (reqResultId, param, val, strVal) in deduplicatedResults)
            {
                var qualityStatus = _evaluationService.EvaluateParameter(param, val, strVal);
                WaterTestResult? existingResult = null;

                if (reqResultId.HasValue && existingResultsById.TryGetValue(reqResultId.Value, out var resByResId))
                {
                    existingResult = resByResId;
                }
                else if (!reqResultId.HasValue && existingResultsByParamId.TryGetValue(param.Id, out var resByParamId))
                {
                    existingResult = resByParamId;
                }
                else if (!reqResultId.HasValue && !string.IsNullOrWhiteSpace(param.Name) && existingResultsByParamName.TryGetValue(param.Name.Trim().ToLower(), out var resByName))
                {
                    existingResult = resByName;
                }

                bool hasEnteredResult = val.HasValue || (!string.IsNullOrWhiteSpace(strVal) && strVal != "—" && !strVal.Equals("pending", StringComparison.OrdinalIgnoreCase) && !strVal.Equals("not entered", StringComparison.OrdinalIgnoreCase));

                if (existingResult != null)
                {
                    existingResult.ParameterId = param.Id;
                    existingResult.Value = val;
                    existingResult.StringValue = strVal;
                    existingResult.IsPass = qualityStatus == "PASS";
                    existingResult.QualityStatus = qualityStatus;
                    existingResult.RequiredDurationHours = param.RequiredDurationHours > 0 ? param.RequiredDurationHours : existingResult.RequiredDurationHours;

                    if (!existingResult.StartedAt.HasValue)
                    {
                        existingResult.StartedAt = report.SampleTime ?? report.CreatedAt;
                    }
                    if (!existingResult.ExpectedCompletionAt.HasValue)
                    {
                        existingResult.ExpectedCompletionAt = existingResult.RequiredDurationHours > 0 
                            ? existingResult.StartedAt.Value.AddHours(existingResult.RequiredDurationHours) 
                            : existingResult.StartedAt.Value;
                    }

                    if (hasEnteredResult)
                    {
                        if (existingResult.ResultStatus != "COMPLETED" || !existingResult.ActualCompletedAt.HasValue)
                        {
                            existingResult.ActualCompletedAt = now;
                        }
                        existingResult.ResultStatus = "COMPLETED";
                    }
                    else
                    {
                        existingResult.ActualCompletedAt = null;
                        if (now > existingResult.ExpectedCompletionAt.Value)
                        {
                            existingResult.ResultStatus = "OVERDUE";
                        }
                        else if (existingResult.RequiredDurationHours > 0)
                        {
                            existingResult.ResultStatus = "IN_PROGRESS";
                        }
                        else
                        {
                            existingResult.ResultStatus = "PENDING_RESULT";
                        }
                    }

                    existingResult.UpdatedAt = now;
                    existingResult.UpdatedBy = currentUserId;
                    updatedResultIds.Add(existingResult.Id);
                }
                else
                {
                    if (reqResultId.HasValue)
                    {
                        throw new InvalidOperationException($"Water test result {reqResultId.Value} does not belong to report {report.Id}.");
                    }

                    var startedAt = report.SampleTime ?? report.CreatedAt;
                    var requiredHours = param.RequiredDurationHours;
                    var expectedCompletionAt = requiredHours > 0 ? startedAt.AddHours(requiredHours) : startedAt;
                    DateTime? actualCompletedAt = null;
                    string resultStatus;

                    if (hasEnteredResult)
                    {
                        resultStatus = "COMPLETED";
                        actualCompletedAt = now;
                    }
                    else
                    {
                        if (now > expectedCompletionAt)
                        {
                            resultStatus = "OVERDUE";
                        }
                        else if (requiredHours > 0)
                        {
                            resultStatus = "IN_PROGRESS";
                        }
                        else
                        {
                            resultStatus = "PENDING_RESULT";
                        }
                    }

                    var newResult = new WaterTestResult
                    {
                        Id = Guid.NewGuid(),
                        ReportId = report.Id,
                        ParameterId = param.Id,
                        Value = val,
                        StringValue = strVal,
                        IsPass = qualityStatus == "PASS",
                        QualityStatus = qualityStatus,
                        RequiredDurationHours = requiredHours,
                        StartedAt = startedAt,
                        ExpectedCompletionAt = expectedCompletionAt,
                        ActualCompletedAt = actualCompletedAt,
                        ResultStatus = resultStatus,
                        CreatedAt = now,
                        CreatedBy = currentUserId
                    };

                    _context.WaterTestResults.Add(newResult);
                    updatedResultIds.Add(newResult.Id);
                }
            }

            // Remove obsolete / orphaned results safely through EF Core ChangeTracker
            var toRemove = report.Results
                .Where(r => !updatedResultIds.Contains(r.Id))
                .ToList();

            foreach (var item in toRemove)
            {
                _context.WaterTestResults.Remove(item);
            }

            // Build Audit Trail Delta Log
            var changes = new List<string>();
            if (oldBatchNumber != request.BatchNumber) changes.Add($"BatchNumber: '{oldBatchNumber}' -> '{request.BatchNumber}'");
            if (oldStatus != request.Status) changes.Add($"Status: '{oldStatus}' -> '{request.Status}'");
            if ((oldRemarks ?? "") != (request.Remarks ?? "")) changes.Add($"Remarks: '{oldRemarks ?? ""}' -> '{request.Remarks ?? ""}'");

            foreach (var (_, param, val, strVal) in deduplicatedResults)
            {
                var newValStr = val?.ToString() ?? strVal ?? "N/A";
                var oldItem = oldResultsSnapshot.Values.FirstOrDefault(x => x.Name.Equals(param.Name, StringComparison.OrdinalIgnoreCase));
                var oldValStr = oldItem != null ? oldItem.Val : "None";
                if (oldValStr != newValStr)
                {
                    changes.Add($"{param.Name}: {oldValStr} -> {newValStr}");
                }
            }

            string changeDetails = changes.Any() ? string.Join("; ", changes) : "No field changes detected.";
            await LogQCActionAsync(report.Id, report.Id.ToString().Substring(0, 8).ToUpper(), "REPORT_UPDATE", $"Water Test Report #{report.Id.ToString().Substring(0, 8).ToUpper()} updated. Changes: {changeDetails}");

            await CheckAndGenerateCAPAsAsync(report);

            if (_context is DbContext dbContextForTracking)
            {
                foreach (var entry in dbContextForTracking.ChangeTracker.Entries<WaterTestResult>())
                {
                    Console.WriteLine(
                        $"[WATER TEST FINAL TRACKING] " +
                        $"Id={entry.Entity.Id} " +
                        $"State={entry.State} " +
                        $"ReportId={entry.Entity.ReportId} " +
                        $"ParameterId={entry.Entity.ParameterId}");
                }
            }

            await _context.SaveChangesAsync();

            var userNames = await ResolveUserNamesAsync(new[] { report.CreatedBy });
            return MapToDto(report, userNames);
        }

        public async Task<WaterTestReportDto?> EnterSingleParameterResultAsync(Guid reportId, Guid parameterId, EnterSingleResultRequest request)
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var currentUserId = _currentUserContext.UserId ?? "System";

            var report = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .FirstOrDefaultAsync(r => r.Id == reportId && r.TenantId == tenantId && !r.IsDeleted);

            if (report == null) return null;

            if (!string.IsNullOrWhiteSpace(request.ConcurrencyToken) && 
                !string.Equals(request.ConcurrencyToken, report.ConcurrencyToken, StringComparison.Ordinal))
            {
                throw new Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException(
                    "This report was updated by another session or user. Please reload the latest version before saving.");
            }

            report.ConcurrencyToken = Guid.NewGuid().ToString();
            report.UpdatedAt = DateTime.UtcNow;
            report.UpdatedBy = currentUserId;

            var param = await _context.WaterTestParameters.FirstOrDefaultAsync(p => p.Id == parameterId);
            if (param == null)
            {
                throw new InvalidOperationException($"Parameter {parameterId} was not found.");
            }

            var existingResult = report.Results.FirstOrDefault(r => r.ParameterId == parameterId);
            var qualityStatus = _evaluationService.EvaluateParameter(param, request.Value, request.StringValue);
            var completedAt = DateTime.UtcNow;

            if (existingResult != null)
            {
                var oldVal = existingResult.Value?.ToString() ?? existingResult.StringValue ?? "None";
                existingResult.Value = request.Value;
                existingResult.StringValue = request.StringValue;
                existingResult.IsPass = qualityStatus == "PASS";
                existingResult.QualityStatus = qualityStatus;
                existingResult.ActualCompletedAt = completedAt;
                existingResult.ResultStatus = "COMPLETED";
                existingResult.UpdatedAt = DateTime.UtcNow;
                existingResult.UpdatedBy = currentUserId;

                string delayNote = "";
                if (existingResult.ExpectedCompletionAt.HasValue && completedAt > existingResult.ExpectedCompletionAt.Value)
                {
                    var delayHours = Math.Round((completedAt - existingResult.ExpectedCompletionAt.Value).TotalHours, 1);
                    delayNote = $" (Entered {delayHours}h after expected completion)";
                }

                var newVal = request.Value?.ToString() ?? request.StringValue ?? "N/A";
                await LogQCActionAsync(report.Id, report.Id.ToString()[..8].ToUpper(), "RESULT_ENTRY", 
                    $"Entered result for '{param.Name}': {oldVal} -> {newVal}. Status: {qualityStatus}{delayNote}");
            }
            else
            {
                var startedAt = report.SampleTime ?? report.CreatedAt;
                var newResult = new WaterTestResult
                {
                    Id = Guid.NewGuid(),
                    ReportId = report.Id,
                    ParameterId = param.Id,
                    Value = request.Value,
                    StringValue = request.StringValue,
                    IsPass = qualityStatus == "PASS",
                    QualityStatus = qualityStatus,
                    RequiredDurationHours = param.RequiredDurationHours,
                    StartedAt = startedAt,
                    ExpectedCompletionAt = startedAt.AddHours(param.RequiredDurationHours),
                    ActualCompletedAt = completedAt,
                    ResultStatus = "COMPLETED",
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = currentUserId
                };
                _context.WaterTestResults.Add(newResult);
                report.Results.Add(newResult);

                var newVal = request.Value?.ToString() ?? request.StringValue ?? "N/A";
                await LogQCActionAsync(report.Id, report.Id.ToString()[..8].ToUpper(), "RESULT_ENTRY", 
                    $"Recorded delayed result for '{param.Name}': {newVal}. Status: {qualityStatus}");
            }

            if (!string.IsNullOrWhiteSpace(request.Remarks))
            {
                report.Remarks = string.IsNullOrWhiteSpace(report.Remarks) 
                    ? request.Remarks 
                    : $"{report.Remarks} | {request.Remarks}";
            }

            // Auto-update overall report status if all parameters are now completed
            var allResults = report.Results.ToList();
            bool allCompleted = allResults.All(r => r.ResultStatus == "COMPLETED" || r.Value.HasValue || (!string.IsNullOrWhiteSpace(r.StringValue) && r.StringValue != "—"));
            if (allCompleted && report.Status == "DRAFT")
            {
                report.Status = "COMPLETED";
            }

            await CheckAndGenerateCAPAsAsync(report);
            await _context.SaveChangesAsync();

            var userNames = await ResolveUserNamesAsync(new[] { report.CreatedBy });
            return MapToDto(report, userNames);
        }

        public async Task<List<QCPendingTaskDto>> GetPendingTasksAndRemindersAsync()
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var now = DateTime.UtcNow;
            var todayStart = now.Date;
            var todayEnd = todayStart.AddDays(1);

            var reports = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .Where(r => r.TenantId == tenantId && !r.IsDeleted)
                .ToListAsync();

            var tasks = new List<QCPendingTaskDto>();

            foreach (var r in reports)
            {
                foreach (var res in (r.Results ?? new List<WaterTestResult>()))
                {
                    bool hasResult = res.Value.HasValue || (!string.IsNullOrWhiteSpace(res.StringValue) && res.StringValue != "—" && !res.StringValue.Equals("pending", StringComparison.OrdinalIgnoreCase) && !res.StringValue.Equals("not entered", StringComparison.OrdinalIgnoreCase));
                    if (hasResult || res.ResultStatus == "COMPLETED") continue;

                    string status = "IN_PROGRESS";
                    bool isOverdue = false;
                    double? hoursOverdue = null;
                    double? remainingHours = null;

                    if (res.ExpectedCompletionAt.HasValue)
                    {
                        if (now > res.ExpectedCompletionAt.Value)
                        {
                            status = "OVERDUE";
                            isOverdue = true;
                            hoursOverdue = Math.Round((now - res.ExpectedCompletionAt.Value).TotalHours, 1);
                        }
                        else if (res.ExpectedCompletionAt.Value >= todayStart && res.ExpectedCompletionAt.Value < todayEnd)
                        {
                            status = "DUE";
                            remainingHours = Math.Max(0, Math.Round((res.ExpectedCompletionAt.Value - now).TotalHours, 1));
                        }
                        else
                        {
                            status = "IN_PROGRESS";
                            remainingHours = Math.Max(0, Math.Round((res.ExpectedCompletionAt.Value - now).TotalHours, 1));
                        }
                    }

                    string urgencyLevel = isOverdue ? "OVERDUE" : (status == "DUE" ? "DUE_TODAY" : "IN_PROGRESS");
                    double hoursRemainingOrOverdue = isOverdue ? -(hoursOverdue ?? 0) : (remainingHours ?? 0);

                    tasks.Add(new QCPendingTaskDto
                    {
                        ReportId = r.Id,
                        ReportNumber = r.Id.ToString().Length >= 8 ? r.Id.ToString().Substring(0, 8).ToUpper() : r.Id.ToString().ToUpper(),
                        BatchNumber = r.BatchNumber,
                        SampleNumber = r.SampleNumber,
                        ParameterId = res.ParameterId,
                        ParameterName = res.Parameter?.Name ?? "Unknown",
                        Category = res.Parameter?.Category ?? "Unknown",
                        Unit = res.Parameter?.Unit ?? "—",
                        RequiredDurationHours = res.RequiredDurationHours > 0 ? res.RequiredDurationHours : (res.Parameter?.RequiredDurationHours ?? 0),
                        StartedAt = res.StartedAt,
                        ExpectedCompletionAt = res.ExpectedCompletionAt,
                        Status = status,
                        IsOverdue = isOverdue,
                        HoursOverdue = hoursOverdue,
                        RemainingHours = remainingHours,
                        HoursRemainingOrOverdue = hoursRemainingOrOverdue,
                        UrgencyLevel = urgencyLevel
                    });
                }
            }

            return tasks
                .OrderByDescending(t => t.IsOverdue)
                .ThenBy(t => t.ExpectedCompletionAt ?? DateTime.MaxValue)
                .ToList();
        }

        public async Task<bool> DeleteWaterTestReportAsync(Guid id)
        {
            var tenantId = GetTenantId();
            var report = await _context.WaterTestReports.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId && !r.IsDeleted);
            if (report == null) return false;

            report.IsDeleted = true;
            report.DeletedAt = DateTime.UtcNow;
            report.DeletedBy = _currentUserContext.UserId ?? "System";

            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<WaterTestDashboardDto> GetWaterTestDashboardAsync()
        {
            await EnsureQCSchemaAsync();
            var tenantId = GetTenantId();
            var reports = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .Where(r => r.TenantId == tenantId && !r.IsDeleted)
                .ToListAsync();

            var now = DateTime.UtcNow;
            var today = now.Date;
            var tomorrow = today.AddDays(1);

            var allPendingTasks = await GetPendingTasksAndRemindersAsync();

            var stats = reports.Select(r => new {
                Report = r,
                Status = ResolveReportStatus(r)
            }).ToList();

            var monthlyStats = stats
                .GroupBy(s => s.Report.SampleTime?.ToString("MMM") ?? "Unknown")
                .Select(g => new MonthlyReportStatDto
                {
                    Month = g.Key,
                    Passed = g.Count(x => x.Status == "PASS" || x.Status == "WARNING"),
                    Failed = g.Count(x => x.Status == "FAIL")
                }).ToList();

            var creatorIds = stats.Select(s => s.Report.CreatedBy).Distinct().ToList();
            var userNames = await ResolveUserNamesAsync(creatorIds);

            var recent = stats
                .OrderByDescending(s => s.Report.SampleTime ?? s.Report.CreatedAt)
                .Take(10)
                .Select(s => MapToDto(s.Report, userNames))
                .ToList();

            int dueTodayCount = allPendingTasks.Count(t => t.Status == "DUE" || (t.ExpectedCompletionAt.HasValue && t.ExpectedCompletionAt.Value >= today && t.ExpectedCompletionAt.Value < tomorrow && !t.IsOverdue));
            int overdueCount = allPendingTasks.Count(t => t.IsOverdue);
            int activeIncubationsCount = allPendingTasks.Count(t => t.RequiredDurationHours > 0 && !t.IsOverdue);
            int completedTodayCount = reports
                .SelectMany(r => r.Results ?? new List<WaterTestResult>())
                .Count(res => res.ActualCompletedAt.HasValue && res.ActualCompletedAt.Value.Date == today);

            return new WaterTestDashboardDto
            {
                TotalReports = reports.Count,
                TodayReports = reports.Count(r => r.SampleTime?.Date == today),
                PassedReports = stats.Count(s => s.Status == "PASS"),
                FailedReports = stats.Count(s => s.Status == "FAIL"),
                PendingReports = stats.Count(s => s.Status == "PENDING" || s.Report.Status == "DRAFT" || s.Report.Status == "IN_PROGRESS" || s.Report.Status == "PARTIALLY_COMPLETED"),
                ResultsDueTodayCount = dueTodayCount,
                OverdueResultsCount = overdueCount,
                ActiveIncubationsCount = activeIncubationsCount,
                CompletedTodayCount = completedTodayCount,
                PendingTasks = allPendingTasks.Take(15).ToList(),
                MonthlyStats = monthlyStats,
                RecentReports = recent
            };
        }

        private string ResolveReportStatus(WaterTestReport r)
        {
            if (r.Status == "DRAFT") return "PENDING";
            var results = r.Results ?? new List<WaterTestResult>();
            if (!results.Any()) return "PASS";
            
            bool hasFail = results.Any(res => res.QualityStatus == "FAIL");
            if (hasFail) return "FAIL";

            bool hasWarning = results.Any(res => res.QualityStatus == "WARNING");
            if (hasWarning) return "WARNING";

            return "PASS";
        }

        private WaterTestReportDto MapToDto(WaterTestReport r, Dictionary<string, string> userNames)
        {
            var now = DateTime.UtcNow;
            var resultDtos = new List<WaterTestResultDto>();
            int completedCount = 0;
            int pendingCount = 0;
            int overdueCount = 0;
            bool hasOverdue = false;
            DateTime? earliestDueAt = null;

            foreach (var res in (r.Results ?? new List<WaterTestResult>()))
            {
                var hasEnteredResult = res.Value.HasValue || (!string.IsNullOrWhiteSpace(res.StringValue) && res.StringValue != "—" && !res.StringValue.Equals("not entered", StringComparison.OrdinalIgnoreCase) && !res.StringValue.Equals("pending", StringComparison.OrdinalIgnoreCase));
                
                string runtimeStatus;
                bool isOverdue = false;
                double? remainingHours = null;
                double? hoursOverdue = null;

                if (hasEnteredResult || res.ResultStatus == "COMPLETED")
                {
                    runtimeStatus = "COMPLETED";
                    completedCount++;
                }
                else if (res.ExpectedCompletionAt.HasValue && now > res.ExpectedCompletionAt.Value)
                {
                    runtimeStatus = "OVERDUE";
                    isOverdue = true;
                    hasOverdue = true;
                    overdueCount++;
                    hoursOverdue = Math.Round((now - res.ExpectedCompletionAt.Value).TotalHours, 1);
                }
                else if (res.ExpectedCompletionAt.HasValue && (res.ExpectedCompletionAt.Value - now).TotalHours <= 0)
                {
                    runtimeStatus = "PENDING_RESULT";
                    pendingCount++;
                }
                else if (res.RequiredDurationHours > 0 || res.StartedAt.HasValue)
                {
                    runtimeStatus = "IN_PROGRESS";
                    pendingCount++;
                    if (res.ExpectedCompletionAt.HasValue)
                    {
                        remainingHours = Math.Max(0, Math.Round((res.ExpectedCompletionAt.Value - now).TotalHours, 1));
                        if (!earliestDueAt.HasValue || res.ExpectedCompletionAt.Value < earliestDueAt.Value)
                        {
                            earliestDueAt = res.ExpectedCompletionAt.Value;
                        }
                    }
                }
                else
                {
                    runtimeStatus = "PENDING_RESULT";
                    pendingCount++;
                }

                resultDtos.Add(new WaterTestResultDto
                {
                    Id = res.Id,
                    ParameterId = res.ParameterId,
                    ParameterName = res.Parameter?.Name ?? "Unknown",
                    ParameterCategory = res.Parameter?.Category ?? "Unknown",
                    ParameterUnit = res.Parameter?.Unit ?? "—",
                    MinWarning = res.Parameter?.MinWarning,
                    MinAcceptable = res.Parameter?.MinAcceptable,
                    MaxAcceptable = res.Parameter?.MaxAcceptable,
                    MaxWarning = res.Parameter?.MaxWarning,
                    Value = res.Value,
                    StringValue = res.StringValue,
                    IsPass = res.IsPass,
                    QualityStatus = res.QualityStatus ?? "PASS",
                    RequiredDurationHours = res.RequiredDurationHours > 0 ? res.RequiredDurationHours : (res.Parameter?.RequiredDurationHours ?? 0),
                    StartedAt = res.StartedAt,
                    ExpectedCompletionAt = res.ExpectedCompletionAt,
                    ActualCompletedAt = res.ActualCompletedAt,
                    ResultStatus = runtimeStatus,
                    IsDelayed = (res.RequiredDurationHours > 0 || (res.Parameter?.RequiredDurationHours ?? 0) > 0),
                    IsOverdue = isOverdue,
                    RemainingHours = remainingHours,
                    HoursOverdue = hoursOverdue
                });
            }

            string reportCompletionStatus;
            if (resultDtos.Count == 0 || r.Status == "DRAFT")
            {
                reportCompletionStatus = "DRAFT";
            }
            else if (completedCount == resultDtos.Count)
            {
                reportCompletionStatus = "COMPLETED";
            }
            else if (overdueCount > 0)
            {
                reportCompletionStatus = "RESULTS_OVERDUE";
            }
            else if (completedCount > 0)
            {
                reportCompletionStatus = "PARTIALLY_COMPLETED";
            }
            else
            {
                reportCompletionStatus = "IN_PROGRESS";
            }

            return new WaterTestReportDto
            {
                Id = r.Id,
                ReportNumber = r.Id.ToString().Length >= 8 ? r.Id.ToString().Substring(0, 8).ToUpper() : r.Id.ToString().ToUpper(),
                BatchNumber = r.BatchNumber ?? string.Empty,
                SampleNumber = r.SampleNumber,
                ProductionDate = r.ProductionDate,
                ReportType = r.ReportType ?? "DAILY",
                Status = r.Status ?? "DRAFT",
                ReportCompletionStatus = reportCompletionStatus,
                SampleTime = r.SampleTime,
                TestedBy = r.TestedBy,
                CollectedBy = r.CollectedBy,
                VerifiedBy = r.VerifiedBy,
                Remarks = r.Remarks,
                Attachments = r.Attachments,
                ConcurrencyToken = r.ConcurrencyToken ?? string.Empty,
                CreatedAt = r.CreatedAt,
                CreatedBy = r.CreatedBy ?? string.Empty,
                CreatedByName = !string.IsNullOrEmpty(r.CreatedBy) && userNames.TryGetValue(r.CreatedBy, out var name) ? name : "System",
                TotalParametersCount = resultDtos.Count,
                CompletedParametersCount = completedCount,
                PendingParametersCount = pendingCount,
                OverdueParametersCount = overdueCount,
                HasOverdueResults = hasOverdue,
                EarliestDueAt = earliestDueAt,
                Results = resultDtos
            };
        }

        private string EvaluateResult(string parameterName, double? value, string? stringValue)
        {
            var pName = parameterName.Trim();
            var param = _context.WaterTestParameters.Local.FirstOrDefault(p => p.Name.Equals(pName, StringComparison.OrdinalIgnoreCase))
                        ?? _context.WaterTestParameters.FirstOrDefault(p => p.Name.Equals(pName, StringComparison.OrdinalIgnoreCase));
            
            if (param == null)
            {
                param = new WaterTestParameter
                {
                    Name = pName,
                    Category = pName.Equals("e.coli", StringComparison.OrdinalIgnoreCase) || 
                               pName.Equals("coliform", StringComparison.OrdinalIgnoreCase) || 
                               pName.Equals("pseudomonas", StringComparison.OrdinalIgnoreCase) || 
                               pName.Equals("clostridia", StringComparison.OrdinalIgnoreCase) || 
                               pName.Equals("yeast & mold", StringComparison.OrdinalIgnoreCase) ||
                               pName.Contains("aerobic") || pName.Contains("amc") ? "MICROBIOLOGY" : "PHYSICAL",
                    Unit = "—"
                };
            }

            return _evaluationService.EvaluateParameter(param, value, stringValue);
        }

        public async Task<WaterTestParameterDto> CreateOrUpdateParameterAsync(WaterTestParameterDto request)
        {
            var currentUserId = _currentUserContext.UserId ?? "System";
            WaterTestParameter param;

            if (request.Id != Guid.Empty)
            {
                param = await _context.WaterTestParameters.FirstOrDefaultAsync(p => p.Id == request.Id);
                if (param == null)
                {
                    param = new WaterTestParameter { Id = request.Id };
                    _context.WaterTestParameters.Add(param);
                }
            }
            else
            {
                param = new WaterTestParameter { Id = Guid.NewGuid(), CreatedAt = DateTime.UtcNow, CreatedBy = currentUserId };
                _context.WaterTestParameters.Add(param);
            }

            param.Name = request.Name;
            param.Category = request.Category;
            param.Frequency = string.IsNullOrWhiteSpace(request.Frequency) ? "DAILY" : request.Frequency.Trim().ToUpperInvariant();
            param.Unit = request.Unit;
            param.MinWarning = request.MinWarning;
            param.MinAcceptable = request.MinAcceptable;
            param.MaxAcceptable = request.MaxAcceptable;
            param.MaxWarning = request.MaxWarning;
            param.RequiredDurationHours = request.RequiredDurationHours;
            param.IsActive = true;
            param.UpdatedAt = DateTime.UtcNow;
            param.UpdatedBy = currentUserId;

            await _context.SaveChangesAsync();

            return new WaterTestParameterDto
            {
                Id = param.Id,
                Name = param.Name,
                Category = param.Category,
                Frequency = param.Frequency,
                Unit = param.Unit,
                MinWarning = param.MinWarning,
                MinAcceptable = param.MinAcceptable,
                MaxAcceptable = param.MaxAcceptable,
                MaxWarning = param.MaxWarning,
                RequiredDurationHours = param.RequiredDurationHours
            };
        }

        public async Task<List<ComplianceRecordDto>> GetComplianceRecordsAsync()
        {
            var tenantId = GetTenantId();
            var records = await _context.ComplianceRecords
                .Where(c => c.TenantId == tenantId && !c.IsDeleted)
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();

            return records.Select(c => new ComplianceRecordDto
            {
                Id = c.Id,
                ReportId = c.ReportId,
                ReferenceNumber = c.ReferenceNumber,
                Type = c.Type,
                Severity = c.Severity,
                Status = c.Status,
                ParameterName = c.ParameterName,
                BatchNumber = c.BatchNumber,
                DefectDescription = c.DefectDescription,
                MeasuredValue = c.MeasuredValue,
                ExpectedRange = c.ExpectedRange,
                RootCauseAnalysis = c.RootCauseAnalysis,
                CorrectiveAction = c.CorrectiveAction,
                PreventiveAction = c.PreventiveAction,
                AssignedTo = c.AssignedTo,
                TargetResolutionDate = c.TargetResolutionDate,
                ResolvedAt = c.ResolvedAt,
                ResolvedBy = c.ResolvedBy,
                ResolutionNotes = c.ResolutionNotes,
                CreatedAt = c.CreatedAt,
                CreatedBy = c.CreatedBy
            }).ToList();
        }

        public async Task<bool> ResolveComplianceRecordAsync(Guid recordId, ResolveComplianceRequest request)
        {
            var tenantId = GetTenantId();
            var record = await _context.ComplianceRecords.FirstOrDefaultAsync(c => c.Id == recordId && c.TenantId == tenantId && !c.IsDeleted);
            if (record == null) return false;

            record.Status = "RESOLVED";
            record.RootCauseAnalysis = request.RootCauseAnalysis;
            record.CorrectiveAction = request.CorrectiveAction;
            record.PreventiveAction = request.PreventiveAction;
            record.ResolutionNotes = request.ResolutionNotes;
            record.ResolvedAt = DateTime.UtcNow;
            record.ResolvedBy = _currentUserContext.Email ?? _currentUserContext.UserId ?? "QC Manager";
            record.UpdatedAt = DateTime.UtcNow;

            await LogQCActionAsync(record.ReportId, record.ReferenceNumber, "COMPLIANCE_RESOLVE", $"Compliance record {record.ReferenceNumber} resolved by {record.ResolvedBy}.");
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<QCSettingsDto> GetQCSettingsAsync()
        {
            var tenantId = GetTenantId();
            var settings = await _context.QCSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId);
            var platformTenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
            var defaultFssai = platformTenant?.LicenseNumber;

            if (settings == null)
            {
                return new QCSettingsDto
                {
                    FssaiNumber = defaultFssai
                };
            }

            return new QCSettingsDto
            {
                AutoGenerateCAPAOnFailure = settings.AutoGenerateCAPAOnFailure,
                RequireVerificationBeforeSubmit = settings.RequireVerificationBeforeSubmit,
                StandardComplianceType = settings.StandardComplianceType,
                DigitalSignatureTitle = settings.DigitalSignatureTitle,
                LabAddress = settings.LabAddress,
                ContactEmail = settings.ContactEmail,
                NotificationRecipients = settings.NotificationRecipients,
                FssaiNumber = !string.IsNullOrWhiteSpace(settings.FssaiNumber) ? settings.FssaiNumber : defaultFssai,
                BisNumber = settings.BisNumber,
                AdditionalLicensesJson = settings.AdditionalLicensesJson
            };
        }

        public async Task<QCSettingsDto> UpdateQCSettingsAsync(QCSettingsDto dto)
        {
            var tenantId = GetTenantId();
            var companyId = await GetCompanyIdAsync();
            var currentUserId = _currentUserContext.UserId ?? "System";

            var settings = await _context.QCSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId);
            if (settings == null)
            {
                settings = new QCSettings
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = currentUserId
                };
                _context.QCSettings.Add(settings);
            }

            settings.AutoGenerateCAPAOnFailure = dto.AutoGenerateCAPAOnFailure;
            settings.RequireVerificationBeforeSubmit = dto.RequireVerificationBeforeSubmit;
            settings.StandardComplianceType = dto.StandardComplianceType;
            settings.DigitalSignatureTitle = dto.DigitalSignatureTitle;
            settings.LabAddress = dto.LabAddress;
            settings.ContactEmail = dto.ContactEmail;
            settings.NotificationRecipients = dto.NotificationRecipients;
            settings.FssaiNumber = dto.FssaiNumber?.Trim();
            settings.BisNumber = dto.BisNumber?.Trim();
            settings.AdditionalLicensesJson = dto.AdditionalLicensesJson;
            settings.UpdatedAt = DateTime.UtcNow;
            settings.UpdatedBy = currentUserId;

            await _context.SaveChangesAsync();

            // Synchronize FSSAI License Number with Platform Tenant details
            try
            {
                var platformTenant = await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId);
                if (platformTenant != null && !string.IsNullOrWhiteSpace(dto.FssaiNumber))
                {
                    platformTenant.LicenseNumber = dto.FssaiNumber.Trim();
                    await _platformContext.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not synchronize FSSAI number to platform tenant profile: {Message}", ex.Message);
            }

            return dto;
        }

        public async Task<List<QCAuditLogDto>> GetQCAuditLogsAsync(Guid? reportId = null)
        {
            var tenantId = GetTenantId();
            var query = _context.QCAuditLogs.Where(l => l.TenantId == tenantId);
            if (reportId.HasValue)
            {
                query = query.Where(l => l.ReportId == reportId.Value);
            }

            var logs = await query.OrderByDescending(l => l.Timestamp).Take(100).ToListAsync();
            return logs.Select(l => new QCAuditLogDto
            {
                Id = l.Id,
                ReportId = l.ReportId,
                ReportNumber = l.ReportNumber,
                Action = l.Action,
                PerformedBy = l.PerformedBy,
                UserRole = l.UserRole,
                Timestamp = l.Timestamp,
                Details = l.Details,
                IPAddress = l.IPAddress
            }).ToList();
        }

        public async Task<byte[]> GenerateReportPdfAsync(Guid reportId)
        {
            var tenantId = GetTenantId();
            var report = await _context.WaterTestReports
                .Include(r => r.Results)
                    .ThenInclude(res => res.Parameter)
                .FirstOrDefaultAsync(r => r.Id == reportId && r.TenantId == tenantId && !r.IsDeleted);

            if (report == null) throw new InvalidOperationException("Report not found.");

            var company = await _context.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
            var tenant = tenantId != Guid.Empty
                ? await _platformContext.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId)
                : null;

            string companyName = !string.IsNullOrWhiteSpace(company?.Name) && company.Name != "Company"
                ? company.Name
                : (tenant?.Name ?? "Aquora Enterprise");
            string companyAddress = tenant?.Address ?? string.Empty;

            await LogQCActionAsync(report.Id, report.Id.ToString().Substring(0, 8).ToUpper(), "PDF_EXPORT", $"Generated PDF Certificate of Analysis for Report #{report.Id.ToString().Substring(0, 8).ToUpper()}");
            await _context.SaveChangesAsync();

            return await _pdfService.GenerateCertificatePdfAsync(report, companyName, companyAddress);
        }

        private async Task CheckAndGenerateCAPAsAsync(WaterTestReport report)
        {
            try
            {
                var tenantId = GetTenantId();
                var companyId = await GetCompanyIdAsync();
                var settings = await _context.QCSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId);
                
                if (settings != null && settings.AutoGenerateCAPAOnFailure)
                {
                    var failedResults = report.Results.Where(r => r.QualityStatus == "FAIL").ToList();
                    foreach (var fail in failedResults)
                    {
                        var paramName = fail.Parameter?.Name ?? "Unknown Parameter";
                        bool exists = await _context.ComplianceRecords.AnyAsync(c => c.ReportId == report.Id && c.ParameterName == paramName && !c.IsDeleted);
                        if (!exists)
                        {
                            var record = new ComplianceRecord
                            {
                                Id = Guid.NewGuid(),
                                TenantId = tenantId,
                                CompanyId = companyId,
                                ReportId = report.Id,
                                ReferenceNumber = $"NCR-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..4].ToUpper()}",
                                Type = "NON_CONFORMANCE",
                                Severity = "HIGH",
                                Status = "OPEN",
                                ParameterName = paramName,
                                BatchNumber = report.BatchNumber,
                                DefectDescription = $"Parameter '{paramName}' failed quality evaluation. Measured: {fail.Value?.ToString() ?? fail.StringValue ?? "Out of Range"}.",
                                MeasuredValue = fail.Value?.ToString() ?? fail.StringValue ?? "N/A",
                                ExpectedRange = fail.Parameter != null ? $"{fail.Parameter.MinAcceptable?.ToString() ?? "N/A"} - {fail.Parameter.MaxAcceptable?.ToString() ?? "N/A"} {fail.Parameter.Unit}" : "Standard Range",
                                AssignedTo = "QC Manager",
                                TargetResolutionDate = DateTime.UtcNow.AddDays(3),
                                CreatedAt = DateTime.UtcNow,
                                CreatedBy = _currentUserContext.Email ?? _currentUserContext.UserId ?? "System"
                            };
                            _context.ComplianceRecords.Add(record);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CAPA AUTO GENERATION ERROR]: {ex.Message}");
            }
        }

        private async Task LogQCActionAsync(Guid? reportId, string? reportNumber, string action, string details, string? oldValues = null, string? newValues = null)
        {
            try
            {
                var tenantId = GetTenantId();
                var companyId = await GetCompanyIdAsync();
                var log = new QCAuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    CompanyId = companyId,
                    ReportId = reportId,
                    ReportNumber = reportNumber,
                    Action = action,
                    PerformedBy = _currentUserContext.Email ?? _currentUserContext.UserId ?? "System User",
                    UserRole = "QC User",
                    Timestamp = DateTime.UtcNow,
                    Details = details,
                    OldValues = oldValues,
                    NewValues = newValues
                };
                _context.QCAuditLogs.Add(log);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[QC AUDIT LOG ERROR]: {ex.Message}");
            }
        }

        private WaterTestParameter ResolveOrCreateParameter(
            string rawKey,
            List<WaterTestParameter> parameters,
            Dictionary<string, WaterTestParameter> parameterMap,
            string currentUserId)
        {
            var normalizedKey = NormalizeParameterKey(rawKey);
            if (parameterMap.TryGetValue(normalizedKey, out var param))
            {
                return param;
            }

            param = parameters.FirstOrDefault(p =>
                p.Id.ToString().Equals(normalizedKey, StringComparison.OrdinalIgnoreCase) ||
                p.Name.Equals(normalizedKey, StringComparison.OrdinalIgnoreCase) ||
                QCDefaultParameters.NormalizeKey(p.Name).Equals(QCDefaultParameters.NormalizeKey(normalizedKey), StringComparison.OrdinalIgnoreCase));

            if (param != null)
            {
                parameterMap[normalizedKey] = param;
                return param;
            }

            // Lookup canonical definition from catalog
            var defaultDef = QCDefaultParameters.Catalog.FirstOrDefault(d =>
                d.Name.Equals(normalizedKey, StringComparison.OrdinalIgnoreCase) ||
                QCDefaultParameters.NormalizeKey(d.Name).Equals(QCDefaultParameters.NormalizeKey(normalizedKey), StringComparison.OrdinalIgnoreCase));

            if (defaultDef != null)
            {
                param = new WaterTestParameter
                {
                    Id = Guid.NewGuid(),
                    Name = defaultDef.Name,
                    Category = defaultDef.Category,
                    Unit = defaultDef.Unit,
                    MinWarning = defaultDef.MinWarning,
                    MinAcceptable = defaultDef.MinAcceptable,
                    MaxAcceptable = defaultDef.MaxAcceptable,
                    MaxWarning = defaultDef.MaxWarning,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = currentUserId
                };
            }
            else
            {
                param = new WaterTestParameter
                {
                    Id = Guid.NewGuid(),
                    Name = normalizedKey,
                    Category = normalizedKey.Equals("e.coli", StringComparison.OrdinalIgnoreCase) ||
                               normalizedKey.Equals("coliform", StringComparison.OrdinalIgnoreCase) ||
                               normalizedKey.Equals("pseudomonas", StringComparison.OrdinalIgnoreCase) ||
                               normalizedKey.Equals("clostridia", StringComparison.OrdinalIgnoreCase) ||
                               normalizedKey.Equals("yeast & mold", StringComparison.OrdinalIgnoreCase) ||
                               normalizedKey.Contains("aerobic") || normalizedKey.Contains("amc") ? "MICROBIOLOGY" : "PHYSICAL",
                    Unit = "—",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = currentUserId
                };
            }

            _context.WaterTestParameters.Add(param);
            parameters.Add(param);
            parameterMap[param.Name.Trim()] = param;
            parameterMap[param.Id.ToString()] = param;
            parameterMap[normalizedKey] = param;

            return param;
        }
    }
}
