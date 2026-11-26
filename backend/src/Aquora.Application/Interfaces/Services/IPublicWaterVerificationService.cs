using System;
using System.Threading;
using System.Threading.Tasks;
using Aquora.Application.DTOs.Public;

namespace Aquora.Application.Interfaces.Services
{
    public interface IPublicWaterVerificationService
    {
        Task<PublicBatchVerificationResponseDto> VerifyBatchAsync(string batchNumber, bool full = false, CancellationToken cancellationToken = default);

        Task<PublicBatchVerificationResponseDto> VerifyBatchAsync(
            string batchNumber,
            bool full,
            string? reportType,
            Guid? tenantId,
            string? tenantCode,
            CancellationToken cancellationToken = default);
    }
}
