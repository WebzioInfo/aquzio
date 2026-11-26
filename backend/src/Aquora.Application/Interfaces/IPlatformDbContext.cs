using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using System.Threading;
using System.Threading.Tasks;
using Aquora.Domain.Entities;

namespace Aquora.Application.Interfaces
{
    public interface IPlatformDbContext
    {
        DbSet<Tenant> Tenants { get; }
        DbSet<CompanyPublicProfile> CompanyPublicProfiles { get; }
        DbSet<CompanyGalleryImage> CompanyGalleryImages { get; }
        DbSet<User> Users { get; }
        DbSet<TenantDomain> TenantDomains { get; }
        DbSet<OTPVerification> OTPVerifications { get; }
        DbSet<PlatformAuditLog> PlatformAuditLogs { get; }
        DbSet<UserMembership> UserMemberships { get; }
        DbSet<TenantInvitation> TenantInvitations { get; }
        DbSet<TenantProductionConfiguration> TenantProductionConfigurations { get; }
        DbSet<SubscriptionPlan> SubscriptionPlans { get; }
        DbSet<SubscriptionFeature> SubscriptionFeatures { get; }
        DbSet<SubscriptionPlanLimits> SubscriptionPlanLimits { get; }
        DbSet<TenantSubscription> TenantSubscriptions { get; }
        DbSet<SubscriptionAuditLog> SubscriptionAuditLogs { get; }
        DbSet<Aquora.Domain.Entities.Administration.BackupHistory> BackupHistories { get; }
        DbSet<Aquora.Domain.Entities.Administration.RestoreHistory> RestoreHistories { get; }

        DatabaseFacade Database { get; }

        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
