using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Aquora.Application.DTOs.Integrations.Biodrops;

namespace Aquora.Application.Interfaces.Services
{
    /// <summary>
    /// Service boundary for Biodrops Production external integration.
    /// Provides strictly read-only access to eligible Biodrops tenants, 20L jar finished product stock,
    /// and raw material inventory balances.
    /// </summary>
    public interface IBiodropsIntegrationService
    {
        /// <summary>
        /// Retrieves all tenants where IsBiodropsProduction is enabled, active, and not deleted.
        /// </summary>
        Task<List<BiodropsTenantDto>> GetEligibleTenantsAsync(CancellationToken cancellationToken = default);

        /// <summary>
        /// Retrieves the Biodrops Production inventory for a specific tenant.
        /// Returns null if tenant is not found, inactive, or not enabled for Biodrops Production.
        /// </summary>
        Task<BiodropsInventoryDto?> GetTenantInventoryAsync(Guid tenantId, CancellationToken cancellationToken = default);

        /// <summary>
        /// Retrieves the stock summary for a specific tenant.
        /// Quantities with different units are never added together.
        /// </summary>
        Task<BiodropsStockSummaryDto?> GetTenantStockSummaryAsync(Guid tenantId, CancellationToken cancellationToken = default);
    }
}

