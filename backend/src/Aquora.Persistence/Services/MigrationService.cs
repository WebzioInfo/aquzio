using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Aquora.Application.Interfaces;
using Aquora.Application.Services;
using Aquora.Domain.Entities;
using Aquora.Persistence.Context;
using Aquora.Shared.Constants;

namespace Aquora.Persistence.Services
{
    public class MigrationService : IMigrationService
    {
        private readonly PlatformDbContext _platformContext;
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<MigrationService> _logger;

        public MigrationService(PlatformDbContext platformContext, IServiceProvider serviceProvider, ILogger<MigrationService> logger)
        {
            _platformContext = platformContext;
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public async Task MigrateAllAsync()
        {
            try
            {
                _logger.LogInformation("Executing Platform Database Migrations (public schema)...");
                await _platformContext.Database.MigrateAsync();
                _logger.LogInformation("Platform Database Migrations applied successfully.");

                // Self-heal: Drop NOT NULL constraint on PlatformAuditLogs columns which causes login crash
                _logger.LogInformation("[SCHEMA FIX] Altering PlatformAuditLogs columns to nullable...");
                try
                {
#pragma warning disable EF1003
                    await _platformContext.Database.ExecuteSqlRawAsync(@"
                        ALTER TABLE public.""PlatformAuditLogs"" ALTER COLUMN ""OldValues"" DROP NOT NULL;
                        ALTER TABLE public.""PlatformAuditLogs"" ALTER COLUMN ""NewValues"" DROP NOT NULL;
                    ");
#pragma warning restore EF1003
                    _logger.LogInformation("[SCHEMA FIX] PlatformAuditLogs columns altered successfully.");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[SCHEMA FIX WARN] Failed to drop NOT NULL constraints on PlatformAuditLogs: {Message}", ex.Message);
                }

                // Auto-repair missing columns in public."Tenants" and public."Users" tables
                _logger.LogInformation("[SCHEMA REPAIR] Ensuring missing columns exist on public.Tenants and public.Users...");
                var platformRepairScript = @"
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""OwnerName"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""OwnerEmail"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""OwnerPhone"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""Address"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""GstNumber"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""PanNumber"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""LicenseNumber"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""SubscriptionPlan"" text NOT NULL DEFAULT 'Starter';
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""Timezone"" text NOT NULL DEFAULT 'UTC';
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""Currency"" text NOT NULL DEFAULT 'USD';
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""Language"" text NOT NULL DEFAULT 'en';
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""LogoUrl"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""LogoPublicId"" text NULL;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""Theme"" text NOT NULL DEFAULT 'light';
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""StorageUsedMb"" double precision NOT NULL DEFAULT 0.0;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""ActiveUsersCount"" integer NOT NULL DEFAULT 0;
                ALTER TABLE public.""Tenants"" ADD COLUMN IF NOT EXISTS ""IsBiodropsProduction"" boolean NOT NULL DEFAULT false;

                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""Phone"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""RoleName"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""Designation"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""Shift"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""Salary"" numeric NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""JoiningDate"" timestamp with time zone NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""PhotoUrl"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""PhotoPublicId"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""SignatureUrl"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""SignaturePublicId"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""Qualification"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""CertificationDetails"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""ExperienceYears"" integer NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""AssignedLabStation"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""QcResponsibilities"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""DevicesCount"" integer NOT NULL DEFAULT 1;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""CurrentSalary"" numeric NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""PinHash"" text NULL;
                ALTER TABLE public.""Users"" ADD COLUMN IF NOT EXISTS ""TokenVersion"" integer NOT NULL DEFAULT 0;

                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""VerifiedAt"" timestamp with time zone NULL;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""IsUsed"" boolean NOT NULL DEFAULT false;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""UsedAt"" timestamp with time zone NULL;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""ResetToken"" text NULL;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""ResetTokenExpiryTime"" timestamp with time zone NULL;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""NewEmail"" text NULL;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""Attempts"" integer NOT NULL DEFAULT 0;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""SendCount"" integer NOT NULL DEFAULT 0;
                ALTER TABLE public.""OTPVerifications"" ADD COLUMN IF NOT EXISTS ""LastSentAt"" timestamp with time zone NULL;

                CREATE TABLE IF NOT EXISTS public.""SubscriptionPlans"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""Name"" text NOT NULL,
                    ""Code"" text NOT NULL,
                    ""Description"" text NOT NULL,
                    ""MonthlyPrice"" numeric NOT NULL,
                    ""YearlyPrice"" numeric NOT NULL,
                    ""OfferPrice"" numeric NULL,
                    ""DiscountPercent"" numeric NULL,
                    ""Currency"" text NOT NULL DEFAULT 'USD',
                    ""BillingCycle"" text NOT NULL DEFAULT 'Monthly',
                    ""TrialDays"" integer NOT NULL DEFAULT 14,
                    ""DurationDays"" integer NOT NULL DEFAULT 30,
                    ""DisplayOrder"" integer NOT NULL DEFAULT 1,
                    ""IsPopular"" boolean NOT NULL DEFAULT false,
                    ""IsRecommended"" boolean NOT NULL DEFAULT false,
                    ""Color"" text NOT NULL DEFAULT '#3B82F6',
                    ""Status"" text NOT NULL DEFAULT 'Published',
                    ""TaxType"" text NOT NULL DEFAULT 'Tax Exclusive',
                    ""AutoActivateTrial"" boolean NOT NULL DEFAULT true,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""CreatedBy"" text NOT NULL DEFAULT 'System',
                    ""UpdatedAt"" timestamp with time zone NULL,
                    ""UpdatedBy"" text NULL,
                    ""CreatedByIP"" text NULL,
                    ""UpdatedByIP"" text NULL,
                    ""IsDeleted"" boolean NOT NULL DEFAULT false,
                    ""DeletedAt"" timestamp with time zone NULL,
                    ""DeletedBy"" text NULL
                );

                CREATE TABLE IF NOT EXISTS public.""SubscriptionPlanLimits"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""PlanId"" uuid NOT NULL REFERENCES public.""SubscriptionPlans""(""Id"") ON DELETE CASCADE,
                    ""ProductionLines"" integer NOT NULL DEFAULT 3,
                    ""Machines"" integer NOT NULL DEFAULT 10,
                    ""Employees"" integer NOT NULL DEFAULT 25,
                    ""Customers"" integer NOT NULL DEFAULT 100,
                    ""Suppliers"" integer NOT NULL DEFAULT 50,
                    ""Warehouses"" integer NOT NULL DEFAULT 2,
                    ""ProductionBatches"" integer NOT NULL DEFAULT 500,
                    ""Products"" integer NOT NULL DEFAULT 100,
                    ""RawMaterials"" integer NOT NULL DEFAULT 200,
                    ""StorageGB"" integer NOT NULL DEFAULT 50,
                    ""APIRequestsPerMin"" integer NOT NULL DEFAULT 1000,
                    ""FileUploadSizeMB"" integer NOT NULL DEFAULT 25,
                    ""DailyExports"" integer NOT NULL DEFAULT 50,
                    ""ConcurrentUsers"" integer NOT NULL DEFAULT 10,
                    ""SMSLimit"" integer NOT NULL DEFAULT 100,
                    ""EmailLimit"" integer NOT NULL DEFAULT 1000,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""UpdatedAt"" timestamp with time zone NULL
                );

                CREATE TABLE IF NOT EXISTS public.""SubscriptionFeatures"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""PlanId"" uuid NOT NULL REFERENCES public.""SubscriptionPlans""(""Id"") ON DELETE CASCADE,
                    ""FeatureName"" text NOT NULL,
                    ""FeatureDescription"" text NULL,
                    ""FeatureCategory"" text NOT NULL DEFAULT 'Core Modules',
                    ""FeatureValue"" text NOT NULL DEFAULT 'Yes',
                    ""FeatureUnit"" text NULL,
                    ""DisplayOrder"" integer NOT NULL DEFAULT 1,
                    ""IsHighlighted"" boolean NOT NULL DEFAULT false,
                    ""IsUnlimited"" boolean NOT NULL DEFAULT false,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS public.""TenantSubscriptions"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""PlanId"" uuid NOT NULL,
                    ""PlanName"" text NOT NULL,
                    ""Status"" text NOT NULL DEFAULT 'Active',
                    ""BillingCycle"" text NOT NULL DEFAULT 'Monthly',
                    ""PricePaid"" numeric NOT NULL DEFAULT 0.0,
                    ""Currency"" text NOT NULL DEFAULT 'USD',
                    ""StartDate"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""EndDate"" timestamp with time zone NOT NULL,
                    ""TrialEndDate"" timestamp with time zone NULL,
                    ""AutoRenew"" boolean NOT NULL DEFAULT true,
                    ""AssignedByUserId"" text NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""UpdatedAt"" timestamp with time zone NULL
                );

                CREATE TABLE IF NOT EXISTS public.""SubscriptionAuditLogs"" (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""PlanId"" uuid NULL,
                    ""TenantId"" uuid NULL,
                    ""Action"" text NOT NULL,
                    ""PerformerUserId"" text NOT NULL,
                    ""PerformerUserEmail"" text NOT NULL,
                    ""OldValuesJson"" text NULL,
                    ""NewValuesJson"" text NULL,
                    ""Reason"" text NOT NULL,
                    ""Timestamp"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""IpAddress"" text NOT NULL DEFAULT '127.0.0.1'
                );
                ";
#pragma warning disable EF1003
                await _platformContext.Database.ExecuteSqlRawAsync(platformRepairScript);
#pragma warning restore EF1003

                _logger.LogInformation("Executing Tenant Database Migrations for active tenants...");
                var tenants = await _platformContext.Set<Aquora.Domain.Entities.Tenant>()
                    .Where(t => t.IsActive && !t.IsDeleted)
                    .ToListAsync();

                _logger.LogInformation("--- Platform Database Dump (public schema) ---");
                _logger.LogInformation("Total Tenants found: {Count}", tenants.Count);
                foreach (var t in tenants)
                {
                    _logger.LogInformation("  Tenant: ID={Id}, Name='{Name}', Code='{Code}', Schema='{Schema}', Created={Created}", 
                        t.Id, t.Name, t.Code, t.SchemaName, t.CreatedAt);
                }

                var users = await _platformContext.Set<Aquora.Domain.Entities.User>()
                    .Where(u => !u.IsDeleted)
                    .ToListAsync();
                _logger.LogInformation("Total Users found: {Count}", users.Count);
                foreach (var u in users)
                {
                    _logger.LogInformation("  User: ID={Id}, Name='{Name}', Email='{Email}', TenantId={TenantId}, Created={Created}", 
                        u.Id, $"{u.FirstName} {u.LastName}", u.Email, u.TenantId, u.CreatedAt);
                }
                _logger.LogInformation("----------------------------------------------");

                foreach (var tenant in tenants)
                {
                    try
                    {
                        _logger.LogInformation($"Migrating tenant: {tenant.Name} (Schema: {tenant.SchemaName})...");
                        using (var tenantScope = _serviceProvider.CreateScope())
                        {
                            var tenantProvider = tenantScope.ServiceProvider.GetRequiredService<ITenantProvider>();
                            tenantProvider.SetTenantId(tenant.Id);
                            tenantProvider.SetTenantSchemaName(tenant.SchemaName);
                            TenantSchemaResolver.CurrentSchemaName = tenant.SchemaName;

                            var tenantContext = tenantScope.ServiceProvider.GetRequiredService<TenantDbContext>();

                             // Check migration history and clean up legacy manually-created tables
                              bool hasFinanceModule = false;
                              bool hasSimpleAccounts = false;
                              bool hasBankLedger = false;
                              bool hasProductPricing = false;
                              bool hasConcurrencyTokens = false;
                              bool hasRemoveRowVersion = false;
                               try
                               {
                                   var conn = tenantContext.Database.GetDbConnection();
                                   if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
                                   
                                   using (var cmd = conn.CreateCommand())
                                   {
                                       cmd.CommandText = $@"
                                           SELECT EXISTS (
                                               SELECT FROM information_schema.tables 
                                               WHERE table_schema = '{tenant.SchemaName}' 
                                               AND table_name = '__EFMigrationsHistory'
                                           );";
                                       var historyExists = (bool)(await cmd.ExecuteScalarAsync() ?? false);
                                       if (historyExists)
                                       {
                                           cmd.CommandText = $@"SELECT ""MigrationId"" FROM ""{tenant.SchemaName}"".""__EFMigrationsHistory"";";
                                           using (var reader = await cmd.ExecuteReaderAsync())
                                           {
                                               var applied = new HashSet<string>();
                                               while (await reader.ReadAsync())
                                               {
                                                   applied.Add(reader.GetString(0));
                                               }
                                               hasFinanceModule = applied.Contains("20260729191421_AddFinanceModule");
                                               hasSimpleAccounts = applied.Contains("20260803120000_AddSimpleAccountsModule");
                                               hasBankLedger = applied.Contains("20260803073729_AddBankLedgerEntry");
                                               hasProductPricing = applied.Contains("20260729200058_AddProductPricing");
                                               hasConcurrencyTokens = applied.Contains("20260725103118_AddConcurrencyTokens");
                                               hasRemoveRowVersion = applied.Contains("20260730071552_RemoveRowVersion");
                                           }
                                       }
                                   }

                                   using (var cmd = conn.CreateCommand())
                                   {
                                       if (!hasProductPricing)
                                       {
                                           _logger.LogInformation($"[SELF-HEAL] Dropping legacy Product pricing columns for {tenant.SchemaName} to allow EF migration...");
                                           cmd.CommandText = $@"
                                               ALTER TABLE ""{tenant.SchemaName}"".""Products"" DROP COLUMN IF EXISTS ""SellingPrice"";
                                               ALTER TABLE ""{tenant.SchemaName}"".""Products"" DROP COLUMN IF EXISTS ""UnitCost"";";
                                           await cmd.ExecuteNonQueryAsync();
                                       }

                                       // Only drop RowVersion from DB if AddConcurrencyTokens has NOT run yet, or if RemoveRowVersion HAS run.
                                       // If AddConcurrencyTokens HAS run but RemoveRowVersion has NOT, we must leave RowVersion there so EF Core's RemoveRowVersion migration can drop it.
                                       if (!hasConcurrencyTokens)
                                       {
                                           _logger.LogInformation($"[SELF-HEAL] Dropping legacy RowVersion columns from {tenant.SchemaName} to allow EF Core to add them...");
                                           cmd.CommandText = $@"
                                               ALTER TABLE ""{tenant.SchemaName}"".""Products"" DROP COLUMN IF EXISTS ""RowVersion"";
                                               ALTER TABLE ""{tenant.SchemaName}"".""RawMaterials"" DROP COLUMN IF EXISTS ""RowVersion"";";
                                           await cmd.ExecuteNonQueryAsync();
                                       }
                                       else if (!hasRemoveRowVersion)
                                       {
                                           _logger.LogInformation($"[SELF-HEAL] Ensuring RowVersion columns exist in {tenant.SchemaName} so EF Core's RemoveRowVersion migration can drop them...");
                                           cmd.CommandText = $@"
                                               ALTER TABLE ""{tenant.SchemaName}"".""Products"" ADD COLUMN IF NOT EXISTS ""RowVersion"" bytea NULL;
                                               ALTER TABLE ""{tenant.SchemaName}"".""RawMaterials"" ADD COLUMN IF NOT EXISTS ""RowVersion"" bytea NULL;";
                                           await cmd.ExecuteNonQueryAsync();
                                       }
                                       else if (hasRemoveRowVersion)
                                       {
                                           _logger.LogInformation($"[SELF-HEAL] Cleaning up orphaned RowVersion columns from {tenant.SchemaName}...");
                                           cmd.CommandText = $@"
                                               ALTER TABLE ""{tenant.SchemaName}"".""Products"" DROP COLUMN IF EXISTS ""RowVersion"";
                                               ALTER TABLE ""{tenant.SchemaName}"".""RawMaterials"" DROP COLUMN IF EXISTS ""RowVersion"";";
                                           await cmd.ExecuteNonQueryAsync();
                                       }
                                   }
                               }
                               catch (Exception ex)
                               {
                                   _logger.LogWarning($"[SELF-HEAL WARN]: Failed legacy tables cleanup for {tenant.SchemaName}: {ex.Message}");
                               }

                             await tenantContext.Database.MigrateAsync();

                            _logger.LogInformation($"[SCHEMA SYNC] Applying EF Core migrations for {tenant.SchemaName}...");

                            // Ensure EventType, EventLabel, AuditNotes exist and populate legacy nulls
                            try
                            {
                                var conn = tenantContext.Database.GetDbConnection();
                                if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
                                using (var cmd = conn.CreateCommand())
                                {
                                    cmd.CommandText = $@"
                                         ALTER TABLE ""{tenant.SchemaName}"".""CashBooks"" ADD COLUMN IF NOT EXISTS ""OwnerId"" uuid NULL;
                                         CREATE INDEX IF NOT EXISTS ""IX_CashBooks_TenantId_OwnerId"" ON ""{tenant.SchemaName}"".""CashBooks"" (""TenantId"", ""OwnerId"");
                                         ALTER TABLE ""{tenant.SchemaName}"".""ProductionEntries"" ADD COLUMN IF NOT EXISTS ""WaterWastageLitres"" numeric(18,2) NOT NULL DEFAULT 0;
                                         ALTER TABLE ""{tenant.SchemaName}"".""BankLedgerEntries"" ADD COLUMN IF NOT EXISTS ""EventType"" text NULL DEFAULT 'CREATED';
                                         ALTER TABLE ""{tenant.SchemaName}"".""BankLedgerEntries"" ADD COLUMN IF NOT EXISTS ""EventLabel"" text NULL;
                                         ALTER TABLE ""{tenant.SchemaName}"".""BankLedgerEntries"" ADD COLUMN IF NOT EXISTS ""AuditNotes"" text NULL;
                                         ALTER TABLE ""{tenant.SchemaName}"".""Customers"" ADD COLUMN IF NOT EXISTS ""Price"" numeric NOT NULL DEFAULT 0;
                                         ALTER TABLE ""{tenant.SchemaName}"".""Customers"" ADD COLUMN IF NOT EXISTS ""Discount"" numeric NOT NULL DEFAULT 0;
                                         ALTER TABLE ""{tenant.SchemaName}"".""CaseConfigurations"" ADD COLUMN IF NOT EXISTS ""ProductId"" uuid NULL;
                                         ALTER TABLE ""{tenant.SchemaName}"".""CaseConfigurations"" ADD COLUMN IF NOT EXISTS ""UnitsPerCase"" integer NOT NULL DEFAULT 24;
                                         ALTER TABLE ""{tenant.SchemaName}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""ParentTransactionId"" uuid NULL;
                                         CREATE INDEX IF NOT EXISTS ""IX_SalesTransactions_ParentTransactionId"" ON ""{tenant.SchemaName}"".""SalesTransactions"" (""ParentTransactionId"");
                                         
                                         CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""MonthlySalaries"" (
                                             ""Id"" uuid NOT NULL PRIMARY KEY,
                                             ""TenantId"" uuid NOT NULL,
                                             ""CompanyId"" uuid NOT NULL,
                                             ""SalaryNo"" text NOT NULL,
                                             ""EmployeeId"" uuid NOT NULL,
                                             ""SalaryMonth"" text NOT NULL,
                                             ""BaseSalary"" numeric NOT NULL DEFAULT 0.0,
                                             ""WorkingDays"" integer NOT NULL DEFAULT 0,
                                             ""DaysWorked"" integer NOT NULL DEFAULT 0,
                                             ""DailySalary"" numeric NOT NULL DEFAULT 0.0,
                                             ""GrossSalary"" numeric NOT NULL DEFAULT 0.0,
                                             ""Bonus"" numeric NOT NULL DEFAULT 0.0,
                                             ""AdvanceDeduction"" numeric NOT NULL DEFAULT 0.0,
                                             ""OtherDeduction"" numeric NOT NULL DEFAULT 0.0,
                                             ""CalculatedEntitlement"" numeric NOT NULL DEFAULT 0.0,
                                             ""NetSalaryEntitlement"" numeric NOT NULL DEFAULT 0.0,
                                             ""TotalPaid"" numeric NOT NULL DEFAULT 0.0,
                                             ""RemainingBalance"" numeric NOT NULL DEFAULT 0.0,
                                             ""Status"" text NOT NULL DEFAULT 'Unpaid',
                                             ""Remarks"" text NULL,
                                             ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                             ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                             ""UpdatedAt"" timestamp with time zone NULL,
                                             ""UpdatedBy"" text NULL,
                                             ""CreatedByIP"" text NULL,
                                             ""UpdatedByIP"" text NULL,
                                             ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                             ""DeletedAt"" timestamp with time zone NULL,
                                             ""DeletedBy"" text NULL
                                         );

                                          ALTER TABLE ""{tenant.SchemaName}"".""MonthlySalaries"" ADD COLUMN IF NOT EXISTS ""IsFinalized"" boolean NOT NULL DEFAULT false;
                                          ALTER TABLE ""{tenant.SchemaName}"".""MonthlySalaries"" ADD COLUMN IF NOT EXISTS ""FinalizedAt"" timestamp with time zone NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""MonthlySalaries"" ADD COLUMN IF NOT EXISTS ""FinalizedBy"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""SalaryPayments"" ADD COLUMN IF NOT EXISTS ""MonthlySalaryId"" uuid NULL;
                                         ALTER TABLE ""{tenant.SchemaName}"".""SalaryPayments"" ADD COLUMN IF NOT EXISTS ""PaymentType"" text NOT NULL DEFAULT 'Salary Settlement';
                                         ALTER TABLE ""{tenant.SchemaName}"".""SalaryPayments"" ADD COLUMN IF NOT EXISTS ""Amount"" numeric NOT NULL DEFAULT 0.0;
                                         UPDATE ""{tenant.SchemaName}"".""SalaryPayments"" SET ""Amount"" = ""NetSalary"" WHERE (""Amount"" IS NULL OR ""Amount"" = 0.0) AND ""NetSalary"" > 0.0;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""ConcurrencyToken"" text NULL;
                                          UPDATE ""{tenant.SchemaName}"".""WaterTestReports"" SET ""ConcurrencyToken"" = md5(random()::text || clock_timestamp()::text) WHERE ""ConcurrencyToken"" IS NULL OR ""ConcurrencyToken"" = '';
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ALTER COLUMN ""ConcurrencyToken"" SET NOT NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ALTER COLUMN ""ConcurrencyToken"" SET DEFAULT md5(random()::text || clock_timestamp()::text);
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""DeletedAt"" timestamp with time zone NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""DeletedBy"" text NULL;

                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestResults"" ADD COLUMN IF NOT EXISTS ""QualityStatus"" text NOT NULL DEFAULT 'PASS';

                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinWarning"" double precision NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxWarning"" double precision NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinAcceptable"" double precision NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxAcceptable"" double precision NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                          ALTER TABLE ""{tenant.SchemaName}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;

                                          UPDATE ""{tenant.SchemaName}"".""BankLedgerEntries"" SET ""EventType"" = 'CREATED' WHERE ""EventType"" IS NULL OR ""EventType"" = '';

                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AssetCode"" text NOT NULL DEFAULT '';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AssetTag"" text NOT NULL DEFAULT '';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AssetType"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""ModelNumber"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""Manufacturer"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""Description"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""SupplierName"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""PurchaseInvoiceNumber"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""PurchaseOrderNumber"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""TaxAmount"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""FreightCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""InstallationCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""OtherCapitalizedCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""TotalCapitalizedCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DepreciationMethod"" text NOT NULL DEFAULT 'StraightLine';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""UsefulLifeYears"" numeric NOT NULL DEFAULT 5;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""ResidualValue"" numeric NOT NULL DEFAULT 0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DepreciationStartDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DepreciationFrequency"" text NOT NULL DEFAULT 'Yearly';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DepreciationRate"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AccumulatedDepreciation"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""Department"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AssignedEmployeeName"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""AssignedDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""Condition"" text NOT NULL DEFAULT 'Good';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""WarrantyStartDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""WarrantyEndDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""WarrantyProvider"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""WarrantyNumber"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""WarrantyNotes"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""LastMaintenanceDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""NextMaintenanceDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""TotalMaintenanceCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposalDate"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposalMethod"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposalReason"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""SaleValue"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposalCost"" numeric NOT NULL DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""BuyerParty"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposalRefNo"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DisposedBy"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""Notes"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""PhotoUrl"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DocumentUrl"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""CreatedBy"" text NOT NULL DEFAULT 'System';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""UpdatedAt"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""UpdatedBy"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""IsDeleted"" boolean NOT NULL DEFAULT false;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DeletedAt"" timestamp with time zone NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ADD COLUMN IF NOT EXISTS ""DeletedBy"" text NULL;

                                           -- DATA REPAIR: Backfill NULL or empty AssetCode deterministically
                                           WITH numbered_null_assets AS (
                                               SELECT ""Id"", ROW_NUMBER() OVER (ORDER BY ""CreatedAt"" ASC, ""Id"" ASC) as rn
                                               FROM ""{tenant.SchemaName}"".""Assets""
                                               WHERE ""AssetCode"" IS NULL OR ""AssetCode"" = ''
                                           )
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" a
                                           SET ""AssetCode"" = 'AST-' || TO_CHAR(COALESCE(a.""CreatedAt"", CURRENT_TIMESTAMP), 'YYYY') || '-' || LPAD(numbered_null_assets.rn::text, 5, '0')
                                           FROM numbered_null_assets
                                           WHERE a.""Id"" = numbered_null_assets.""Id"";

                                           UPDATE ""{tenant.SchemaName}"".""Assets""
                                           SET ""AssetCode"" = 'AST-' || SUBSTRING(""Id""::text, 1, 8)
                                           WHERE ""AssetCode"" IS NULL OR ""AssetCode"" = '';

                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""AssetTag"" = 'TAG-' || ""AssetCode"" WHERE ""AssetTag"" IS NULL OR ""AssetTag"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""AssetName"" = 'Asset ' || ""AssetCode"" WHERE ""AssetName"" IS NULL OR ""AssetName"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""AssetCategory"" = 'Other' WHERE ""AssetCategory"" IS NULL OR ""AssetCategory"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""PurchaseDate"" = CURRENT_TIMESTAMP WHERE ""PurchaseDate"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""PurchasePrice"" = 0.0 WHERE ""PurchasePrice"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""TaxAmount"" = 0.0 WHERE ""TaxAmount"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""FreightCost"" = 0.0 WHERE ""FreightCost"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""InstallationCost"" = 0.0 WHERE ""InstallationCost"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""OtherCapitalizedCost"" = 0.0 WHERE ""OtherCapitalizedCost"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""TotalCapitalizedCost"" = COALESCE(""PurchasePrice"", 0.0) WHERE ""TotalCapitalizedCost"" IS NULL OR ""TotalCapitalizedCost"" = 0.0;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""DepreciationMethod"" = 'StraightLine' WHERE ""DepreciationMethod"" IS NULL OR ""DepreciationMethod"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""UsefulLifeYears"" = 5 WHERE ""UsefulLifeYears"" IS NULL OR ""UsefulLifeYears"" <= 0;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""ResidualValue"" = 0.0 WHERE ""ResidualValue"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""DepreciationFrequency"" = 'Yearly' WHERE ""DepreciationFrequency"" IS NULL OR ""DepreciationFrequency"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""DepreciationRate"" = 0.0 WHERE ""DepreciationRate"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""AccumulatedDepreciation"" = 0.0 WHERE ""AccumulatedDepreciation"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""CurrentValue"" = COALESCE(""TotalCapitalizedCost"", ""PurchasePrice"", 0.0) WHERE ""CurrentValue"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""CurrentStatus"" = 'Active' WHERE ""CurrentStatus"" IS NULL OR ""CurrentStatus"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""Condition"" = 'Good' WHERE ""Condition"" IS NULL OR ""Condition"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""TotalMaintenanceCost"" = 0.0 WHERE ""TotalMaintenanceCost"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""SaleValue"" = 0.0 WHERE ""SaleValue"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""DisposalCost"" = 0.0 WHERE ""DisposalCost"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""CreatedAt"" = CURRENT_TIMESTAMP WHERE ""CreatedAt"" IS NULL;
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""CreatedBy"" = 'System' WHERE ""CreatedBy"" IS NULL OR ""CreatedBy"" = '';
                                           UPDATE ""{tenant.SchemaName}"".""Assets"" SET ""IsDeleted"" = false WHERE ""IsDeleted"" IS NULL;

                                           -- Enforce NOT NULL and Defaults
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetCode"" SET DEFAULT '';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetCode"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetTag"" SET DEFAULT '';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetTag"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetName"" SET DEFAULT '';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetName"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetCategory"" SET DEFAULT 'Other';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AssetCategory"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""PurchaseDate"" SET DEFAULT CURRENT_TIMESTAMP;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""PurchaseDate"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""PurchasePrice"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""PurchasePrice"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TaxAmount"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TaxAmount"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""FreightCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""FreightCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""InstallationCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""InstallationCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""OtherCapitalizedCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""OtherCapitalizedCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TotalCapitalizedCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TotalCapitalizedCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationMethod"" SET DEFAULT 'StraightLine';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationMethod"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""UsefulLifeYears"" SET DEFAULT 5;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""UsefulLifeYears"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""ResidualValue"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""ResidualValue"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationFrequency"" SET DEFAULT 'Yearly';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationFrequency"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationRate"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DepreciationRate"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AccumulatedDepreciation"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""AccumulatedDepreciation"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CurrentValue"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CurrentValue"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CurrentStatus"" SET DEFAULT 'Active';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CurrentStatus"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""Condition"" SET DEFAULT 'Good';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""Condition"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TotalMaintenanceCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""TotalMaintenanceCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""SaleValue"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""SaleValue"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DisposalCost"" SET DEFAULT 0.0;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""DisposalCost"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CreatedAt"" SET DEFAULT CURRENT_TIMESTAMP;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CreatedAt"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CreatedBy"" SET DEFAULT 'System';
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""CreatedBy"" SET NOT NULL;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""IsDeleted"" SET DEFAULT false;
                                           ALTER TABLE ""{tenant.SchemaName}"".""Assets"" ALTER COLUMN ""IsDeleted"" SET NOT NULL;

                                           CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""AssetMaintenanceRecords"" (
                                               ""Id"" uuid NOT NULL PRIMARY KEY,
                                               ""TenantId"" uuid NOT NULL,
                                               ""CompanyId"" uuid NOT NULL,
                                               ""AssetId"" uuid NOT NULL,
                                               ""MaintenanceType"" text NOT NULL DEFAULT 'Preventive',
                                               ""MaintenanceDate"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               ""ServiceProvider"" text NOT NULL DEFAULT '',
                                               ""Description"" text NOT NULL DEFAULT '',
                                               ""PartsCost"" numeric NOT NULL DEFAULT 0.0,
                                               ""LabourCost"" numeric NOT NULL DEFAULT 0.0,
                                               ""OtherCost"" numeric NOT NULL DEFAULT 0.0,
                                               ""TotalCost"" numeric NOT NULL DEFAULT 0.0,
                                               ""NextMaintenanceDate"" timestamp with time zone NULL,
                                               ""IsWarrantyClaim"" boolean NOT NULL DEFAULT false,
                                               ""TechnicianName"" text NULL,
                                               ""Notes"" text NULL,
                                               ""AttachmentUrl"" text NULL,
                                               ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               ""CreatedBy"" text NOT NULL DEFAULT 'System'
                                           );

                                           CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""AssetHistories"" (
                                               ""Id"" uuid NOT NULL PRIMARY KEY,
                                               ""AssetId"" uuid NOT NULL,
                                               ""Date"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                               ""Action"" text NOT NULL DEFAULT '',
                                               ""PerformedBy"" text NOT NULL DEFAULT '',
                                               ""PreviousValue"" text NULL,
                                               ""NewValue"" text NULL,
                                               ""Remarks"" text NULL
                                           );

                                         CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""OperationsIssueAffectedMachines"" (
                                             ""Id"" uuid NOT NULL PRIMARY KEY,
                                             ""IssueId"" uuid NOT NULL,
                                             ""MachineId"" uuid NOT NULL,
                                             ""MachineName"" text NOT NULL,
                                             ""MachineCode"" text NULL,
                                             CONSTRAINT fk_issue_affected_machines FOREIGN KEY (""IssueId"") REFERENCES ""{tenant.SchemaName}"".""OperationsIssues"" (""Id"") ON DELETE CASCADE
                                         );

                                         CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_affected_machines ON ""{tenant.SchemaName}"".""OperationsIssueAffectedMachines"" (""IssueId"", ""MachineId"");

                                         INSERT INTO ""{tenant.SchemaName}"".""OperationsIssueAffectedMachines"" (""Id"", ""IssueId"", ""MachineId"", ""MachineName"")
                                         SELECT gen_random_uuid(), ""Id"", ""MachineId"", COALESCE(""MachineName"", 'Primary Machine')
                                         FROM ""{tenant.SchemaName}"".""OperationsIssues""
                                         WHERE ""MachineId"" IS NOT NULL
                                         AND NOT EXISTS (
                                             SELECT 1 FROM ""{tenant.SchemaName}"".""OperationsIssueAffectedMachines"" m WHERE m.""IssueId"" = ""{tenant.SchemaName}"".""OperationsIssues"".""Id"" AND m.""MachineId"" = ""{tenant.SchemaName}"".""OperationsIssues"".""MachineId""
                                         );

                                          -- 20L Business Engine Schema Self-Healing
                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorProfiles"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""CustomerId"" uuid NOT NULL,
                                              ""DistributorType"" text NOT NULL DEFAULT 'EXTERNAL',
                                              ""JarOwnershipModel"" text NOT NULL DEFAULT 'MIXED',
                                              ""VehicleOwnership"" text NOT NULL DEFAULT 'DISTRIBUTOR',
                                              ""RouteOwnership"" text NOT NULL DEFAULT 'DISTRIBUTOR',
                                              ""PricingModel"" text NOT NULL DEFAULT 'RATE_CARD',
                                              ""CommissionModel"" text NOT NULL DEFAULT 'NONE',
                                              ""CreditLimit"" numeric NOT NULL DEFAULT 0.0,
                                              ""SecurityDeposit"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentTerms"" text NULL,
                                              ""EffectiveFrom"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""EffectiveTo"" timestamp with time zone NULL,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""AgreementReference"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLDistributorProfiles_TenantId_CustomerId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorProfiles"" (""TenantId"", ""CustomerId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLJarMovements"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""ProductId"" uuid NULL,
                                              ""OwnerCustomerId"" uuid NULL,
                                              ""FromCustomerId"" uuid NULL,
                                              ""ToCustomerId"" uuid NULL,
                                              ""OwnerType"" text NOT NULL DEFAULT 'COMPANY',
                                              ""HolderType"" text NOT NULL DEFAULT 'COMPANY',
                                              ""HolderCustomerId"" uuid NULL,
                                              ""FromLocationType"" text NOT NULL DEFAULT 'PLANT',
                                              ""ToLocationType"" text NOT NULL DEFAULT 'PLANT',
                                              ""FromLocationReference"" text NULL,
                                              ""ToLocationReference"" text NULL,
                                              ""MovementType"" text NOT NULL DEFAULT '',
                                              ""ContainerStatus"" text NOT NULL DEFAULT 'EMPTY',
                                              ""Quantity"" integer NOT NULL DEFAULT 0,
                                              ""ReferenceId"" uuid NULL,
                                              ""ReferenceType"" text NULL,
                                              ""OccurredAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""Reason"" text NULL,
                                              ""Notes"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLJarMovements_Ledger"" ON ""{tenant.SchemaName}"".""TwentyLJarMovements"" (""TenantId"", ""OwnerType"", ""OwnerCustomerId"", ""ToLocationType"", ""ToCustomerId"", ""OccurredAt"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLJarPositions"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""PositionKey"" text NOT NULL,
                                              ""ProductId"" uuid NULL,
                                              ""OwnerType"" text NOT NULL DEFAULT 'COMPANY',
                                              ""OwnerCustomerId"" uuid NULL,
                                              ""HolderType"" text NOT NULL DEFAULT 'COMPANY',
                                              ""HolderCustomerId"" uuid NULL,
                                              ""LocationType"" text NOT NULL DEFAULT 'PLANT',
                                              ""LocationReference"" text NULL,
                                              ""ContainerStatus"" text NOT NULL DEFAULT 'EMPTY',
                                              ""Quantity"" integer NOT NULL DEFAULT 0,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLJarPositions_Position"" ON ""{tenant.SchemaName}"".""TwentyLJarPositions"" (""TenantId"", ""CompanyId"", ""PositionKey"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLRateRules"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""ProductId"" uuid NOT NULL,
                                              ""CustomerId"" uuid NULL,
                                              ""PartyType"" text NOT NULL DEFAULT 'ANY',
                                              ""RefillType"" text NOT NULL DEFAULT 'ANY',
                                              ""JarOwnerType"" text NOT NULL DEFAULT 'ANY',
                                              ""MinimumQuantity"" numeric NOT NULL DEFAULT 1.0,
                                              ""Priority"" integer NOT NULL DEFAULT 0,
                                              ""UnitRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""DiscountRate"" numeric NULL,
                                              ""TaxRate"" numeric NULL,
                                              ""EffectiveFrom"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""EffectiveTo"" timestamp with time zone NULL,
                                              ""RequiresAuthorization"" boolean NOT NULL DEFAULT false,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""Notes"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLRateRules_Effective"" ON ""{tenant.SchemaName}"".""TwentyLRateRules"" (""TenantId"", ""ProductId"", ""CustomerId"", ""EffectiveFrom"", ""EffectiveTo"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDeliveries"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""CustomerId"" uuid NOT NULL,
                                              ""DistributorId"" uuid NULL,
                                              ""ProductId"" uuid NOT NULL,
                                              ""RateRuleId"" uuid NULL,
                                              ""SalesTransactionId"" uuid NULL,
                                              ""RefillType"" text NOT NULL DEFAULT 'DIRECT_CUSTOMER_REFILL',
                                              ""JarOwnerType"" text NOT NULL DEFAULT 'COMPANY',
                                              ""OrderedQuantity"" integer NOT NULL DEFAULT 0,
                                              ""FilledDeliveredQuantity"" integer NOT NULL DEFAULT 0,
                                              ""EmptyCollectedQuantity"" integer NOT NULL DEFAULT 0,
                                              ""FailedQuantity"" integer NOT NULL DEFAULT 0,
                                              ""AppliedUnitRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""DiscountAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""TaxAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""AmountCollected"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentMode"" text NOT NULL DEFAULT 'CREDIT',
                                              ""Status"" text NOT NULL DEFAULT 'COMPLETED',
                                              ""RouteReference"" text NULL,
                                              ""VehicleReference"" text NULL,
                                              ""DriverReference"" text NULL,
                                              ""DeliveredAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""FailureReason"" text NULL,
                                              ""Notes"" text NULL,
                                              ""IdempotencyKey"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDeliveries_TenantId_CustomerId_DeliveredAt"" ON ""{tenant.SchemaName}"".""TwentyLDeliveries"" (""TenantId"", ""CustomerId"", ""DeliveredAt"");
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLDeliveries_TenantId_IdempotencyKey"" ON ""{tenant.SchemaName}"".""TwentyLDeliveries"" (""TenantId"", ""IdempotencyKey"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLCommissionRules"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""BeneficiaryCustomerId"" uuid NULL,
                                              ""ProductId"" uuid NULL,
                                              ""BeneficiaryType"" text NOT NULL DEFAULT 'EMPLOYEE',
                                              ""CalculationType"" text NOT NULL DEFAULT 'PERCENTAGE',
                                              ""Value"" numeric NOT NULL DEFAULT 0.0,
                                              ""MinimumQuantity"" numeric NOT NULL DEFAULT 0.0,
                                              ""EffectiveFrom"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""EffectiveTo"" timestamp with time zone NULL,
                                              ""Priority"" integer NOT NULL DEFAULT 0,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLCommissionRules_Effective"" ON ""{tenant.SchemaName}"".""TwentyLCommissionRules"" (""TenantId"", ""BeneficiaryCustomerId"", ""ProductId"", ""EffectiveFrom"", ""EffectiveTo"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLCommissionTransactions"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DeliveryId"" uuid NOT NULL,
                                              ""RuleId"" uuid NULL,
                                              ""BeneficiaryCustomerId"" uuid NULL,
                                              ""BeneficiaryType"" text NOT NULL DEFAULT 'EMPLOYEE',
                                              ""TransactionType"" text NOT NULL DEFAULT 'EARNED',
                                              ""Amount"" numeric NOT NULL DEFAULT 0.0,
                                              ""OccurredAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""ReversalOfId"" uuid NULL,
                                              ""Reason"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLCommissionTransactions_Delivery"" ON ""{tenant.SchemaName}"".""TwentyLCommissionTransactions"" (""TenantId"", ""DeliveryId"", ""BeneficiaryCustomerId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLTrips"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""TripNumber"" text NOT NULL,
                                              ""DriverName"" text NOT NULL DEFAULT '',
                                              ""DriverCustomerId"" uuid NULL,
                                              ""VehicleNumber"" text NOT NULL DEFAULT '',
                                              ""RouteCode"" text NULL,
                                              ""PlannedDate"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""Status"" text NOT NULL DEFAULT 'PLANNED',
                                              ""LoadedFilledJars"" integer NOT NULL DEFAULT 0,
                                              ""LoadedEmptyJars"" integer NOT NULL DEFAULT 0,
                                              ""DeliveredFilledJars"" integer NOT NULL DEFAULT 0,
                                              ""CollectedEmptyJars"" integer NOT NULL DEFAULT 0,
                                              ""ReturnedFilledJars"" integer NOT NULL DEFAULT 0,
                                              ""ReturnedEmptyJars"" integer NOT NULL DEFAULT 0,
                                              ""DamagedJarsCount"" integer NOT NULL DEFAULT 0,
                                              ""LostJarsCount"" integer NOT NULL DEFAULT 0,
                                              ""CondemnedJarsCount"" integer NOT NULL DEFAULT 0,
                                              ""TotalTripRevenue"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalCashCollected"" numeric NOT NULL DEFAULT 0.0,
                                              ""ReconciliationStatus"" text NOT NULL DEFAULT 'PENDING',
                                              ""DiscrepancyNotes"" text NULL,
                                              ""DispatchedAt"" timestamp with time zone NULL,
                                              ""ReturnedAt"" timestamp with time zone NULL,
                                              ""ReconciledAt"" timestamp with time zone NULL,
                                              ""ReconciledBy"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLTrips_TenantId_TripNumber"" ON ""{tenant.SchemaName}"".""TwentyLTrips"" (""TenantId"", ""TripNumber"");
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLTrips_TenantId_PlannedDate_Status"" ON ""{tenant.SchemaName}"".""TwentyLTrips"" (""TenantId"", ""PlannedDate"", ""Status"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLTripStops"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""TripId"" uuid NOT NULL,
                                              ""StopSequence"" integer NOT NULL DEFAULT 1,
                                              ""CustomerId"" uuid NOT NULL,
                                              ""ProductId"" uuid NULL,
                                              ""PlannedFilledJars"" integer NOT NULL DEFAULT 0,
                                              ""DeliveredFilledJars"" integer NOT NULL DEFAULT 0,
                                              ""CollectedEmptyJars"" integer NOT NULL DEFAULT 0,
                                              ""DamagedEmptyJars"" integer NOT NULL DEFAULT 0,
                                              ""LostJars"" integer NOT NULL DEFAULT 0,
                                              ""UnitRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""AmountCollected"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentMode"" text NOT NULL DEFAULT 'CREDIT',
                                              ""PaymentStatus"" text NOT NULL DEFAULT 'PENDING',
                                              ""Status"" text NOT NULL DEFAULT 'PENDING',
                                              ""FailureReason"" text NULL,
                                              ""Notes"" text NULL,
                                              ""DeliveredAt"" timestamp with time zone NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLTripStops_TenantId_TripId_Sequence"" ON ""{tenant.SchemaName}"".""TwentyLTripStops"" (""TenantId"", ""TripId"", ""StopSequence"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLOperations"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""OperationNumber"" text NOT NULL,
                                              ""OperationType"" text NOT NULL,
                                              ""Stage"" text NOT NULL DEFAULT 'COMPLETED',
                                              ""TripId"" uuid NULL,
                                              ""CustomerId"" uuid NULL,
                                              ""DistributorId"" uuid NULL,
                                              ""DriverName"" text NULL,
                                              ""VehicleNumber"" text NULL,
                                              ""ProductId"" uuid NULL,
                                              ""QuantityFilled"" integer NOT NULL DEFAULT 0,
                                              ""QuantityEmpty"" integer NOT NULL DEFAULT 0,
                                              ""QuantityDamaged"" integer NOT NULL DEFAULT 0,
                                              ""QuantityLost"" integer NOT NULL DEFAULT 0,
                                              ""QuantityCondemned"" integer NOT NULL DEFAULT 0,
                                              ""AppliedRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""AmountCollected"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentStatus"" text NOT NULL DEFAULT 'PENDING',
                                              ""Status"" text NOT NULL DEFAULT 'COMPLETED',
                                              ""ReferenceNumber"" text NULL,
                                              ""Reason"" text NULL,
                                              ""Notes"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLOperations_TenantId_Number"" ON ""{tenant.SchemaName}"".""TwentyLOperations"" (""TenantId"", ""OperationNumber"");
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLOperations_TenantId_Type_Stage"" ON ""{tenant.SchemaName}"".""TwentyLOperations"" (""TenantId"", ""OperationType"", ""Stage"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLJarInspections"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""InspectionNumber"" text NOT NULL,
                                              ""ReferenceType"" text NOT NULL DEFAULT '',
                                              ""ReferenceId"" uuid NULL,
                                              ""SourceHolderType"" text NOT NULL DEFAULT 'DRIVER',
                                              ""SourceHolderId"" uuid NULL,
                                              ""SourceHolderName"" text NULL,
                                              ""InspectedCount"" integer NOT NULL DEFAULT 0,
                                              ""ReusableCount"" integer NOT NULL DEFAULT 0,
                                              ""DamagedCount"" integer NOT NULL DEFAULT 0,
                                              ""CondemnedCount"" integer NOT NULL DEFAULT 0,
                                              ""InspectionOutcome"" text NOT NULL DEFAULT 'PASSED',
                                              ""ResponsibleParty"" text NULL,
                                              ""DamageReason"" text NULL,
                                              ""CondemnationReason"" text NULL,
                                              ""AuthorizedBy"" text NULL,
                                              ""DisposalReference"" text NULL,
                                              ""Notes"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLJarInspections_TenantId_Number"" ON ""{tenant.SchemaName}"".""TwentyLJarInspections"" (""TenantId"", ""InspectionNumber"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorSupplies"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""SupplyNumber"" text NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""DistributorName"" text NOT NULL DEFAULT '',
                                              ""ProductId"" uuid NOT NULL,
                                              ""ProductName"" text NOT NULL DEFAULT '20L Water Jar',
                                              ""Stage"" text NOT NULL DEFAULT 'COMPLETED',
                                              ""QuantityRequested"" integer NOT NULL DEFAULT 0,
                                              ""QuantitySupplied"" integer NOT NULL DEFAULT 0,
                                              ""QuantityEmptyReturned"" integer NOT NULL DEFAULT 0,
                                              ""QuantityDamaged"" integer NOT NULL DEFAULT 0,
                                              ""AppliedRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""AmountPaid"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentStatus"" text NOT NULL DEFAULT 'PENDING',
                                              ""PaymentMode"" text NULL,
                                              ""VehicleNumber"" text NULL,
                                              ""DriverName"" text NULL,
                                              ""DispatcherNotes"" text NULL,
                                              ""ReceiverNotes"" text NULL,
                                              ""DispatchedAt"" timestamp with time zone NULL,
                                              ""ReceivedAt"" timestamp with time zone NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLDistributorSupplies_TenantId_Number"" ON ""{tenant.SchemaName}"".""TwentyLDistributorSupplies"" (""TenantId"", ""SupplyNumber"");
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorSupplies_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorSupplies"" (""TenantId"", ""DistributorId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorRoutes"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""RouteCode"" text NOT NULL DEFAULT '',
                                              ""RouteName"" text NOT NULL DEFAULT '',
                                              ""AreaDescription"" text NULL,
                                              ""DefaultDriverName"" text NULL,
                                              ""DefaultVehicleNumber"" text NULL,
                                              ""ScheduleDays"" text NOT NULL DEFAULT 'DAILY',
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorRoutes_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorRoutes"" (""TenantId"", ""DistributorId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorVehicles"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""RegistrationNumber"" text NOT NULL,
                                              ""VehicleType"" text NOT NULL DEFAULT 'MINI_TRUCK',
                                              ""CapacityJars"" integer NOT NULL DEFAULT 50,
                                              ""AssignedDriverName"" text NULL,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorVehicles_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorVehicles"" (""TenantId"", ""DistributorId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorDrivers"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""DriverName"" text NOT NULL,
                                              ""Phone"" text NOT NULL DEFAULT '',
                                              ""LicenseNumber"" text NULL,
                                              ""AssignedVehicleNumber"" text NULL,
                                              ""CurrentRouteId"" uuid NULL,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorDrivers_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorDrivers"" (""TenantId"", ""DistributorId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorCustomers"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""CustomerName"" text NOT NULL,
                                              ""Phone"" text NOT NULL DEFAULT '',
                                              ""Address"" text NULL,
                                              ""Area"" text NULL,
                                              ""RouteId"" uuid NULL,
                                              ""RouteName"" text NULL,
                                              ""DeliveryFrequency"" text NOT NULL DEFAULT 'DAILY',
                                              ""DefaultRate"" numeric NOT NULL DEFAULT 40.0,
                                              ""AssignedDriverName"" text NULL,
                                              ""AssignedVehicleNumber"" text NULL,
                                              ""FilledJarsHeld"" integer NOT NULL DEFAULT 0,
                                              ""EmptyJarsHeld"" integer NOT NULL DEFAULT 0,
                                              ""SecurityDeposit"" numeric NOT NULL DEFAULT 0.0,
                                              ""OutstandingBalance"" numeric NOT NULL DEFAULT 0.0,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorCustomers_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorCustomers"" (""TenantId"", ""DistributorId"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""TwentyLDistributorDeliveries"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""DeliveryNumber"" text NOT NULL,
                                              ""DistributorId"" uuid NOT NULL,
                                              ""DistributorCustomerId"" uuid NOT NULL,
                                              ""CustomerName"" text NOT NULL,
                                              ""RouteId"" uuid NULL,
                                              ""RouteName"" text NULL,
                                              ""DriverName"" text NULL,
                                              ""VehicleNumber"" text NULL,
                                              ""ProductId"" uuid NULL,
                                              ""QuantityFilledDelivered"" integer NOT NULL DEFAULT 0,
                                              ""QuantityEmptyCollected"" integer NOT NULL DEFAULT 0,
                                              ""QuantityDamaged"" integer NOT NULL DEFAULT 0,
                                              ""SellingRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""CompanyRefillRate"" numeric NOT NULL DEFAULT 0.0,
                                              ""TotalAmount"" numeric NOT NULL DEFAULT 0.0,
                                              ""AmountCollected"" numeric NOT NULL DEFAULT 0.0,
                                              ""PaymentMode"" text NOT NULL DEFAULT 'CASH',
                                              ""PaymentStatus"" text NOT NULL DEFAULT 'PAID',
                                              ""GrossMargin"" numeric NOT NULL DEFAULT 0.0,
                                              ""DeliveryDate"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""Notes"" text NULL,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL
                                          );
                                          CREATE UNIQUE INDEX IF NOT EXISTS ""IX_TwentyLDistributorDeliveries_TenantId_Number"" ON ""{tenant.SchemaName}"".""TwentyLDistributorDeliveries"" (""TenantId"", ""DeliveryNumber"");
                                          CREATE INDEX IF NOT EXISTS ""IX_TwentyLDistributorDeliveries_TenantId_DistributorId"" ON ""{tenant.SchemaName}"".""TwentyLDistributorDeliveries"" (""TenantId"", ""DistributorId"", ""DeliveryDate"");

                                          -- Quick Creation Tables: Brands, RawMaterials, ExpenseCategories, AssetCategories, PurchaseCategories
                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""Brands"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""Name"" character varying(150) NOT NULL,
                                              ""Code"" character varying(50) NULL,
                                              ""Description"" character varying(500) NULL,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_Brands_Name_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""Brands"" (""Name"");
                                          CREATE INDEX IF NOT EXISTS ""IX_Brands_Code_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""Brands"" (""Code"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""RawMaterials"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""Name"" text NOT NULL,
                                              ""Code"" text NOT NULL,
                                              ""Category"" text NOT NULL,
                                              ""Unit"" text NOT NULL,
                                              ""BaseUnit"" text NULL,
                                              ""ConversionFactor"" numeric NOT NULL DEFAULT 1.0,
                                              ""CurrentStock"" numeric NOT NULL DEFAULT 0.0,
                                              ""CostPerUnit"" numeric NOT NULL DEFAULT 5.0,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_RawMaterials_TenantId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""RawMaterials"" (""TenantId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_RawMaterials_CompanyId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""RawMaterials"" (""CompanyId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_RawMaterials_Category_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""RawMaterials"" (""Category"");
                                          CREATE INDEX IF NOT EXISTS ""IX_RawMaterials_Name_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""RawMaterials"" (""Name"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""ExpenseCategories"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""Name"" text NOT NULL,
                                              ""Description"" text NULL,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_ExpenseCategories_TenantId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""ExpenseCategories"" (""TenantId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_ExpenseCategories_CompanyId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""ExpenseCategories"" (""CompanyId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_ExpenseCategories_Name_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""ExpenseCategories"" (""Name"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""AssetCategories"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""Code"" text NOT NULL,
                                              ""Name"" text NOT NULL,
                                              ""Description"" text NULL,
                                              ""IsSystem"" boolean NOT NULL DEFAULT false,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_AssetCategories_TenantId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""AssetCategories"" (""TenantId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_AssetCategories_CompanyId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""AssetCategories"" (""CompanyId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_AssetCategories_Code_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""AssetCategories"" (""Code"");
                                          CREATE INDEX IF NOT EXISTS ""IX_AssetCategories_Name_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""AssetCategories"" (""Name"");

                                          CREATE TABLE IF NOT EXISTS ""{tenant.SchemaName}"".""PurchaseCategories"" (
                                              ""Id"" uuid NOT NULL PRIMARY KEY,
                                              ""TenantId"" uuid NOT NULL,
                                              ""CompanyId"" uuid NOT NULL,
                                              ""Code"" text NOT NULL,
                                              ""Name"" text NOT NULL,
                                              ""Description"" text NULL,
                                              ""Treatment"" text NOT NULL DEFAULT 'Expense',
                                              ""IsSystem"" boolean NOT NULL DEFAULT false,
                                              ""IsActive"" boolean NOT NULL DEFAULT true,
                                              ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                              ""CreatedBy"" text NOT NULL DEFAULT 'System',
                                              ""UpdatedAt"" timestamp with time zone NULL,
                                              ""UpdatedBy"" text NULL,
                                              ""CreatedByIP"" text NULL,
                                              ""UpdatedByIP"" text NULL,
                                              ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                              ""DeletedAt"" timestamp with time zone NULL,
                                              ""DeletedBy"" text NULL
                                          );
                                          CREATE INDEX IF NOT EXISTS ""IX_PurchaseCategories_TenantId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""PurchaseCategories"" (""TenantId"");
                                              CREATE INDEX IF NOT EXISTS ""IX_PurchaseCategories_CompanyId_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""PurchaseCategories"" (""CompanyId"");
                                          CREATE INDEX IF NOT EXISTS ""IX_PurchaseCategories_Code_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""PurchaseCategories"" (""Code"");
                                          CREATE INDEX IF NOT EXISTS ""IX_PurchaseCategories_Name_{tenant.SchemaName}"" ON ""{tenant.SchemaName}"".""PurchaseCategories"" (""Name"");
                                          ";
                                    await cmd.ExecuteNonQueryAsync();
                                }
                            }
                            catch (Exception repairEx)
                            {
                                _logger.LogWarning($"[SCHEMA REPAIR WARN] EventType column repair failed for {tenant.SchemaName}: {repairEx.Message}");
                            }

                            // Reconcile and migrate historical raw material stock to inventory movements
                            var rawMaterials = await tenantContext.RawMaterials.Where(rm => !rm.IsDeleted).ToListAsync();
                            var movementsSums = await tenantContext.InventoryMovements
                                .Where(m => m.RawMaterialId != null && !m.IsDeleted)
                                .GroupBy(m => m.RawMaterialId!.Value)
                                .Select(g => new { RawMaterialId = g.Key, TotalQuantity = g.Sum(m => m.Quantity) })
                                .ToDictionaryAsync(x => x.RawMaterialId, x => x.TotalQuantity);

                            bool reconciledAny = false;
                            foreach (var rm in rawMaterials)
                            {
                                var movementsSum = movementsSums.TryGetValue(rm.Id, out var sum) ? sum : 0m;
                                var diff = rm.CurrentStock - movementsSum;
                                if (diff != 0)
                                {
                                    _logger.LogInformation($"[RECONCILIATION] RawMaterial '{rm.Name}' (ID: {rm.Id}) stock mismatch in '{tenant.SchemaName}': CurrentStock={rm.CurrentStock}, MovementsSum={movementsSum}. Reconciling diff of {diff}.");
                                    
                                    var reconciliationMovement = new InventoryMovement
                                    {
                                        Id = Guid.NewGuid(),
                                        RawMaterialId = rm.Id,
                                        Quantity = diff,
                                        ReferenceType = "OpeningStock",
                                        ReferenceId = rm.Id,
                                        TenantId = tenant.Id,
                                        CompanyId = rm.CompanyId,
                                        CreatedAt = DateTime.UtcNow,
                                        CreatedBy = "System Migration",
                                        IsDeleted = false
                                    };
                                    tenantContext.InventoryMovements.Add(reconciliationMovement);
                                    reconciledAny = true;
                                }
                            }
                            if (reconciledAny)
                            {
                                await tenantContext.SaveChangesAsync();
                            }

                            // Auto-repair product categories for Jar products
                            var jarProducts = await tenantContext.Products
                                .Where(p => p.Name.ToLower().Contains("jar") && p.Category != "20L Jar")
                                .ToListAsync();
                            if (jarProducts.Any())
                            {
                                _logger.LogInformation($"[REPAIR] Found {jarProducts.Count} jar products in '{tenant.SchemaName}' with incorrect category. Fixing...");
                                foreach (var jp in jarProducts)
                                {
                                    jp.Category = "20L Jar";
                                }
                            }
                            // Ensure QC Role exists for the tenant
                            var qcRole = await tenantContext.Roles.FirstOrDefaultAsync(r => r.Code == "QC");
                            if (qcRole == null)
                            {
                                _logger.LogInformation($"[REPAIR] Adding missing QC role to schema '{tenant.SchemaName}'...");
                                qcRole = new Role { Name = "QC", Code = "QC", TenantId = tenant.Id };
                                tenantContext.Roles.Add(qcRole);
                                await tenantContext.SaveChangesAsync();
                            }

                            // Ensure QC Permissions exist
                            var permQCRead = await tenantContext.Permissions.FirstOrDefaultAsync(p => p.Code == Permissions.QCRead);
                            if (permQCRead == null)
                            {
                                permQCRead = new Permission { Name = "QC Read", Code = Permissions.QCRead };
                                tenantContext.Permissions.Add(permQCRead);
                                await tenantContext.SaveChangesAsync();
                            }
                            var permQCWrite = await tenantContext.Permissions.FirstOrDefaultAsync(p => p.Code == Permissions.QCWrite);
                            if (permQCWrite == null)
                            {
                                permQCWrite = new Permission { Name = "QC Write", Code = Permissions.QCWrite };
                                tenantContext.Permissions.Add(permQCWrite);
                                await tenantContext.SaveChangesAsync();
                            }
                            var permDashboard = await tenantContext.Permissions.FirstOrDefaultAsync(p => p.Code == Permissions.DashboardRead);

                            // Map QC permissions to QC Role
                            var qcPermIds = new List<Guid> { permQCRead.Id, permQCWrite.Id };
                            if (permDashboard != null) qcPermIds.Add(permDashboard.Id);
                            
                            foreach (var pId in qcPermIds)
                            {
                                if (!await tenantContext.RolePermissions.AnyAsync(rp => rp.RoleId == qcRole.Id && rp.PermissionId == pId))
                                {
                                    tenantContext.RolePermissions.Add(new RolePermission { RoleId = qcRole.Id, PermissionId = pId, TenantId = tenant.Id });
                                }
                            }

                            // Map QC permissions to CompanyAdmin Role
                            var adminRole = await tenantContext.Roles.FirstOrDefaultAsync(r => r.Code == "COMPANYADMIN" || r.Name == "CompanyAdmin");
                            if (adminRole != null)
                            {
                                foreach (var pId in new[] { permQCRead.Id, permQCWrite.Id })
                                {
                                    if (!await tenantContext.RolePermissions.AnyAsync(rp => rp.RoleId == adminRole.Id && rp.PermissionId == pId))
                                    {
                                        tenantContext.RolePermissions.Add(new RolePermission { RoleId = adminRole.Id, PermissionId = pId, TenantId = tenant.Id });
                                    }
                                }
                            }

                            // Ensure Accountant Role exists and inherits exactly all permissions from CompanyAdmin
                            var accountantRole = await tenantContext.Roles.FirstOrDefaultAsync(r => r.Code == "ACCOUNTANT" || r.Name == "Accountant");
                            if (accountantRole == null)
                            {
                                _logger.LogInformation($"[REPAIR] Adding missing Accountant role to schema '{tenant.SchemaName}'...");
                                accountantRole = new Role { Name = "Accountant", Code = "ACCOUNTANT", TenantId = tenant.Id };
                                tenantContext.Roles.Add(accountantRole);
                                await tenantContext.SaveChangesAsync();
                            }

                            if (adminRole != null && accountantRole != null)
                            {
                                var adminPermIds = await tenantContext.RolePermissions
                                    .Where(rp => rp.RoleId == adminRole.Id)
                                    .Select(rp => rp.PermissionId)
                                    .ToListAsync();

                                foreach (var pId in adminPermIds)
                                {
                                    if (!await tenantContext.RolePermissions.AnyAsync(rp => rp.RoleId == accountantRole.Id && rp.PermissionId == pId))
                                    {
                                        tenantContext.RolePermissions.Add(new RolePermission { RoleId = accountantRole.Id, PermissionId = pId, TenantId = tenant.Id });
                                    }
                                }
                            }
                            
                            await tenantContext.SaveChangesAsync();

                            // Ensure full canonical QC default parameters exist in this tenant's schema
                            _logger.LogInformation($"[QC SEEDING] Ensuring default QC Water Test Parameters exist in schema '{tenant.SchemaName}'...");
                            await QCDataSeeder.SeedQCDefaultParametersAsync(tenantContext, "MigrationService.Repair");

                            // Auto-repair invalid default dates (0001-01-01, default/empty values, etc.)
                            _logger.LogInformation($"[REPAIR-DATETIME] Repairing default/invalid timestamps in schema '{tenant.SchemaName}'...");
                            var schema = tenant.SchemaName;
                            try
                            {
                                using (var cmd = tenantContext.Database.GetDbConnection().CreateCommand())
                                {
                                    if (cmd.Connection != null && cmd.Connection.State != System.Data.ConnectionState.Open)
                                    {
                                        await cmd.Connection.OpenAsync();
                                    }

                                    var tables = new[] {
                                        "Purchases", "PurchasePayments", "PurchaseTimelineEvents", "SimpleExpenses", 
                                        "BankLedgerEntries", "BankLedgerAuditEntries", "SalaryPayments", "Users", 
                                        "Vendors", "Customers", "InventoryMovements", "PlatformAuditLogs", "Companies"
                                    };

                                    foreach (var table in tables)
                                    {
                                        try
                                        {
                                            cmd.CommandText = $@"
                                                UPDATE ""{schema}"".""{table}"" 
                                                SET ""CreatedAt"" = NOW() AT TIME ZONE 'utc'
                                                WHERE ""CreatedAt"" IS NULL OR ""CreatedAt"" < '2020-01-01'::timestamp;";
                                            await cmd.ExecuteNonQueryAsync();
                                        }
                                        catch { }
                                        
                                        try
                                        {
                                            cmd.CommandText = $@"
                                                UPDATE ""{schema}"".""{table}"" 
                                                SET ""UpdatedAt"" = NOW() AT TIME ZONE 'utc'
                                                WHERE ""UpdatedAt"" IS NOT NULL AND ""UpdatedAt"" < '2020-01-01'::timestamp;";
                                            await cmd.ExecuteNonQueryAsync();
                                        }
                                        catch { }
                                    }

                                    try
                                    {
                                        cmd.CommandText = $@"
                                            UPDATE ""{schema}"".""Purchases"" 
                                            SET ""PurchaseDate"" = NOW() AT TIME ZONE 'utc'
                                            WHERE ""PurchaseDate"" IS NULL OR ""PurchaseDate"" < '2020-01-01'::timestamp;";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}

                                    try
                                    {
                                        cmd.CommandText = $@"
                                            UPDATE ""{schema}"".""PurchasePayments"" 
                                            SET ""PaymentDate"" = NOW() AT TIME ZONE 'utc'
                                            WHERE ""PaymentDate"" IS NULL OR ""PaymentDate"" < '2020-01-01'::timestamp;";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}

                                    try
                                    {
                                        cmd.CommandText = $@"
                                            UPDATE ""{schema}"".""SimpleExpenses"" 
                                            SET ""ExpenseDate"" = NOW() AT TIME ZONE 'utc'
                                            WHERE ""ExpenseDate"" IS NULL OR ""ExpenseDate"" < '2020-01-01'::timestamp;";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}

                                    try
                                    {
                                        cmd.CommandText = $@"
                                            UPDATE ""{schema}"".""BankLedgerEntries"" 
                                            SET ""TransactionDate"" = NOW() AT TIME ZONE 'utc'
                                            WHERE ""TransactionDate"" IS NULL OR ""TransactionDate"" < '2020-01-01'::timestamp;";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}

                                    try
                                    {
                                        cmd.CommandText = $@"
                                            UPDATE ""{schema}"".""SalaryPayments"" 
                                            SET ""PaymentDate"" = NOW() AT TIME ZONE 'utc'
                                            WHERE ""PaymentDate"" IS NULL OR ""PaymentDate"" < '2020-01-01'::timestamp;";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}
                                    try
                                    {
                                        cmd.CommandText = $@"
                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""Companies"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""Name"" text NOT NULL,
                                                ""Code"" text NOT NULL,
                                                ""IsActive"" boolean NOT NULL DEFAULT true,
                                                ""TimeZone"" text NULL DEFAULT 'Asia/Kolkata',
                                                ""DateFormat"" text NULL DEFAULT 'dd MMM yyyy',
                                                ""TimeFormat"" text NULL DEFAULT '12h',
                                                ""AdminPinHash"" text NULL,
                                                ""ApiKey"" text NULL,
                                                ""TenantId"" uuid NOT NULL,
                                                ""CreatedAt"" timestamp with time zone NOT NULL,
                                                ""CreatedBy"" text NOT NULL,
                                                ""UpdatedAt"" timestamp with time zone NULL,
                                                ""UpdatedBy"" text NULL,
                                                ""CreatedByIP"" text NULL,
                                                ""UpdatedByIP"" text NULL,
                                                ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                                ""DeletedAt"" timestamp with time zone NULL,
                                                ""DeletedBy"" text NULL
                                            );

                                            ALTER TABLE ""{schema}"".""Companies"" ADD COLUMN IF NOT EXISTS ""AdminPinHash"" text NULL;
                                            ALTER TABLE ""{schema}"".""Companies"" ADD COLUMN IF NOT EXISTS ""ApiKey"" text NULL;
                                            
                                            UPDATE ""{schema}"".""Companies"" 
                                            SET ""TimeZone"" = 'Asia/Kolkata'
                                            WHERE ""TimeZone"" IS NULL;
                                            
                                            UPDATE ""{schema}"".""Companies"" 
                                            SET ""DateFormat"" = 'dd MMM yyyy'
                                            WHERE ""DateFormat"" IS NULL;
                                            
                                            UPDATE ""{schema}"".""Companies"" 
                                            SET ""TimeFormat"" = '12h'
                                            WHERE ""TimeFormat"" IS NULL;

                                            UPDATE ""public"".""Tenants"" SET ""Currency"" = 'INR' WHERE ""Currency"" = 'USD' OR ""Currency"" IS NULL;

                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""PaymentMethod"" text NULL;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""BankAccountId"" uuid NULL;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""CashBookId"" uuid NULL;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""UnitPrice"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""DiscountAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""TaxAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""CGST"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""SGST"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""IGST"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""SalesTransactions"" ADD COLUMN IF NOT EXISTS ""MetadataJson"" text NULL;

                                            -- Purchase Categories Configuration Upgrade
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""DefaultLedgerAccount"" text NULL;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""AffectsInventory"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequiresAsset"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequiresExpense"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""AffectsVendorLedger"" boolean NOT NULL DEFAULT true;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""IsGstApplicable"" boolean NOT NULL DEFAULT true;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""DefaultGstRate"" numeric(18,2) NOT NULL DEFAULT 18.0;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""AllowGstRateChange"" boolean NOT NULL DEFAULT true;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""AllowCustomGstRate"" boolean NOT NULL DEFAULT true;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireQuantity"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireUnit"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireItem"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireServiceDescription"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireAssetDetails"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireInvoiceNumber"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequireVendor"" boolean NOT NULL DEFAULT true;
                                            ALTER TABLE ""{schema}"".""PurchaseCategories"" ADD COLUMN IF NOT EXISTS ""RequirePaymentDetails"" boolean NOT NULL DEFAULT true;

                                            -- Purchases GST Breakdown & Calculation Upgrade
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""TaxMode"" text NOT NULL DEFAULT 'GST';
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""GSTRate"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""TaxableAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""CGSTAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""SGSTAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""IGSTAmount"" numeric(18,2) NOT NULL DEFAULT 0.0;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""IsGstOverridden"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""IsInclusiveTax"" boolean NOT NULL DEFAULT false;
                                            ALTER TABLE ""{schema}"".""Purchases"" ADD COLUMN IF NOT EXISTS ""IsInterState"" boolean NOT NULL DEFAULT false;

                                            -- Safe Category Deduplication and Normalization
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'RawMaterial', ""Treatment"" = 'Inventory', ""AffectsInventory"" = true, ""RequireQuantity"" = true, ""RequireUnit"" = true, ""RequireItem"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Raw Material';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Machine', ""Treatment"" = 'Asset', ""RequiresAsset"" = true, ""RequireAssetDetails"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Machine / Equipment';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'OfficeAsset', ""Treatment"" = 'Asset', ""RequiresAsset"" = true, ""RequireAssetDetails"" = true, ""RequireQuantity"" = true, ""RequireUnit"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Office Asset';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'OfficeExpense', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Office Expense';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Service', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""RequireServiceDescription"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Service / Consulting';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Maintenance', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""RequireServiceDescription"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Maintenance & Repair';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Utility', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Utility Bills';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Vehicle', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""DefaultGstRate"" = 0.0 WHERE ""Code"" = 'Vehicle & Fuel Expense';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Software', ""Treatment"" = 'Expense', ""RequiresExpense"" = true, ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Software & Subscriptions';
                                            UPDATE ""{schema}"".""PurchaseCategories"" SET ""Code"" = 'Other', ""Treatment"" = 'Expense', ""DefaultGstRate"" = 18.0 WHERE ""Code"" = 'Other Category';

                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'RawMaterial' WHERE ""PurchaseCategory"" = 'Raw Material';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Machine' WHERE ""PurchaseCategory"" = 'Machine / Equipment';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'OfficeAsset' WHERE ""PurchaseCategory"" = 'Office Asset';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'OfficeExpense' WHERE ""PurchaseCategory"" = 'Office Expense';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Service' WHERE ""PurchaseCategory"" = 'Service / Consulting';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Maintenance' WHERE ""PurchaseCategory"" = 'Maintenance & Repair';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Utility' WHERE ""PurchaseCategory"" = 'Utility Bills';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Vehicle' WHERE ""PurchaseCategory"" = 'Vehicle & Fuel Expense';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Software' WHERE ""PurchaseCategory"" = 'Software & Subscriptions';
                                            UPDATE ""{schema}"".""Purchases"" SET ""PurchaseCategory"" = 'Other' WHERE ""PurchaseCategory"" = 'Other Category';

                                            -- Soft delete duplicates, keeping canonical record for each Code
                                            UPDATE ""{schema}"".""PurchaseCategories""
                                            SET ""IsDeleted"" = true
                                            WHERE ""Id"" IN (
                                                SELECT ""Id"" FROM (
                                                    SELECT ""Id"", ROW_NUMBER() OVER (PARTITION BY ""TenantId"", LOWER(""Code"") ORDER BY ""CreatedAt"" ASC, ""Id"") as rn
                                                    FROM ""{schema}"".""PurchaseCategories""
                                                    WHERE ""IsDeleted"" = false
                                                ) t WHERE t.rn > 1
                                            );

                                            -- Backfill historical Purchases TaxableAmount and GST splits safely
                                            UPDATE ""{schema}"".""Purchases""
                                            SET ""TaxableAmount"" = GREATEST(0, ""SubTotal"" - ""DiscountAmount"" + ""OtherCharges""),
                                                ""TaxMode"" = CASE WHEN ""TaxAmount"" > 0 THEN 'GST' ELSE 'NonGST' END,
                                                ""CGSTAmount"" = CASE WHEN ""TaxAmount"" > 0 THEN ROUND(""TaxAmount"" / 2.0, 2) ELSE 0 END,
                                                ""SGSTAmount"" = CASE WHEN ""TaxAmount"" > 0 THEN ROUND(""TaxAmount"" - ROUND(""TaxAmount"" / 2.0, 2), 2) ELSE 0 END,
                                                ""GSTRate"" = CASE WHEN ""TaxAmount"" > 0 AND GREATEST(0, ""SubTotal"" - ""DiscountAmount"" + ""OtherCharges"") > 0 
                                                                 THEN ROUND((""TaxAmount"" / GREATEST(0, ""SubTotal"" - ""DiscountAmount"" + ""OtherCharges"")) * 100.0, 2)
                                                                 ELSE 0 END
                                            WHERE (""TaxableAmount"" = 0 AND ""SubTotal"" > 0) OR ""TaxMode"" IS NULL;

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
                                                ""CreatedBy"" text NOT NULL,
                                                ""UpdatedAt"" timestamp with time zone NULL,
                                                ""UpdatedBy"" text NULL,
                                                ""CreatedByIP"" text NULL,
                                                ""UpdatedByIP"" text NULL
                                            );

                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinWarning"" double precision NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxWarning"" double precision NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MinAcceptable"" double precision NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""MaxAcceptable"" double precision NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestParameters"" ADD COLUMN IF NOT EXISTS ""Frequency"" text NOT NULL DEFAULT 'DAILY';

                                            ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""FssaiNumber"" text NULL;
                                            ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""BisNumber"" text NULL;
                                            ALTER TABLE ""{schema}"".""QCSettings"" ADD COLUMN IF NOT EXISTS ""AdditionalLicensesJson"" text NULL;

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
                                                ""CreatedBy"" text NOT NULL,
                                                ""UpdatedAt"" timestamp with time zone NULL,
                                                ""UpdatedBy"" text NULL,
                                                ""CreatedByIP"" text NULL,
                                                ""UpdatedByIP"" text NULL,
                                                ""DeletedAt"" timestamp with time zone NULL,
                                                ""DeletedBy"" text NULL
                                            );

                                            ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""ConcurrencyToken"" text NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""CreatedByIP"" text NULL;
                                            ALTER TABLE ""{schema}"".""WaterTestReports"" ADD COLUMN IF NOT EXISTS ""UpdatedByIP"" text NULL;

                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""WaterTestResults"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""ReportId"" uuid NOT NULL,
                                                ""ParameterId"" uuid NOT NULL,
                                                ""Value"" double precision NULL,
                                                ""StringValue"" text NULL,
                                                ""IsPass"" boolean NOT NULL,
                                                ""QualityStatus"" text NOT NULL DEFAULT 'PASS',
                                                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                ""CreatedBy"" text NOT NULL,
                                                ""UpdatedAt"" timestamp with time zone NULL,
                                                ""UpdatedBy"" text NULL,
                                                ""CreatedByIP"" text NULL,
                                                ""UpdatedByIP"" text NULL,
                                                CONSTRAINT fk_report FOREIGN KEY (""ReportId"") REFERENCES ""{schema}"".""WaterTestReports"" (""Id"") ON DELETE CASCADE,
                                                CONSTRAINT fk_parameter FOREIGN KEY (""ParameterId"") REFERENCES ""{schema}"".""WaterTestParameters"" (""Id"") ON DELETE RESTRICT
                                            );

                                            CREATE UNIQUE INDEX IF NOT EXISTS uq_water_test_results ON ""{schema}"".""WaterTestResults"" (""ReportId"", ""ParameterId"");

                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""OperationsIssues"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""TenantId"" uuid NOT NULL,
                                                ""CompanyId"" uuid NOT NULL,
                                                ""IssueNumber"" text NOT NULL,
                                                ""Title"" text NOT NULL,
                                                ""Description"" text NOT NULL,
                                                ""Department"" text NOT NULL DEFAULT 'Production',
                                                ""Category"" text NOT NULL DEFAULT 'Machine Breakdown',
                                                ""Priority"" text NOT NULL DEFAULT 'Medium',
                                                ""Status"" text NOT NULL DEFAULT 'Open',
                                                ""ReportedByUserId"" text NOT NULL,
                                                ""ReportedByName"" text NOT NULL,
                                                ""AssignedToUserId"" text NULL,
                                                ""AssignedToName"" text NULL,
                                                ""MachineId"" uuid NULL,
                                                ""MachineName"" text NULL,
                                                ""ProductionLineId"" uuid NULL,
                                                ""ProductionLineName"" text NULL,
                                                ""BatchNumber"" text NULL,
                                                ""ShiftId"" uuid NULL,
                                                ""ReportedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                ""DueDate"" timestamp with time zone NULL,
                                                ""ResolvedAt"" timestamp with time zone NULL,
                                                ""ClosedAt"" timestamp with time zone NULL,
                                                ""VerifiedAt"" timestamp with time zone NULL,
                                                ""EstimatedCost"" numeric NULL,
                                                ""ActualCost"" numeric NULL,
                                                ""DowntimeMinutes"" integer NULL,
                                                ""RequiresMaintenance"" boolean NOT NULL DEFAULT false,
                                                ""MaintenanceWorkOrderId"" uuid NULL,
                                                ""RootCause"" text NULL,
                                                ""CorrectiveAction"" text NULL,
                                                ""PreventiveAction"" text NULL,
                                                ""Attachments"" text NULL,
                                                ""IsRead"" boolean NOT NULL DEFAULT false,
                                                ""ReadAt"" timestamp with time zone NULL,
                                                ""ReadBy"" text NULL,
                                                ""IsDeleted"" boolean NOT NULL DEFAULT false,
                                                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                ""CreatedBy"" text NOT NULL,
                                                ""UpdatedAt"" timestamp with time zone NULL,
                                                ""UpdatedBy"" text NULL,
                                                ""DeletedAt"" timestamp with time zone NULL,
                                                ""DeletedBy"" text NULL
                                            );

                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""OperationsIssueAffectedMachines"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""IssueId"" uuid NOT NULL,
                                                ""MachineId"" uuid NOT NULL,
                                                ""MachineName"" text NOT NULL,
                                                ""MachineCode"" text NULL,
                                                CONSTRAINT fk_issue_affected_machines FOREIGN KEY (""IssueId"") REFERENCES ""{schema}"".""OperationsIssues"" (""Id"") ON DELETE CASCADE
                                            );

                                            CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_affected_machines ON ""{schema}"".""OperationsIssueAffectedMachines"" (""IssueId"", ""MachineId"");

                                            INSERT INTO ""{schema}"".""OperationsIssueAffectedMachines"" (""Id"", ""IssueId"", ""MachineId"", ""MachineName"")
                                            SELECT gen_random_uuid(), ""Id"", ""MachineId"", COALESCE(""MachineName"", 'Primary Machine')
                                            FROM ""{schema}"".""OperationsIssues""
                                            WHERE ""MachineId"" IS NOT NULL
                                            AND NOT EXISTS (
                                                SELECT 1 FROM ""{schema}"".""OperationsIssueAffectedMachines"" m WHERE m.""IssueId"" = ""{schema}"".""OperationsIssues"".""Id"" AND m.""MachineId"" = ""{schema}"".""OperationsIssues"".""MachineId""
                                            );

                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""OperationsIssueComments"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""IssueId"" uuid NOT NULL,
                                                ""AuthorId"" text NOT NULL,
                                                ""AuthorName"" text NOT NULL,
                                                ""AuthorRole"" text NOT NULL,
                                                ""Message"" text NOT NULL,
                                                ""AttachmentUrl"" text NULL,
                                                ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                CONSTRAINT fk_issue_comments FOREIGN KEY (""IssueId"") REFERENCES ""{schema}"".""OperationsIssues"" (""Id"") ON DELETE CASCADE
                                            );

                                            CREATE TABLE IF NOT EXISTS ""{schema}"".""OperationsIssueHistories"" (
                                                ""Id"" uuid NOT NULL PRIMARY KEY,
                                                ""IssueId"" uuid NOT NULL,
                                                ""PerformedBy"" text NOT NULL,
                                                ""Action"" text NOT NULL,
                                                ""Details"" text NULL,
                                                ""Timestamp"" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                CONSTRAINT fk_issue_history FOREIGN KEY (""IssueId"") REFERENCES ""{schema}"".""OperationsIssues"" (""Id"") ON DELETE CASCADE
                                            );

                                            -- Global Search Performance Optimization Indexes
                                            CREATE INDEX IF NOT EXISTS idx_customers_search ON ""{schema}"".""Customers"" (""CustomerName"", ""Phone"");
                                            CREATE INDEX IF NOT EXISTS idx_vehicles_search ON ""{schema}"".""twenty_l_distributor_vehicles"" (""RegistrationNumber"");
                                            CREATE INDEX IF NOT EXISTS idx_drivers_search ON ""{schema}"".""twenty_l_distributor_drivers"" (""DriverName"", ""Phone"");
                                            CREATE INDEX IF NOT EXISTS idx_dist_cust_search ON ""{schema}"".""twenty_l_distributor_customers"" (""CustomerName"", ""Phone"");
                                            CREATE INDEX IF NOT EXISTS idx_supplies_search ON ""{schema}"".""twenty_l_distributor_supplies"" (""SupplyNumber"");
                                            CREATE INDEX IF NOT EXISTS idx_deliveries_search ON ""{schema}"".""twenty_l_distributor_deliveries"" (""DeliveryNumber"");
                                            CREATE INDEX IF NOT EXISTS idx_products_search ON ""{schema}"".""Products"" (""Name"", ""SKU"");
                                            CREATE INDEX IF NOT EXISTS idx_batches_search ON ""{schema}"".""ProductionBatches"" (""BatchNumber"");
                                            CREATE INDEX IF NOT EXISTS idx_purchases_search ON ""{schema}"".""Purchases"" (""PurchaseNo"", ""InvoiceNumber"");
                                            CREATE INDEX IF NOT EXISTS idx_vendors_search ON ""{schema}"".""Vendors"" (""Name"", ""Phone"");";
                                        await cmd.ExecuteNonQueryAsync();
                                    }
                                    catch {}
                                }
                            }
                            catch (Exception repairEx)
                            {
                                _logger.LogWarning($"[REPAIR-DATETIME WARN]: Failed timestamp cleanup for {tenant.SchemaName}: {repairEx.Message}");
                            }

                            // GOD MODE ENFORCEMENT: Validate the Tenant Schema after repair
                            var validator = _serviceProvider.GetRequiredService<DatabaseSchemaValidator>();
                            await validator.ValidateSchemaAsync(tenantContext, tenant.SchemaName);
                        }
                        _logger.LogInformation($"Tenant {tenant.Name} migrated successfully.");
                    }
                    catch (Exception tenantEx)
                    {
                        _logger.LogError(tenantEx, $"Failed to migrate tenant schema for: {tenant.Name}");
                    }
                }
                _logger.LogInformation("Tenant Database Migrations completed.");
            }
            catch (Exception migrationEx)
            {
                _logger.LogError(migrationEx, "A critical error occurred during database migrations.");
                throw;
            }
        }
    }
}
