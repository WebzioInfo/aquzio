namespace Aquora.Application.Interfaces.Services
{
    public class BiodropsAuthResult
    {
        public bool IsAuthorized { get; set; }
        public bool IsRevoked { get; set; }
        public string? ClientName { get; set; }
        public string? ErrorMessage { get; set; }

        public static BiodropsAuthResult Success(string clientName) =>
            new() { IsAuthorized = true, ClientName = clientName };

        public static BiodropsAuthResult Failure(string message) =>
            new() { IsAuthorized = false, ErrorMessage = message };

        public static BiodropsAuthResult Revoked(string message) =>
            new() { IsAuthorized = false, IsRevoked = true, ErrorMessage = message };
    }

    /// <summary>
    /// Dedicated external integration authentication service for Biodrops Production clients.
    /// Handles API key extraction, constant-time validation, revocation tracking, and security auditing.
    /// </summary>
    public interface IBiodropsIntegrationAuthService
    {
        bool IsConfigured { get; }
        BiodropsAuthResult Authenticate(string? apiKey, string? clientIp = null, string? requestPath = null);
        void RevokeApiKey(string apiKeyOrKeyId, string reason);
        bool IsApiKeyRevoked(string apiKeyOrKeyId);
    }
}
