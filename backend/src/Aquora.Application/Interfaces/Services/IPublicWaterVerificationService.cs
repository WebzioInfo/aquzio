using System.Threading;
using System.Threading.Tasks;
using Aquora.Application.DTOs.Public;

namespace Aquora.Application.Interfaces.Services
{
    public interface IPublicWaterVerificationService
    {
        Task<PublicBatchVerificationResponseDto> VerifyBatchAsync(string batchNumber, bool full = false, CancellationToken cancellationToken = default);
    }
}
