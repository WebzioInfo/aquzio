using System;
using System.Collections.Generic;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Logging;
using Aquora.API.Authorization;
using Aquora.Application.DTOs.Integrations.Biodrops;
using Aquora.Application.Interfaces.Services;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    /// <summary>
    /// Dedicated external integration API for authorized Biodrops Production applications.
    /// Provides secure, read-only access to eligible tenants, 20L finished product inventory,
    /// and raw material balances.
    /// </summary>
    [AllowAnonymous] // Handled by dedicated BiodropsApiKeyAuthFilter, not user JWTs
    [ApiController]
    [Route("api/v1/integrations/biodrops")]
    [Produces("application/json")]
    [BiodropsApiKeyAuth]
    [EnableRateLimiting("BiodropsIntegrationPolicy")]
    public class BiodropsIntegrationController : ApiControllerBase
    {
        private readonly IBiodropsIntegrationService _biodropsService;
        private readonly ILogger<BiodropsIntegrationController> _logger;

        public BiodropsIntegrationController(
            IBiodropsIntegrationService biodropsService,
            ILogger<BiodropsIntegrationController> logger)
        {
            _biodropsService = biodropsService;
            _logger = logger;
        }

        /// <summary>
        /// Retrieves all tenants that have the Biodrops Production feature toggle enabled.
        /// </summary>
        /// <remarks>
        /// Dedicated integration endpoint. Only active tenants with IsBiodropsProduction == true are returned.
        /// Disabled or deleted tenants are never exposed.
        /// Authentication requires header: X-API-Key: &lt;integration-key&gt;
        /// </remarks>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <response code="200">List of eligible Biodrops Production tenants returned successfully.</response>
        /// <response code="401">Unauthorized: Missing or invalid integration API key.</response>
        /// <response code="403">Forbidden: The provided integration credential has been revoked.</response>
        [HttpGet("tenants")]
        [ProducesResponseType(typeof(ApiResponse<List<BiodropsTenantDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
        public async Task<ActionResult<ApiResponse<List<BiodropsTenantDto>>>> GetEligibleTenants(CancellationToken cancellationToken)
        {
            var tenants = await _biodropsService.GetEligibleTenantsAsync(cancellationToken);
            return Success(tenants, "Eligible Biodrops Production tenants retrieved successfully.");
        }

        /// <summary>
        /// Retrieves the Biodrops Production inventory for the specified tenant.
        /// </summary>
        /// <remarks>
        /// Returns 20L Jar finished products and raw materials with real-time stock balances,
        /// usage tracking, and wastage metrics.
        /// Strictly validates tenant existence and verifies that Biodrops Production is enabled.
        /// Returns 404 Not Found if the tenant does not exist or has Biodrops Production disabled.
        /// </remarks>
        /// <param name="tenantId">The unique ID of the tenant.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <response code="200">Tenant Biodrops Production inventory retrieved successfully.</response>
        /// <response code="401">Unauthorized: Missing or invalid integration API key.</response>
        /// <response code="403">Forbidden: The provided integration credential has been revoked.</response>
        /// <response code="404">Not Found: Tenant not found or Biodrops Production is not enabled.</response>
        [HttpGet("tenants/{tenantId:guid}/inventory")]
        [ProducesResponseType(typeof(ApiResponse<BiodropsInventoryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<ApiResponse<BiodropsInventoryDto>>> GetTenantInventory(
            Guid tenantId,
            CancellationToken cancellationToken)
        {
            if (tenantId == Guid.Empty)
            {
                return Failure<BiodropsInventoryDto>("A valid non-empty tenant ID must be provided.", "A valid non-empty tenant ID must be provided.", HttpStatusCode.BadRequest);
            }

            var inventory = await _biodropsService.GetTenantInventoryAsync(tenantId, cancellationToken);
            if (inventory == null)
            {
                return Failure<BiodropsInventoryDto>(
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    HttpStatusCode.NotFound);
            }

            return Success(inventory, "Tenant Biodrops Production inventory retrieved successfully.");
        }

        /// <summary>
        /// Retrieves the high-level stock summary for the specified tenant.
        /// </summary>
        /// <remarks>
        /// Returns total 20L finished product stock and raw material balances grouped strictly by unit of measure.
        /// Quantities with different units are never summed together.
        /// </remarks>
        /// <param name="tenantId">The unique ID of the tenant.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <response code="200">Tenant Biodrops Production stock summary retrieved successfully.</response>
        /// <response code="401">Unauthorized: Missing or invalid integration API key.</response>
        /// <response code="403">Forbidden: The provided integration credential has been revoked.</response>
        /// <response code="404">Not Found: Tenant not found or Biodrops Production is not enabled.</response>
        [HttpGet("tenants/{tenantId:guid}/stock-summary")]
        [ProducesResponseType(typeof(ApiResponse<BiodropsStockSummaryDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<ApiResponse<BiodropsStockSummaryDto>>> GetTenantStockSummary(
            Guid tenantId,
            CancellationToken cancellationToken)
        {
            if (tenantId == Guid.Empty)
            {
                return Failure<BiodropsStockSummaryDto>("A valid non-empty tenant ID must be provided.", "A valid non-empty tenant ID must be provided.", HttpStatusCode.BadRequest);
            }

            var summary = await _biodropsService.GetTenantStockSummaryAsync(tenantId, cancellationToken);
            if (summary == null)
            {
                return Failure<BiodropsStockSummaryDto>(
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    HttpStatusCode.NotFound);
            }

            return Success(summary, "Tenant Biodrops Production stock summary retrieved successfully.");
        }

        /// <summary>
        /// Retrieves Biodrops Production sales transactions for the specified tenant.
        /// </summary>
        /// <remarks>
        /// Returns 20L Jar finished product sales orders and dispatches.
        /// Strictly validates tenant existence and verifies that Biodrops Production is enabled.
        /// Returns 404 Not Found if the tenant does not exist or has Biodrops Production disabled.
        /// </remarks>
        /// <param name="tenantId">The unique ID of the tenant.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        [HttpGet("tenants/{tenantId:guid}/sales")]
        [ProducesResponseType(typeof(ApiResponse<List<BiodropsSaleDto>>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<ApiResponse<List<BiodropsSaleDto>>>> GetTenantSales(
            Guid tenantId,
            CancellationToken cancellationToken)
        {
            if (tenantId == Guid.Empty)
            {
                return Failure<List<BiodropsSaleDto>>("A valid non-empty tenant ID must be provided.", "A valid non-empty tenant ID must be provided.", HttpStatusCode.BadRequest);
            }

            var sales = await _biodropsService.GetTenantSalesAsync(tenantId, cancellationToken);
            if (sales == null)
            {
                return Failure<List<BiodropsSaleDto>>(
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    "Tenant not found or Biodrops Production is not enabled for this tenant.",
                    HttpStatusCode.NotFound);
            }

            return Success(sales, "Tenant Biodrops Production sales retrieved successfully.");
        }

        /// <summary>
        /// Adjusts inventory stock for the specified tenant, recording authoritative balance changes
        /// and inserting an immutable stock movement record.
        /// </summary>
        /// <remarks>
        /// Authenticates via server-to-server X-API-Key header.
        /// Validates tenant existence, active status, and Biodrops toggle.
        /// Authoritatively calculates the new balance in PostgreSQL and creates an immutable movement history entry.
        /// Supports persistent idempotency via Idempotency-Key header.
        /// </remarks>
        /// <param name="tenantId">The unique ID of the tenant.</param>
        /// <param name="request">Stock adjustment parameters.</param>
        /// <param name="idempotencyKey">Optional unique idempotency token for network retry protection.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        [HttpPost("tenants/{tenantId:guid}/stock/adjust")]
        [ProducesResponseType(typeof(ApiResponse<BiodropsStockAdjustmentResultDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
        [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
        public async Task<ActionResult<ApiResponse<BiodropsStockAdjustmentResultDto>>> AdjustStock(
            Guid tenantId,
            [FromBody] BiodropsStockAdjustmentRequestDto request,
            [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
            CancellationToken cancellationToken)
        {
            if (tenantId == Guid.Empty)
            {
                return Failure<BiodropsStockAdjustmentResultDto>("A valid non-empty tenant ID must be provided in URL.", "INVALID_TENANT_ID", HttpStatusCode.BadRequest);
            }

            if (request == null)
            {
                return Failure<BiodropsStockAdjustmentResultDto>("Adjustment request payload is required.", "EMPTY_REQUEST_PAYLOAD", HttpStatusCode.BadRequest);
            }

            if (tenantId != request.TenantId)
            {
                return Failure<BiodropsStockAdjustmentResultDto>(
                    $"Tenant ID mismatch: URL tenant ID '{tenantId}' does not match body tenant ID '{request.TenantId}'.",
                    "TENANT_ID_MISMATCH",
                    HttpStatusCode.BadRequest);
            }

            try
            {
                var result = await _biodropsService.AdjustTenantStockAsync(tenantId, request, idempotencyKey, cancellationToken);
                return Success(result, "Stock adjustment completed successfully.");
            }
            catch (ArgumentException ex)
            {
                return Failure<BiodropsStockAdjustmentResultDto>(ex.Message, "VALIDATION_FAILED", HttpStatusCode.BadRequest);
            }
            catch (KeyNotFoundException ex)
            {
                return Failure<BiodropsStockAdjustmentResultDto>(ex.Message, "ITEM_OR_TENANT_NOT_FOUND", HttpStatusCode.NotFound);
            }
            catch (UnauthorizedAccessException ex)
            {
                return Failure<BiodropsStockAdjustmentResultDto>(ex.Message, "TENANT_INTEGRATION_DISABLED", HttpStatusCode.Forbidden);
            }
            catch (InvalidOperationException ex)
            {
                if (ex.Message.Contains("Idempotency key", StringComparison.OrdinalIgnoreCase))
                {
                    return Failure<BiodropsStockAdjustmentResultDto>(ex.Message, "IDEMPOTENCY_CONFLICT", HttpStatusCode.Conflict);
                }
                return Failure<BiodropsStockAdjustmentResultDto>(ex.Message, "STOCK_RULE_VIOLATION", HttpStatusCode.BadRequest);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[BIODROPS INTEGRATION] Unexpected error while adjusting stock for tenant {TenantId}: {Message}", tenantId, ex.Message);
                return Failure<BiodropsStockAdjustmentResultDto>("An unexpected error occurred while executing the stock adjustment.", "INTERNAL_SERVER_ERROR", HttpStatusCode.InternalServerError);
            }
        }
    }
}
