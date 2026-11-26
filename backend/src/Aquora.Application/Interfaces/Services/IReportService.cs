using System.Threading.Tasks;
using Aquora.Application.DTOs.Reports;

namespace Aquora.Application.Interfaces.Services
{
    public interface IReportService
    {
        Task<BusinessReportDto> GenerateBusinessReportAsync(ReportFilterRequest request);
        Task<ProfitAndLossReportDto> GenerateProfitAndLossAsync(ReportFilterRequest request);
    }
}
