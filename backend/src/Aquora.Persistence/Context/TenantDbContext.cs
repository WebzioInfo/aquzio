using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Aquora.Application.Interfaces;
using Aquora.Domain.Common;
using Aquora.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Aquora.Persistence.Context
{
    public class TenantDbContext : DbContext, ITenantDbContext
    {
        private readonly ICurrentUserContext _currentUserContext;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly ITenantProvider _tenantProvider;

        private bool _isRecalculating = false;

        public TenantDbContext(
            DbContextOptions<TenantDbContext> options,
            ITenantProvider tenantProvider,
            ICurrentUserContext currentUserContext,
            IDateTimeProvider? dateTimeProvider = null) : base(options)
        {
            _tenantProvider = tenantProvider;
            _currentUserContext = currentUserContext;
            _dateTimeProvider = dateTimeProvider ?? new DefaultDateTimeProvider();
        }

        // God Mode Finance Module
        public DbSet<Aquora.Domain.Entities.Finance.AccountGroup> AccountGroups => Set<Aquora.Domain.Entities.Finance.AccountGroup>();
        public DbSet<Aquora.Domain.Entities.Finance.Account> Accounts => Set<Aquora.Domain.Entities.Finance.Account>();
        public DbSet<Aquora.Domain.Entities.Finance.AssetHistory> AssetHistories => Set<Aquora.Domain.Entities.Finance.AssetHistory>();
        public DbSet<Aquora.Domain.Entities.Finance.AssetMaintenanceRecord> AssetMaintenanceRecords => Set<Aquora.Domain.Entities.Finance.AssetMaintenanceRecord>();
        public DbSet<Aquora.Domain.Entities.Finance.Asset> Assets => Set<Aquora.Domain.Entities.Finance.Asset>();
        public DbSet<Aquora.Domain.Entities.Finance.AssetCategory> AssetCategories => Set<Aquora.Domain.Entities.Finance.AssetCategory>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        // Administration & Backup Module
        public DbSet<Aquora.Domain.Entities.Administration.BackupHistory> BackupHistories => Set<Aquora.Domain.Entities.Administration.BackupHistory>();
        public DbSet<Aquora.Domain.Entities.Finance.BankAccount> BankAccounts => Set<Aquora.Domain.Entities.Finance.BankAccount>();
        public DbSet<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry> BankLedgerAuditEntries => Set<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry>();
        public DbSet<Aquora.Domain.Entities.Finance.BankLedgerEntry> BankLedgerEntries => Set<Aquora.Domain.Entities.Finance.BankLedgerEntry>();
        public DbSet<Brand> Brands => Set<Brand>();
        public DbSet<CaseConfiguration> CaseConfigurations => Set<CaseConfiguration>();
        public DbSet<Aquora.Domain.Entities.Finance.CashBook> CashBooks => Set<Aquora.Domain.Entities.Finance.CashBook>();

        public DbSet<Company> Companies => Set<Company>();
        public DbSet<Aquora.Domain.Entities.QC.ComplianceRecord> ComplianceRecords => Set<Aquora.Domain.Entities.QC.ComplianceRecord>();
        public DbSet<Customer> Customers => Set<Customer>();
        public DbSet<CustomerProductPrice> CustomerProductPrices => Set<CustomerProductPrice>();
        public DbSet<DiscountGroup> DiscountGroups => Set<DiscountGroup>();
        public DbSet<Aquora.Domain.Entities.Finance.ExpenseRecord> ExpenseRecords => Set<Aquora.Domain.Entities.Finance.ExpenseRecord>();
        public DbSet<InventoryMovement> InventoryMovements => Set<InventoryMovement>();
        public DbSet<Aquora.Domain.Entities.Finance.JournalEntry> JournalEntries => Set<Aquora.Domain.Entities.Finance.JournalEntry>();
        public DbSet<Aquora.Domain.Entities.Finance.JournalEntryLine> JournalEntryLines => Set<Aquora.Domain.Entities.Finance.JournalEntryLine>();
        public DbSet<Aquora.Domain.Entities.Payroll.MonthlySalary> MonthlySalaries => Set<Aquora.Domain.Entities.Payroll.MonthlySalary>();
        public DbSet<OperationsFillingLog> OperationsFillingLogs => Set<OperationsFillingLog>();
        public DbSet<OperationsFillingQueue> OperationsFillingQueues => Set<OperationsFillingQueue>();
        public DbSet<Aquora.Domain.Entities.Operations.OperationsIssueAffectedMachine> OperationsIssueAffectedMachines => Set<Aquora.Domain.Entities.Operations.OperationsIssueAffectedMachine>();
        public DbSet<Aquora.Domain.Entities.Operations.OperationsIssueComment> OperationsIssueComments => Set<Aquora.Domain.Entities.Operations.OperationsIssueComment>();
        public DbSet<Aquora.Domain.Entities.Operations.OperationsIssueHistory> OperationsIssueHistories => Set<Aquora.Domain.Entities.Operations.OperationsIssueHistory>();

        // Operations Issue Management System Module
        public DbSet<Aquora.Domain.Entities.Operations.OperationsIssue> OperationsIssues => Set<Aquora.Domain.Entities.Operations.OperationsIssue>();
        public DbSet<OperationsJarCondition> OperationsJarConditions => Set<OperationsJarCondition>();
        public DbSet<OperationsLoading> OperationsLoadings => Set<OperationsLoading>();
        public DbSet<OperationsQuarantine> OperationsQuarantines => Set<OperationsQuarantine>();
        public DbSet<OperationsReservedJar> OperationsReservedJars => Set<OperationsReservedJar>();
        public DbSet<OperationsUnloading> OperationsUnloadings => Set<OperationsUnloading>();

        // 20L Operations Module
        public DbSet<OperationsVisit> OperationsVisits => Set<OperationsVisit>();
        public DbSet<OperationsWashingLog> OperationsWashingLogs => Set<OperationsWashingLog>();
        public DbSet<OperatorContextLog> OperatorContextLogs => Set<OperatorContextLog>();
        public DbSet<Aquora.Domain.Entities.Finance.OwnerInvestmentTransaction> OwnerInvestmentTransactions => Set<Aquora.Domain.Entities.Finance.OwnerInvestmentTransaction>();
        public DbSet<Aquora.Domain.Entities.Finance.Owner> Owners => Set<Aquora.Domain.Entities.Finance.Owner>();
        public DbSet<Permission> Permissions => Set<Permission>();
        public DbSet<Aquora.Domain.Entities.Finance.PettyCashSession> PettyCashSessions => Set<Aquora.Domain.Entities.Finance.PettyCashSession>();
        public DbSet<PriceList> PriceLists => Set<PriceList>();
        public DbSet<ProductionBatch> ProductionBatches => Set<ProductionBatch>();
        public DbSet<ProductionEntry> ProductionEntries => Set<ProductionEntry>();
        public DbSet<ProductionLine> ProductionLines => Set<ProductionLine>();
        public DbSet<ProductionSession> ProductionSessions => Set<ProductionSession>();
        public DbSet<ProductionShift> ProductionShifts => Set<ProductionShift>();
        public DbSet<ProductionStationData> ProductionStationData => Set<ProductionStationData>();
        public DbSet<Product> Products => Set<Product>();
        public DbSet<Aquora.Domain.Entities.Finance.PurchaseItem> PurchaseItems => Set<Aquora.Domain.Entities.Finance.PurchaseItem>();
        public DbSet<Aquora.Domain.Entities.Finance.PurchasePayment> PurchasePayments => Set<Aquora.Domain.Entities.Finance.PurchasePayment>();
        public DbSet<Aquora.Domain.Entities.Finance.PurchaseTimelineEvent> PurchaseTimelineEvents => Set<Aquora.Domain.Entities.Finance.PurchaseTimelineEvent>();
        public DbSet<Aquora.Domain.Entities.Finance.Purchase> Purchases => Set<Aquora.Domain.Entities.Finance.Purchase>();
        public DbSet<Aquora.Domain.Entities.Finance.PurchaseCategory> PurchaseCategories => Set<Aquora.Domain.Entities.Finance.PurchaseCategory>();
        public DbSet<Aquora.Domain.Entities.QC.QCAuditLog> QCAuditLogs => Set<Aquora.Domain.Entities.QC.QCAuditLog>();
        public DbSet<Aquora.Domain.Entities.QC.QCSettings> QCSettings => Set<Aquora.Domain.Entities.QC.QCSettings>();
        public DbSet<RawMaterial> RawMaterials => Set<RawMaterial>();
        public DbSet<Aquora.Domain.Entities.Administration.RestoreHistory> RestoreHistories => Set<Aquora.Domain.Entities.Administration.RestoreHistory>();
        public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
        public DbSet<Role> Roles => Set<Role>();
        public DbSet<Aquora.Domain.Entities.Payroll.SalaryPayment> SalaryPayments => Set<Aquora.Domain.Entities.Payroll.SalaryPayment>();
        public DbSet<SalesTransaction> SalesTransactions => Set<SalesTransaction>();
        public DbSet<SalesTransactionItem> SalesTransactionItems => Set<SalesTransactionItem>();

        public string SchemaName => !string.IsNullOrWhiteSpace(_tenantProvider.TenantSchemaName)
            ? _tenantProvider.TenantSchemaName
            : "public";

        // Simple Accounts V1 Module
        public DbSet<Aquora.Domain.Entities.Finance.SimpleExpense> SimpleExpenses => Set<Aquora.Domain.Entities.Finance.SimpleExpense>();
        public DbSet<Aquora.Domain.Entities.Finance.ExpenseCategory> ExpenseCategories => Set<Aquora.Domain.Entities.Finance.ExpenseCategory>();
        public DbSet<SkuProduct> SkuProducts => Set<SkuProduct>();
        public DbSet<Station> Stations => Set<Station>();
        public DbSet<TwentyLCommissionRule> TwentyLCommissionRules => Set<TwentyLCommissionRule>();
        public DbSet<TwentyLCommissionTransaction> TwentyLCommissionTransactions => Set<TwentyLCommissionTransaction>();
        public DbSet<TwentyLDelivery> TwentyLDeliveries => Set<TwentyLDelivery>();
        public DbSet<TwentyLDistributorCustomer> TwentyLDistributorCustomers => Set<TwentyLDistributorCustomer>();
        public DbSet<TwentyLDistributorDelivery> TwentyLDistributorDeliveries => Set<TwentyLDistributorDelivery>();
        public DbSet<TwentyLDistributorDriver> TwentyLDistributorDrivers => Set<TwentyLDistributorDriver>();
        public DbSet<TwentyLDistributorProfile> TwentyLDistributorProfiles => Set<TwentyLDistributorProfile>();
        public DbSet<TwentyLDistributorRoute> TwentyLDistributorRoutes => Set<TwentyLDistributorRoute>();
        public DbSet<TwentyLDistributorSupply> TwentyLDistributorSupplies => Set<TwentyLDistributorSupply>();
        public DbSet<TwentyLDistributorVehicle> TwentyLDistributorVehicles => Set<TwentyLDistributorVehicle>();
        public DbSet<TwentyLJarInspection> TwentyLJarInspections => Set<TwentyLJarInspection>();
        public DbSet<TwentyLJarMovement> TwentyLJarMovements => Set<TwentyLJarMovement>();
        public DbSet<TwentyLJarPosition> TwentyLJarPositions => Set<TwentyLJarPosition>();
        public DbSet<TwentyLOperation> TwentyLOperations => Set<TwentyLOperation>();
        public DbSet<TwentyLRateRule> TwentyLRateRules => Set<TwentyLRateRule>();
        public DbSet<TwentyLTripStop> TwentyLTripStops => Set<TwentyLTripStop>();
        public DbSet<TwentyLTrip> TwentyLTrips => Set<TwentyLTrip>();
        public DbSet<UserRole> UserRoles => Set<UserRole>();
        public DbSet<User> Users => Set<User>();

        // Purchase Management & Asset History Module
        public DbSet<Aquora.Domain.Entities.Finance.Vendor> Vendors => Set<Aquora.Domain.Entities.Finance.Vendor>();
        public DbSet<Aquora.Domain.Entities.QC.WaterTestParameter> WaterTestParameters => Set<Aquora.Domain.Entities.QC.WaterTestParameter>();

        // Quality Control Module
        public DbSet<Aquora.Domain.Entities.QC.WaterTestReport> WaterTestReports => Set<Aquora.Domain.Entities.QC.WaterTestReport>();
        public DbSet<Aquora.Domain.Entities.QC.WaterTestResult> WaterTestResults => Set<Aquora.Domain.Entities.QC.WaterTestResult>();

        public override int SaveChanges()
        {
            if (_isRecalculating)
            {
                return base.SaveChanges();
            }

            LogDatabaseContextState();
            var currentUserId = _currentUserContext.UserId ?? "System";
            var currentTenantId = _tenantProvider.TenantId;
            OnBeforeSaving(currentUserId, currentTenantId);

            GetAffectedLedgerAccounts(out var bankAccountIds, out var cashBookIds);

            var result = base.SaveChanges();

            if (bankAccountIds.Any() || cashBookIds.Any())
            {
                RecalculateBalances(bankAccountIds, cashBookIds);
            }

            return result;
        }

        public override int SaveChanges(bool acceptAllChangesOnSuccess)
        {
            if (_isRecalculating)
            {
                return base.SaveChanges(acceptAllChangesOnSuccess);
            }

            LogDatabaseContextState();
            var currentUserId = _currentUserContext.UserId ?? "System";
            var currentTenantId = _tenantProvider.TenantId;
            OnBeforeSaving(currentUserId, currentTenantId);

            GetAffectedLedgerAccounts(out var bankAccountIds, out var cashBookIds);

            var result = base.SaveChanges(acceptAllChangesOnSuccess);

            if (bankAccountIds.Any() || cashBookIds.Any())
            {
                RecalculateBalances(bankAccountIds, cashBookIds);
            }

            return result;
        }
        public override async Task<int> SaveChangesAsync(
    CancellationToken cancellationToken = default)
        {
            // Prevent recursive SaveChanges calls during balance recalculation.
            if (_isRecalculating)
            {
                return await base.SaveChangesAsync(cancellationToken);
            }

            // Log the current EF Core tracking state before any preprocessing.
            LogDatabaseContextState();

            var currentUserId = _currentUserContext.UserId ?? "System";
            var currentTenantId = _tenantProvider.TenantId;

            // Apply tenant/audit/soft-delete processing.
            OnBeforeSaving(currentUserId, currentTenantId);

            // Determine affected ledger accounts before the first database save.
            GetAffectedLedgerAccounts(
                out var bankAccountIds,
                out var cashBookIds);

            // ============================================================
            // AUDIT DISABLED
            // ============================================================
            if (AuditState.IsDisabled)
            {
                try
                {
                    var result = await base.SaveChangesAsync(cancellationToken);

                    if (bankAccountIds.Any() || cashBookIds.Any())
                    {
                        await RecalculateBalancesAsync(
                            bankAccountIds,
                            cashBookIds,
                            cancellationToken);
                    }

                    return result;
                }
                catch (DbUpdateException dbEx)
                {
                    LogDbUpdateException(dbEx);
                    throw;
                }
            }

            // ============================================================
            // GENERATE AUDIT LOGS
            // ============================================================
            var auditLogs = GenerateAuditLogs(
                currentUserId,
                currentTenantId);

            // ============================================================
            // FIRST DATABASE SAVE
            // ============================================================
            int resultWithAudit;

            try
            {
                resultWithAudit = await base.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException dbEx)
            {
                LogDbUpdateException(dbEx);
                throw;
            }

            // ============================================================
            // SAVE AUDIT LOGS
            // ============================================================
            if (auditLogs.Any())
            {
                foreach (var log in auditLogs)
                {
                    try
                    {
                        var logJson =
                            System.Text.Json.JsonSerializer.Serialize(
                                log,
                                new System.Text.Json.JsonSerializerOptions
                                {
                                    WriteIndented = true
                                });

                        Console.WriteLine(
                            $"[AUDIT LOG INSERTING]:\n{logJson}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(
                            $"Failed to serialize audit log for console output: {ex.Message}");
                    }
                }

                AuditLogs.AddRange(auditLogs);

                try
                {
                    await base.SaveChangesAsync(cancellationToken);
                }
                catch (Exception ex)
                {
                    // Audit log failure must not invalidate the already
                    // successful business transaction.
                    Console.WriteLine(
                        $"[AUDIT LOG FAILURE - NON-BLOCKING]: " +
                        $"Failed to save audit logs to database: {ex.Message}");

                    foreach (var log in auditLogs)
                    {
                        Entry(log).State = EntityState.Detached;
                    }
                }
            }

            // ============================================================
            // RECALCULATE LEDGER BALANCES
            // ============================================================
            if (bankAccountIds.Any() || cashBookIds.Any())
            {
                await RecalculateBalancesAsync(
                    bankAccountIds,
                    cashBookIds,
                    cancellationToken);
            }

            return resultWithAudit;
        }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            base.OnConfiguring(optionsBuilder);
            optionsBuilder.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Dynamically set schema for all entities in this context
            modelBuilder.HasDefaultSchema(SchemaName);

            // Explicitly map platform entities referenced via navigation to their correct table/schema
            modelBuilder.Entity<Tenant>()
                .ToTable("Tenants", "public", t => t.ExcludeFromMigrations());

            modelBuilder.Entity<Company>()
                .Property(c => c.IsBiodropsProduction)
                .HasDefaultValue(false);

            modelBuilder.Entity<Company>()
                .HasIndex(c => new { c.TenantId })
                .IsUnique()
                .HasFilter(@"""IsDeleted"" = false");

            modelBuilder.Entity<User>()
                .ToTable("Users", "public", t => t.ExcludeFromMigrations());

            modelBuilder.Entity<TenantDomain>()
                .ToTable("TenantDomains", "public", t => t.ExcludeFromMigrations());

            // High-Performance Composite Indexes for Purchases, Bank Ledger, and Cash Book
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Purchase>()
                .HasIndex(p => new { p.TenantId, p.IsDeleted, p.PurchaseDate, p.CreatedAt });
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Purchase>()
                .HasIndex(p => new { p.TenantId, p.VendorId, p.IsDeleted });

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.PurchaseCategory>()
                .HasIndex(c => new { c.TenantId, c.Code });
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.PurchaseCategory>()
                .HasIndex(c => c.CompanyId);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
                .HasIndex(b => new { b.TenantId, b.BankAccountId, b.TransactionDate, b.CreatedAt });
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
                .HasIndex(b => new { b.TenantId, b.CashBookId, b.LedgerAccountType, b.TransactionDate, b.CreatedAt });

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Owner>()
                .HasIndex(o => new { o.TenantId, o.UserId })
                .HasFilter(@"""UserId"" IS NOT NULL AND ""IsDeleted"" = false")
                .IsUnique();

            modelBuilder.Entity<ProductionEntry>(entity =>
            {
                entity.Property(e => e.WaterWastageLitres)
                    .HasPrecision(18, 2)
                    .HasDefaultValue(0m);

                entity.HasOne(e => e.Product)
                    .WithMany()
                    .HasForeignKey(e => e.ProductId)
                    .IsRequired(false);
            });

            modelBuilder.Entity<ProductionSession>(entity =>
            {
                entity.HasOne(s => s.Product)
                    .WithMany()
                    .HasForeignKey(s => s.ProductId)
                    .IsRequired(false);
            });

            // BackupHistory Configuration (Make tracking fields safely nullable for backward compatibility)
            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .Property(b => b.Format).IsRequired(false);
            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .Property(b => b.TenantName).IsRequired(false);
            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .Property(b => b.Version).IsRequired(false);
            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .Property(b => b.EngineVersion).IsRequired(false);
            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .Property(b => b.Encryption).IsRequired(false);

            // Quality Control Module Configuration
            modelBuilder.Entity<Aquora.Domain.Entities.QC.WaterTestReport>()
                .Property(r => r.ConcurrencyToken)
                .IsRequired()
                .HasDefaultValueSql("md5(random()::text || clock_timestamp()::text)")
                .IsConcurrencyToken();

            modelBuilder.Entity<Aquora.Domain.Entities.QC.WaterTestResult>()
                .HasIndex(r => new { r.ReportId, r.ParameterId })
                .IsUnique();

            modelBuilder.Entity<Aquora.Domain.Entities.QC.WaterTestResult>()
                .HasOne(r => r.Report)
                .WithMany(rep => rep.Results)
                .HasForeignKey(r => r.ReportId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Aquora.Domain.Entities.QC.WaterTestResult>()
                .HasOne(r => r.Parameter)
                .WithMany(p => p.Results)
                .HasForeignKey(r => r.ParameterId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Aquora.Domain.Entities.Operations.OperationsIssueAffectedMachine>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.IssueId, e.MachineId }).IsUnique();
                entity.HasOne(e => e.Issue)
                      .WithMany(i => i.AffectedMachines)
                      .HasForeignKey(e => e.IssueId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<UserRole>()
                .HasIndex(ur => new { ur.UserId, ur.RoleId });

            modelBuilder.Entity<RolePermission>()
                .HasIndex(rp => new { rp.RoleId, rp.PermissionId });

            // Purchase relationship configuration for EF Core cascade deletion
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.MonthlySalary>(entity =>
            {
                entity.HasIndex(m => new { m.TenantId, m.CompanyId, m.EmployeeId, m.SalaryMonth, m.IsDeleted });
                entity.HasMany(m => m.Payments)
                      .WithOne(p => p.MonthlySalaryEntitlement)
                      .HasForeignKey(p => p.MonthlySalaryId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Purchase>()
                .HasMany(p => p.Items)
                .WithOne(i => i.Purchase)
                .HasForeignKey(i => i.PurchaseId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Purchase>()
                .HasMany(p => p.Payments)
                .WithOne(p => p.Purchase)
                .HasForeignKey(p => p.PurchaseId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Purchase>()
                .HasMany(p => p.TimelineEvents)
                .WithOne(t => t.Purchase)
                .HasForeignKey(t => t.PurchaseId)
                .OnDelete(DeleteBehavior.Cascade);

            // Brand configuration
            modelBuilder.Entity<Brand>()
                .Property(b => b.Name)
                .HasMaxLength(150)
                .IsRequired();

            modelBuilder.Entity<Brand>()
                .HasIndex(b => b.Name)
                .IsUnique();

            modelBuilder.Entity<Brand>()
                .Property(b => b.Code)
                .HasMaxLength(50);

            modelBuilder.Entity<Brand>()
                .HasIndex(b => b.Code)
                .IsUnique();

            modelBuilder.Entity<Brand>()
                .Property(b => b.Description)
                .HasMaxLength(500);

            modelBuilder.Entity<Brand>()
                .Property(b => b.IsActive)
                .HasDefaultValue(true);

            // Product configuration
            modelBuilder.Entity<Product>()
                .HasIndex(p => p.Name);

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.BrandId);

            modelBuilder.Entity<Product>()
                .HasIndex(p => new { p.Name, p.BrandId });

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.SKU)
                .IsUnique();

            // CaseConfiguration configuration
            modelBuilder.Entity<CaseConfiguration>(entity =>
            {
                entity.HasOne(c => c.Product)
                      .WithMany()
                      .HasForeignKey(c => c.ProductId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(c => new { c.TenantId, c.ProductId, c.IsDeleted, c.IsActive });
            });

            // SalesTransaction parent-child relationship configuration
            modelBuilder.Entity<SalesTransaction>(entity =>
            {
                entity.HasOne(s => s.ParentTransaction)
                      .WithMany()
                      .HasForeignKey(s => s.ParentTransactionId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(s => s.ParentTransactionId);
            });

            // RawMaterial configuration
            modelBuilder.Entity<RawMaterial>()
                .HasIndex(rm => rm.Name)
                .IsUnique();

            modelBuilder.Entity<RawMaterial>()
                .HasIndex(rm => rm.Category);

            // InventoryMovement query indexing optimizations
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => im.CreatedAt);
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => new { im.ReferenceType, im.ReferenceId });
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => im.RawMaterialId);
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => im.ProductId);
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => im.InventoryType);
            modelBuilder.Entity<InventoryMovement>()
                .HasIndex(im => im.CompanyId);

            // ProductionEntry query indexing optimizations
            modelBuilder.Entity<ProductionEntry>()
                .HasIndex(pe => pe.ProductId);
            modelBuilder.Entity<ProductionEntry>()
                .HasIndex(pe => pe.ProductionSessionId);

            // Customer configuration
            modelBuilder.Entity<Customer>()
                .Property(c => c.CustomerCode)
                .HasMaxLength(50)
                .IsRequired();

            modelBuilder.Entity<Customer>()
                .Property(c => c.CustomerName)
                .HasMaxLength(150)
                .IsRequired();

            modelBuilder.Entity<Customer>()
                .Property(c => c.Phone)
                .HasMaxLength(20)
                .IsRequired();

            // Unique constraints per tenant (multi-tenancy) for active (non-deleted) customers
            modelBuilder.Entity<Customer>()
                .HasIndex(c => new { c.TenantId, c.Phone })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            modelBuilder.Entity<Customer>()
                .HasIndex(c => new { c.TenantId, c.CustomerCode })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");

            modelBuilder.Entity<Customer>()
                .HasIndex(c => new { c.TenantId, c.GSTNumber })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false AND \"GSTNumber\" IS NOT NULL");

            // Regular index optimizations
            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.CustomerName);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.BusinessName);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.CustomerType);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.City);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.State);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.Status);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.CompanyId);

            // SalesTransaction configuration
            modelBuilder.Entity<SalesTransaction>()
                .Property(t => t.TransactionNumber)
                .HasMaxLength(50)
                .IsRequired();

            // Operations Visit Configuration
            modelBuilder.Entity<TwentyLDistributorProfile>()
                .HasIndex(p => new { p.TenantId, p.CustomerId }).IsUnique();
            modelBuilder.Entity<TwentyLJarMovement>()
                .HasIndex(m => new { m.TenantId, m.OwnerType, m.OwnerCustomerId, m.ToLocationType, m.ToCustomerId, m.OccurredAt });
            modelBuilder.Entity<TwentyLJarPosition>()
                .HasIndex(p => new { p.TenantId, p.CompanyId, p.PositionKey }).IsUnique();
            modelBuilder.Entity<TwentyLRateRule>()
                .HasIndex(r => new { r.TenantId, r.ProductId, r.CustomerId, r.EffectiveFrom, r.EffectiveTo });
            modelBuilder.Entity<TwentyLDelivery>()
                .HasIndex(d => new { d.TenantId, d.CustomerId, d.DeliveredAt });
            modelBuilder.Entity<TwentyLDelivery>()
                .HasIndex(d => new { d.TenantId, d.IdempotencyKey }).IsUnique();
            modelBuilder.Entity<TwentyLCommissionRule>()
                .HasIndex(r => new { r.TenantId, r.BeneficiaryCustomerId, r.ProductId, r.EffectiveFrom, r.EffectiveTo });
            modelBuilder.Entity<TwentyLCommissionTransaction>()
                .HasIndex(t => new { t.TenantId, t.DeliveryId, t.BeneficiaryCustomerId });
            modelBuilder.Entity<TwentyLTrip>()
                .HasIndex(t => new { t.TenantId, t.TripNumber }).IsUnique();
            modelBuilder.Entity<TwentyLTrip>()
                .HasIndex(t => new { t.TenantId, t.PlannedDate, t.Status });
            modelBuilder.Entity<TwentyLTripStop>()
                .HasIndex(s => new { s.TenantId, s.TripId, s.StopSequence });
            modelBuilder.Entity<TwentyLOperation>()
                .HasIndex(o => new { o.TenantId, o.OperationNumber }).IsUnique();
            modelBuilder.Entity<TwentyLOperation>()
                .HasIndex(o => new { o.TenantId, o.OperationType, o.Stage });
            modelBuilder.Entity<TwentyLJarInspection>()
                .HasIndex(i => new { i.TenantId, i.InspectionNumber }).IsUnique();
            modelBuilder.Entity<OperationsVisit>()
                .HasIndex(v => v.DistributorId);
            modelBuilder.Entity<OperationsVisit>()
                .HasIndex(v => v.ArrivalTime);
            modelBuilder.Entity<OperationsVisit>()
                .HasIndex(v => v.Status);

            // Operations Unloading Configuration
            modelBuilder.Entity<OperationsUnloading>()
                .HasIndex(u => u.VisitId);
            modelBuilder.Entity<OperationsUnloading>()
                .HasIndex(u => u.BrandId);

            // Operations Jar Condition Configuration
            modelBuilder.Entity<OperationsJarCondition>()
                .HasIndex(c => c.VisitId);
            modelBuilder.Entity<OperationsJarCondition>()
                .HasIndex(c => c.ConditionType);

            // Operations Quarantine Configuration
            modelBuilder.Entity<OperationsQuarantine>()
                .HasIndex(q => q.VisitId);
            modelBuilder.Entity<OperationsQuarantine>()
                .HasIndex(q => q.Status);

            // Operations Filling Queue Configuration
            modelBuilder.Entity<OperationsFillingQueue>()
                .HasIndex(fq => fq.DistributorId);
            modelBuilder.Entity<OperationsFillingQueue>()
                .HasIndex(fq => fq.BrandId);
            modelBuilder.Entity<OperationsFillingQueue>()
                .HasIndex(fq => fq.Status);
            modelBuilder.Entity<OperationsFillingQueue>()
                .HasIndex(fq => fq.Priority);

            // Operations Loading Configuration
            modelBuilder.Entity<OperationsLoading>()
                .HasIndex(l => l.VisitId);
            modelBuilder.Entity<OperationsLoading>()
                .HasIndex(l => l.ProductId);
            modelBuilder.Entity<OperationsLoading>()
                .HasIndex(l => l.BrandId);
            modelBuilder.Entity<OperationsLoading>()
                .HasIndex(l => l.BatchNumber);

            modelBuilder.Entity<SalesTransaction>()
                .Property(t => t.TransactionType)
                .HasMaxLength(50)
                .IsRequired();

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.TransactionDate);

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.CustomerId);

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.ProductId);

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.TransactionType);

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.CreatedAt);

            modelBuilder.Entity<SalesTransaction>()
                .HasIndex(t => t.CompanyId);

            // Simple Accounts V1 Configurations & Indexes
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.SimpleExpense>()
                .HasIndex(e => e.Category);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.SimpleExpense>()
                .HasIndex(e => e.ExpenseDate);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.SimpleExpense>()
                .HasIndex(e => e.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.SimpleExpense>()
                .HasOne(e => e.BankAccount)
                .WithMany()
                .HasForeignKey(e => e.BankAccountId)
                .OnDelete(DeleteBehavior.SetNull);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.SimpleExpense>()
                .HasOne(e => e.CashBook)
                .WithMany()
                .HasForeignKey(e => e.CashBookId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.ExpenseCategory>()
                .HasIndex(c => new { c.TenantId, c.Name });
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.ExpenseCategory>()
                .HasIndex(c => c.CompanyId);

            modelBuilder.Entity<CaseConfiguration>()
                .HasIndex(c => new { c.TenantId, c.ProductId });
            modelBuilder.Entity<CaseConfiguration>()
                .HasIndex(c => c.CompanyId);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankAccount>()
                .HasIndex(b => b.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.CashBook>()
                .HasIndex(b => b.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.CashBook>()
                .HasOne(c => c.Owner)
                .WithMany(o => o.CashBooks)
                .HasForeignKey(c => c.OwnerId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.Owner>()
                .HasIndex(o => o.TenantId);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.OwnerInvestmentTransaction>()
                .HasOne(t => t.Owner)
                .WithMany(o => o.InvestmentTransactions)
                .HasForeignKey(t => t.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .Property(l => l.LedgerAccountType)
               .IsRequired(false);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .Property(l => l.LedgerSequence)
               .ValueGeneratedOnAdd();

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.CompanyId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.BankAccountId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.CashBookId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.LedgerAccountType);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasIndex(l => l.TransactionDate);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasOne(l => l.BankAccount)
               .WithMany()
               .HasForeignKey(l => l.BankAccountId)
               .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerEntry>()
               .HasOne(l => l.CashBook)
               .WithMany()
               .HasForeignKey(l => l.CashBookId)
               .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry>()
               .HasIndex(l => l.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry>()
               .HasIndex(l => l.CompanyId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry>()
               .HasIndex(l => l.BankLedgerEntryId);
            modelBuilder.Entity<Aquora.Domain.Entities.Finance.BankLedgerAuditEntry>()
               .HasOne(l => l.BankLedgerEntry)
               .WithMany()
               .HasForeignKey(l => l.BankLedgerEntryId)
               .OnDelete(DeleteBehavior.Cascade);

            // SalaryPayment configuration
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.SalaryPayment>()
               .HasIndex(s => s.TenantId);
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.SalaryPayment>()
               .HasIndex(s => s.CompanyId);
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.SalaryPayment>()
               .HasIndex(s => s.EmployeeId);
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.SalaryPayment>()
               .HasIndex(s => s.SalaryMonth);
            modelBuilder.Entity<Aquora.Domain.Entities.Payroll.SalaryPayment>()
               .HasOne(s => s.Employee)
               .WithMany()
               .HasForeignKey(s => s.EmployeeId)
               .OnDelete(DeleteBehavior.Restrict);

            // Apply soft delete query filters
            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                var type = entityType.ClrType;
                if (typeof(ISoftDelete).IsAssignableFrom(type))
                {
                    var method = typeof(TenantDbContext)
                        .GetMethod(nameof(ApplySoftDeleteFilter), System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                        ?.MakeGenericMethod(type);
                    method?.Invoke(this, new object[] { modelBuilder });
                }
            }
        }

        private void ApplySoftDeleteFilter<T>(ModelBuilder modelBuilder) where T : class, ISoftDelete
        {
            modelBuilder.Entity<T>().HasQueryFilter(e => !e.IsDeleted);
        }

        private System.Collections.Generic.List<AuditLog> GenerateAuditLogs(string userId, Guid tenantId)
        {
            ChangeTracker.DetectChanges();
            var logs = new System.Collections.Generic.List<AuditLog>();

            foreach (var entry in ChangeTracker.Entries())
            {
                if (entry.Entity is AuditLog || entry.State == EntityState.Detached || entry.State == EntityState.Unchanged)
                    continue;

                var auditEntry = new AuditEntry(entry)
                {
                    TableName = entry.Entity.GetType().Name,
                    UserId = userId,
                    UserEmail = _currentUserContext.Email ?? "system@aquora.com",
                    TenantId = tenantId,
                    IpAddress = _currentUserContext.IpAddress ?? "127.0.0.1",
                    Device = _currentUserContext.UserAgent ?? "Unknown",
                    Reason = _currentUserContext.Reason ?? "System Operation",
                    Module = _currentUserContext.Module ?? "Default"
                };

                foreach (var property in entry.Properties)
                {
                    string propertyName = property.Metadata.Name;

                    if (propertyName.Equals("PasswordHash", StringComparison.OrdinalIgnoreCase) ||
                        propertyName.Equals("RefreshToken", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (property.Metadata.IsPrimaryKey())
                    {
                        auditEntry.KeyValues[propertyName] = property.CurrentValue!;
                        continue;
                    }

                    switch (entry.State)
                    {
                        case EntityState.Added:
                            auditEntry.AuditType = "Insert";
                            auditEntry.NewValues[propertyName] = property.CurrentValue!;
                            break;

                        case EntityState.Deleted:
                            auditEntry.AuditType = "Delete";
                            auditEntry.OldValues[propertyName] = property.OriginalValue!;
                            break;

                        case EntityState.Modified:
                            if (property.IsModified)
                            {
                                auditEntry.AuditType = "Update";
                                auditEntry.OldValues[propertyName] = property.OriginalValue!;
                                auditEntry.NewValues[propertyName] = property.CurrentValue!;
                            }
                            break;
                    }
                }

                logs.Add(auditEntry.ToAudit());
            }

            return logs;
        }

        private void GetAffectedLedgerAccounts(out HashSet<Guid> bankAccountIds, out HashSet<Guid> cashBookIds)
        {
            bankAccountIds = new HashSet<Guid>();
            cashBookIds = new HashSet<Guid>();

            foreach (var entry in ChangeTracker.Entries<Aquora.Domain.Entities.Finance.BankLedgerEntry>())
            {
                if (entry.State == EntityState.Added || entry.State == EntityState.Modified || entry.State == EntityState.Deleted)
                {
                    var bankAccountId = entry.State == EntityState.Deleted
                        ? (Guid?)entry.OriginalValues[nameof(Aquora.Domain.Entities.Finance.BankLedgerEntry.BankAccountId)]
                        : entry.Entity.BankAccountId;

                    var cashBookId = entry.State == EntityState.Deleted
                        ? (Guid?)entry.OriginalValues[nameof(Aquora.Domain.Entities.Finance.BankLedgerEntry.CashBookId)]
                        : entry.Entity.CashBookId;

                    if (bankAccountId.HasValue && bankAccountId.Value != Guid.Empty)
                    {
                        bankAccountIds.Add(bankAccountId.Value);
                    }
                    if (cashBookId.HasValue && cashBookId.Value != Guid.Empty)
                    {
                        cashBookIds.Add(cashBookId.Value);
                    }

                    if (entry.State == EntityState.Modified)
                    {
                        var originalBankAccountId = (Guid?)entry.OriginalValues[nameof(Aquora.Domain.Entities.Finance.BankLedgerEntry.BankAccountId)];
                        if (originalBankAccountId.HasValue && originalBankAccountId.Value != Guid.Empty && originalBankAccountId.Value != bankAccountId)
                        {
                            bankAccountIds.Add(originalBankAccountId.Value);
                        }

                        var originalCashBookId = (Guid?)entry.OriginalValues[nameof(Aquora.Domain.Entities.Finance.BankLedgerEntry.CashBookId)];
                        if (originalCashBookId.HasValue && originalCashBookId.Value != Guid.Empty && originalCashBookId.Value != cashBookId)
                        {
                            cashBookIds.Add(originalCashBookId.Value);
                        }
                    }
                }
            }
        }

        private void LogDatabaseContextState()
        {
            try
            {
                var tenantId = _tenantProvider.TenantId;
                var companyId = ChangeTracker.Entries()
                    .Where(e => e.Entity is ICompanySpecific)
                    .Select(e => ((ICompanySpecific)e.Entity).CompanyId)
                    .FirstOrDefault();

                var schemaName = SchemaName;
                var dbConnection = Database.GetDbConnection();
                var connectionString = dbConnection?.ConnectionString ?? "None";

                // Sanitize connection string to protect secrets in logs
                if (connectionString != "None")
                {
                    try
                    {
                        var builder = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);
                        if (!string.IsNullOrEmpty(builder.Password))
                        {
                            builder.Password = "********";
                        }
                        connectionString = builder.ToString();
                    }
                    catch
                    {
                        connectionString = "[Sanitized]";
                    }
                }

                var dbContextType = GetType().Name;
                string searchPath = schemaName;

                if (dbConnection != null && dbConnection.State == System.Data.ConnectionState.Open)
                {
                    try
                    {
                        using (var cmd = dbConnection.CreateCommand())
                        {
                            cmd.CommandText = "SHOW search_path;";
                            searchPath = cmd.ExecuteScalar()?.ToString() ?? schemaName;
                        }
                    }
                    catch
                    {
                        searchPath = schemaName;
                    }
                }

                Console.WriteLine($"[SCHEMA RESOLUTION]: TenantId={tenantId}, CompanyId={(companyId == Guid.Empty ? "Not Found" : companyId.ToString())}, ResolvedSchema={schemaName}, DbContext={dbContextType}, ConnectionString={connectionString}, SearchPath={searchPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SCHEMA RESOLUTION LOGGER ERROR]: {ex.Message}");
            }
        }

        private void LogDbUpdateException(DbUpdateException dbEx)
        {
            var innerMsg = dbEx.InnerException?.Message ?? dbEx.Message;
            Console.WriteLine($"==================================================");
            Console.WriteLine($"[CRITICAL DB UPDATE ERROR - SCHEMA: '{SchemaName}']: {dbEx.GetType().Name} | {dbEx.Message}");
            Console.WriteLine($"Inner Exception: {innerMsg}");

            if (dbEx.InnerException is Npgsql.PostgresException pgEx)
            {
                Console.WriteLine($"[NPGSQL ERROR DETAILS]: SqlState={pgEx.SqlState}, Detail={pgEx.Detail}, TableName={pgEx.TableName}, Constraint={pgEx.ConstraintName}");
            }

            if (dbEx.Entries != null && dbEx.Entries.Any())
            {
                foreach (var entry in dbEx.Entries)
                {
                    var tableName = entry.Metadata.GetTableName() ?? entry.Entity.GetType().Name;
                    var pkProp = entry.Metadata.FindPrimaryKey()?.Properties.FirstOrDefault();
                    var pkVal = pkProp != null ? entry.Property(pkProp.Name)?.CurrentValue : "Unknown";

                    Console.WriteLine($"[FAILED CONCURRENCY ENTITY]");
                    Console.WriteLine($"  - Table: {tableName}");
                    Console.WriteLine($"  - Type: {entry.Entity.GetType().FullName}");
                    Console.WriteLine($"  - Primary Key ({pkProp?.Name}): {pkVal}");
                    Console.WriteLine($"  - EntityState: {entry.State}");

                    foreach (var prop in entry.Properties)
                    {
                        if (prop.IsModified || entry.State == EntityState.Added || entry.State == EntityState.Deleted)
                        {
                            Console.WriteLine($"      Property: {prop.Metadata.Name} | IsModified: {prop.IsModified} | Orig: '{prop.OriginalValue}' | Curr: '{prop.CurrentValue}'");
                        }
                    }
                }
            }
            Console.WriteLine($"==================================================");
        }

        private void OnBeforeSaving(string   currentUserId, Guid currentTenantId)
        {
            foreach (var entry in ChangeTracker.Entries())
            {
                // ========================================================
                // MULTI-TENANT ENTITIES
                // ========================================================
                if (entry.State == EntityState.Added &&
                    entry.Entity is IMultiTenant multiTenantEntity)
                {
                    if (multiTenantEntity.TenantId == Guid.Empty)
                    {
                        multiTenantEntity.TenantId = currentTenantId;
                    }
                }

                // ========================================================
                // SOFT DELETE
                // ========================================================
                if (entry.State == EntityState.Deleted &&
                    entry.Entity is ISoftDelete softDeleteEntity)
                {
                    entry.State = EntityState.Modified;

                    softDeleteEntity.IsDeleted = true;
                    softDeleteEntity.DeletedAt =
                        _dateTimeProvider.UtcNow;
                    softDeleteEntity.DeletedBy =
                        currentUserId;
                }

                // ========================================================
                // AUDITING
                // ========================================================
                if (entry.Entity is IAuditable auditableEntity)
                {
                    if (entry.State == EntityState.Added)
                    {
                        if (auditableEntity.CreatedAt == default(DateTime))
                        {
                            auditableEntity.CreatedAt =
                                _dateTimeProvider.UtcNow;
                        }

                        if (string.IsNullOrWhiteSpace(auditableEntity.CreatedBy))
                        {
                            auditableEntity.CreatedBy =
                                currentUserId;
                        }

                        auditableEntity.CreatedByIP =
                            _currentUserContext.IpAddress
                            ?? "127.0.0.1";
                    }
                    else if (entry.State == EntityState.Modified)
                    {
                        // Never modify CreatedAt when updating.
                        entry.Property("CreatedAt").IsModified = false;

                        auditableEntity.UpdatedAt =
                            _dateTimeProvider.UtcNow;

                        auditableEntity.UpdatedBy =
                            currentUserId;

                        auditableEntity.UpdatedByIP =
                            _currentUserContext.IpAddress
                            ?? "127.0.0.1";
                    }
                }
            }
        }

        private void RecalculateBalances(HashSet<Guid> bankAccountIds, HashSet<Guid> cashBookIds)
        {
            if (_isRecalculating) return;

            try
            {
                _isRecalculating = true;
                var tenantId = _tenantProvider.TenantId;

                foreach (var bankAccountId in bankAccountIds)
                {
                    var bank = BankAccounts.FirstOrDefault(b => b.Id == bankAccountId && b.TenantId == tenantId);
                    if (bank == null) continue;

                    var entries = BankLedgerEntries
                        .Where(x => x.TenantId == tenantId && x.BankAccountId == bankAccountId)
                        .ToList();

                    var sortedEntries = entries
                        .OrderBy(x => x.CreatedAt)
                        .ThenBy(x => x.Id)
                        .ToList();

                    decimal runningBalance = bank.OpeningBalance;
                    foreach (var entry in sortedEntries)
                    {
                        if (entry.TransactionType == "Opening Balance")
                        {
                            entry.RunningBalance = bank.OpeningBalance;
                            continue;
                        }

                        runningBalance = runningBalance - entry.Debit + entry.Credit;
                        entry.RunningBalance = runningBalance;
                    }

                    bank.CurrentBalance = runningBalance;
                    bank.UpdatedAt = _dateTimeProvider.UtcNow;
                }

                foreach (var cashBookId in cashBookIds)
                {
                    var cashBook = CashBooks.FirstOrDefault(b => b.Id == cashBookId && b.TenantId == tenantId);
                    if (cashBook == null) continue;

                    var entries = BankLedgerEntries
                        .Where(x => x.TenantId == tenantId && x.CashBookId == cashBookId && x.LedgerAccountType == "CashBook")
                        .ToList();

                    var sortedEntries = entries
                        .OrderBy(x => x.CreatedAt)
                        .ThenBy(x => x.Id)
                        .ToList();

                    decimal runningBalance = cashBook.OpeningBalance;
                    foreach (var entry in sortedEntries)
                    {
                        if (entry.TransactionType == "Opening Balance")
                        {
                            entry.RunningBalance = cashBook.OpeningBalance;
                            continue;
                        }

                        runningBalance = runningBalance - entry.Debit + entry.Credit;
                        entry.RunningBalance = runningBalance;
                    }

                    cashBook.CurrentBalance = runningBalance;
                    cashBook.UpdatedAt = _dateTimeProvider.UtcNow;
                }

                base.SaveChanges();
            }
            finally
            {
                _isRecalculating = false;
            }
        }

        private async Task RecalculateBalancesAsync(HashSet<Guid> bankAccountIds, HashSet<Guid> cashBookIds, CancellationToken cancellationToken)
        {
            if (_isRecalculating) return;

            try
            {
                _isRecalculating = true;
                var tenantId = _tenantProvider.TenantId;

                foreach (var bankAccountId in bankAccountIds)
                {
                    var bank = await BankAccounts.FirstOrDefaultAsync(b => b.Id == bankAccountId && b.TenantId == tenantId, cancellationToken);
                    if (bank == null) continue;

                    var entries = await BankLedgerEntries
                        .Where(x => x.TenantId == tenantId && x.BankAccountId == bankAccountId)
                        .ToListAsync(cancellationToken);

                    var sortedEntries = entries
                        .OrderBy(x => x.CreatedAt)
                        .ThenBy(x => x.Id)
                        .ToList();

                    decimal runningBalance = bank.OpeningBalance;
                    foreach (var entry in sortedEntries)
                    {
                        if (entry.TransactionType == "Opening Balance")
                        {
                            entry.RunningBalance = bank.OpeningBalance;
                            continue;
                        }

                        runningBalance = runningBalance - entry.Debit + entry.Credit;
                        entry.RunningBalance = runningBalance;
                    }

                    bank.CurrentBalance = runningBalance;
                    bank.UpdatedAt = _dateTimeProvider.UtcNow;
                }

                foreach (var cashBookId in cashBookIds)
                {
                    var cashBook = await CashBooks.FirstOrDefaultAsync(b => b.Id == cashBookId && b.TenantId == tenantId, cancellationToken);
                    if (cashBook == null) continue;

                    var entries = await BankLedgerEntries
                        .Where(x => x.TenantId == tenantId && x.CashBookId == cashBookId && x.LedgerAccountType == "CashBook")
                        .ToListAsync(cancellationToken);

                    var sortedEntries = entries
                        .OrderBy(x => x.CreatedAt)
                        .ThenBy(x => x.Id)
                        .ToList();

                    decimal runningBalance = cashBook.OpeningBalance;
                    foreach (var entry in sortedEntries)
                    {
                        if (entry.TransactionType == "Opening Balance")
                        {
                            entry.RunningBalance = cashBook.OpeningBalance;
                            continue;
                        }

                        runningBalance = runningBalance - entry.Debit + entry.Credit;
                        entry.RunningBalance = runningBalance;
                    }

                    cashBook.CurrentBalance = runningBalance;
                    cashBook.UpdatedAt = _dateTimeProvider.UtcNow;
                }

                await base.SaveChangesAsync(cancellationToken);
            }
            finally
            {
                _isRecalculating = false;
            }
        }
    }
}
