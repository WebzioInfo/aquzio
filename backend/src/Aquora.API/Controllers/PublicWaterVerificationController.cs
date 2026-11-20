using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Aquora.Application.Interfaces.Services;

namespace Aquora.API.Controllers
{
    [AllowAnonymous]
    [ApiController]
    [Route("api/public/water")]
    [Route("api/v1/public/water")]
    [Route("api/public/water-verification")]
    [Route("api/v1/public/water-verification")]
    [Route("api/public/biodrops")]
    [Route("api/v1/public/biodrops")]
    public class PublicWaterVerificationController : ControllerBase
    {
        private readonly IPublicWaterVerificationService _verificationService;

        public PublicWaterVerificationController(IPublicWaterVerificationService verificationService)
        {
            _verificationService = verificationService;
        }

        /// <summary>
        /// Public Batch Verification Endpoint.
        /// Anonymous read-only endpoint for external customer websites (e.g. Biodrops)
        /// to verify water batch testing parameters and manufacturer certification.
        /// </summary>
        /// <param name="batchNumber">Printed batch number (e.g., B-1234 or 1234)</param>
        /// <param name="cancellationToken">Cancellation token</param>
        /// <returns>Public batch verification response object</returns>
        [HttpGet("batches/{batchNumber}")]
        [HttpGet("{batchNumber}")]
        public async Task<IActionResult> VerifyBatch([FromRoute] string batchNumber, [FromQuery] bool full = false, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(batchNumber))
            {
                return BadRequest(new
                {
                    success = false,
                    verified = false,
                    code = "INVALID_BATCH_NUMBER",
                    message = "Batch number must be provided."
                });
            }

            var result = await _verificationService.VerifyBatchAsync(batchNumber, full, cancellationToken);

            if (!result.Success && result.Code == "BATCH_NOT_FOUND")
            {
                return NotFound(result);
            }

            return Ok(result);
        }
    }
}
