using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.Interfaces;
using Aquora.Domain.Common;
using Aquora.Domain.Entities;

namespace Aquora.Persistence.Context
{
    public class PlatformDbContext : DbContext, IPlatformDbContext
    {
        private readonly ICurrentUserContext? _currentUserContext;
        private readonly IDateTimeProvider _dateTimeProvider;

        public PlatformDbContext(
            DbContextOptions<PlatformDbContext> options,
            ICurrentUserContext? currentUserContext = null,
            IDateTimeProvider? dateTimeProvider = null) : base(options)
        {
            _currentUserContext = currentUserContext;
            _dateTimeProvider = dateTimeProvider ?? new DefaultDateTimeProvider();
        }

        public DbSet<Tenant> Tenants => Set<Tenant>();
        public DbSet<User> Users => Set<User>();
        public DbSet<TenantDomain> TenantDomains => Set<TenantDomain>();
        public DbSet<OTPVerification> OTPVerifications => Set<OTPVerification>();
        public DbSet<PlatformAuditLog> PlatformAuditLogs => Set<PlatformAuditLog>();
        public DbSet<UserMembership> UserMemberships => Set<UserMembership>();
        public DbSet<TenantInvitation> TenantInvitations => Set<TenantInvitation>();
        public DbSet<TenantProductionConfiguration> TenantProductionConfigurations => Set<TenantProductionConfiguration>();
        public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
        public DbSet<SubscriptionFeature> SubscriptionFeatures => Set<SubscriptionFeature>();
        public DbSet<SubscriptionPlanLimits> SubscriptionPlanLimits => Set<SubscriptionPlanLimits>();
        public DbSet<TenantSubscription> TenantSubscriptions => Set<TenantSubscription>();
        public DbSet<SubscriptionAuditLog> SubscriptionAuditLogs => Set<SubscriptionAuditLog>();
        public DbSet<Aquora.Domain.Entities.Administration.BackupHistory> BackupHistories => Set<Aquora.Domain.Entities.Administration.BackupHistory>();
        public DbSet<Aquora.Domain.Entities.Administration.RestoreHistory> RestoreHistories => Set<Aquora.Domain.Entities.Administration.RestoreHistory>();

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            base.OnConfiguring(optionsBuilder);
            optionsBuilder.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure platform tables to reside in the "public" schema
            modelBuilder.HasDefaultSchema("public");

            modelBuilder.Entity<Tenant>()
                .HasIndex(t => t.Code)
                .IsUnique();

            modelBuilder.Entity<Tenant>()
                .HasIndex(t => t.SchemaName)
                .IsUnique();

            modelBuilder.Entity<Tenant>()
                .Property(t => t.BadgeLetters)
                .HasMaxLength(4);

            modelBuilder.Entity<Tenant>()
                .HasIndex(t => t.Subdomain)
                .IsUnique();

            modelBuilder.Entity<Tenant>()
                .Property(t => t.IsBiodropsProduction)
                .HasDefaultValue(false);

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasIndex(u => new { u.Username, u.TenantId })
                .IsUnique();

            modelBuilder.Entity<TenantDomain>()
                .HasIndex(td => td.Domain)
                .IsUnique();

            modelBuilder.Entity<OTPVerification>()
                .HasIndex(ov => ov.Email);

            modelBuilder.Entity<UserMembership>()
                .HasIndex(um => new { um.PlatformUserId, um.TenantId })
                .IsUnique();

            modelBuilder.Entity<TenantInvitation>()
                .HasIndex(ti => ti.Token)
                .IsUnique();

            modelBuilder.Entity<TenantInvitation>()
                .HasIndex(ti => new { ti.TenantId, ti.Email, ti.Status });

            modelBuilder.Entity<TenantProductionConfiguration>()
                .HasIndex(tc => new { tc.TenantId, tc.StationName })
                .IsUnique();

            modelBuilder.Entity<SubscriptionPlan>()
                .HasIndex(sp => sp.Code)
                .IsUnique();

            modelBuilder.Entity<SubscriptionPlan>()
                .HasOne(sp => sp.Limits)
                .WithOne(spl => spl.Plan)
                .HasForeignKey<SubscriptionPlanLimits>(spl => spl.PlanId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SubscriptionFeature>()
                .HasOne(sf => sf.Plan)
                .WithMany(sp => sp.Features)
                .HasForeignKey(sf => sf.PlanId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Aquora.Domain.Entities.Administration.BackupHistory>()
                .ToTable("BackupHistories", "public");

            modelBuilder.Entity<Aquora.Domain.Entities.Administration.RestoreHistory>()
                .ToTable("RestoreHistories", "public");
        }

        public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            var currentUserId = _currentUserContext?.UserId ?? "System";
            var currentIp = _currentUserContext?.IpAddress ?? "127.0.0.1";

            foreach (var entry in ChangeTracker.Entries())
            {
                if (entry.State == EntityState.Added || entry.State == EntityState.Modified)
                {
                    foreach (var property in entry.Properties)
                    {
                        if (property.Metadata.ClrType == typeof(DateTime) || property.Metadata.ClrType == typeof(DateTime?))
                        {
                            if (property.CurrentValue is DateTime dt)
                            {
                                if (dt.Kind == DateTimeKind.Unspecified)
                                {
                                    property.CurrentValue = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                                }
                                else if (dt.Kind == DateTimeKind.Local)
                                {
                                    property.CurrentValue = dt.ToUniversalTime();
                                }
                            }
                        }
                    }
                }

                if (entry.Entity is IAuditable auditableEntity)
                {
                    if (entry.State == EntityState.Added)
                    {
                        auditableEntity.CreatedAt = _dateTimeProvider.UtcNow;
                        auditableEntity.CreatedBy = currentUserId;
                        auditableEntity.CreatedByIP = currentIp;
                    }
                    else if (entry.State == EntityState.Modified)
                    {
                        auditableEntity.UpdatedAt = _dateTimeProvider.UtcNow;
                        auditableEntity.UpdatedBy = currentUserId;
                        auditableEntity.UpdatedByIP = currentIp;
                    }
                }
            }
            return await base.SaveChangesAsync(cancellationToken);
        }
    }
}
