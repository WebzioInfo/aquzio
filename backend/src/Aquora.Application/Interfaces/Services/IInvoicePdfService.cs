using System.Threading.Tasks;
using Aquora.Domain.Entities;

namespace Aquora.Application.Interfaces.Services
{
    public interface IInvoicePdfService
    {
        Task<byte[]> GenerateInvoicePdfAsync(
            SalesTransaction transaction,
            Company company,
            Tenant? tenant = null,
            Customer? customer = null);
    }
}
