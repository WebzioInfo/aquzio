using Microsoft.Extensions.DependencyInjection;
using FluentValidation;
using System.Reflection;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.Services;

namespace Aquora.Application
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddApplication(this IServiceCollection services)
        {
            // Register all FluentValidation validators from this assembly
            services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

            // Register services
            services.AddScoped<IAuthService, AuthService>();
            services.AddScoped<ITenantService, TenantService>();
            services.AddScoped<ICompanyOnboardingService, CompanyOnboardingService>();
            services.AddScoped<IHierarchyService, HierarchyService>();
            services.AddScoped<ISchemaNameGenerator, SchemaNameGenerator>();
            services.AddScoped<IInventoryMovementService, InventoryMovementService>();
            services.AddScoped<ITwentyLLedgerPostingService, TwentyLLedgerPostingService>();
            services.AddScoped<IPriceListService, PriceListService>();
            services.AddScoped<IDiscountGroupService, DiscountGroupService>();

            services.AddScoped<IProductionService, ProductionService>();
            services.AddScoped<IFinanceService, FinanceService>();
            services.AddScoped<IBusinessFinanceService, BusinessFinanceService>();
            services.AddScoped<IStationConfigurationService, StationConfigurationService>();
            services.AddScoped<ISimpleAccountsService, SimpleAccountsService>();
            services.AddScoped<IVendorService, VendorService>();
            services.AddScoped<IPurchaseService, PurchaseService>();
            services.AddScoped<IAssetManagementService, AssetManagementService>();
            services.AddScoped<ILedgerService, BankLedgerService>();
            services.AddScoped<IBankLedgerService>(sp => sp.GetRequiredService<ILedgerService>());
            services.AddScoped<IHealthService, HealthService>();
            services.AddScoped<IQualityEvaluationService, QualityEvaluationService>();
            services.AddScoped<IQCPdfCertificateService, QCPdfCertificateService>();
            services.AddScoped<IWaterTestService, WaterTestService>();
            services.AddScoped<IPublicWaterVerificationService, PublicWaterVerificationService>();
            services.AddScoped<IOperationsIssueService, OperationsIssueService>();
            services.AddScoped<IBackupService, BackupService>();
            services.AddScoped<IExportService, ExportService>();
            services.AddSingleton<IPlatformBackupJobManager, PlatformBackupJobManager>();
            services.AddScoped<IPlatformBackupEngine, PlatformBackupEngine>();
            services.AddScoped<IPlatformBackupService, PlatformBackupService>();

            services.AddScoped<IGlobalSearchService, GlobalSearchService>();

            services.AddScoped<IReportService, ReportService>();
            services.AddScoped<IUserProfileService, UserProfileService>();
            // Dedicated Biodrops Production External Integration Services
            services.AddSingleton<IBiodropsIntegrationAuthService, BiodropsIntegrationAuthService>();
            services.AddScoped<IBiodropsIntegrationService, BiodropsIntegrationService>();


            return services;
        }
    }
}
