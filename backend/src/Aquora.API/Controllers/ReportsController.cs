using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Aquora.Application.DTOs.Reports;
using Aquora.Application.Interfaces.Services;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/v1/[controller]")]
    public class ReportsController : ApiControllerBase
    {
        private readonly IReportService _reportService;

        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<BusinessReportDto>>> GetReport(
            [FromQuery] DateTime? dateFrom = null,
            [FromQuery] DateTime? dateTo = null,
            [FromQuery] string? preset = "30days",
            [FromQuery] int tzOffset = -330,
            [FromQuery] Guid? productId = null,
            [FromQuery] Guid? customerId = null,
            [FromQuery] Guid? productionLineId = null,
            [FromQuery] string? status = null)
        {
            try
            {
                var request = new ReportFilterRequest
                {
                    DateFrom = dateFrom,
                    DateTo = dateTo,
                    Preset = preset,
                    TzOffset = tzOffset,
                    ProductId = productId,
                    CustomerId = customerId,
                    ProductionLineId = productionLineId,
                    Status = status
                };

                var report = await _reportService.GenerateBusinessReportAsync(request);
                return Success(report, "Business report generated successfully.");
            }
            catch (UnauthorizedAccessException uex)
            {
                return Failure<BusinessReportDto>(uex.Message, "Unauthorized", System.Net.HttpStatusCode.Unauthorized);
            }
            catch (Exception ex)
            {
                return Failure<BusinessReportDto>(ex.Message, "Failed to generate business report.", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPost("generate")]
        public async Task<ActionResult<ApiResponse<BusinessReportDto>>> GenerateReport([FromBody] ReportFilterRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(ApiResponse<BusinessReportDto>.CreateFailure("Request payload cannot be empty.", "Invalid Request", HttpContext.TraceIdentifier));
                }

                var report = await _reportService.GenerateBusinessReportAsync(request);
                return Success(report, "Business report generated successfully.");
            }
            catch (UnauthorizedAccessException uex)
            {
                return Failure<BusinessReportDto>(uex.Message, "Unauthorized", System.Net.HttpStatusCode.Unauthorized);
            }
            catch (Exception ex)
            {
                return Failure<BusinessReportDto>(ex.Message, "Failed to generate business report.", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpGet("profit-and-loss")]
        public async Task<ActionResult<ApiResponse<ProfitAndLossReportDto>>> GetProfitAndLoss(
            [FromQuery] DateTime? dateFrom = null,
            [FromQuery] DateTime? dateTo = null,
            [FromQuery] string? preset = "30days",
            [FromQuery] int tzOffset = -330,
            [FromQuery] Guid? productId = null,
            [FromQuery] Guid? customerId = null)
        {
            try
            {
                var request = new ReportFilterRequest
                {
                    DateFrom = dateFrom,
                    DateTo = dateTo,
                    Preset = preset,
                    TzOffset = tzOffset,
                    ProductId = productId,
                    CustomerId = customerId
                };

                var report = await _reportService.GenerateProfitAndLossAsync(request);
                return Success(report, "Profit & Loss report generated successfully.");
            }
            catch (UnauthorizedAccessException uex)
            {
                return Failure<ProfitAndLossReportDto>(uex.Message, "Unauthorized", System.Net.HttpStatusCode.Unauthorized);
            }
            catch (Exception ex)
            {
                return Failure<ProfitAndLossReportDto>(ex.Message, "Failed to generate Profit & Loss report.", System.Net.HttpStatusCode.InternalServerError);
            }
        }

        [HttpPost("profit-and-loss")]
        public async Task<ActionResult<ApiResponse<ProfitAndLossReportDto>>> GenerateProfitAndLoss([FromBody] ReportFilterRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(ApiResponse<ProfitAndLossReportDto>.CreateFailure("Request payload cannot be empty.", "Invalid Request", HttpContext.TraceIdentifier));
                }

                var report = await _reportService.GenerateProfitAndLossAsync(request);
                return Success(report, "Profit & Loss report generated successfully.");
            }
            catch (UnauthorizedAccessException uex)
            {
                return Failure<ProfitAndLossReportDto>(uex.Message, "Unauthorized", System.Net.HttpStatusCode.Unauthorized);
            }
            catch (Exception ex)
            {
                return Failure<ProfitAndLossReportDto>(ex.Message, "Failed to generate Profit & Loss report.", System.Net.HttpStatusCode.InternalServerError);
            }
        }
    }
}
