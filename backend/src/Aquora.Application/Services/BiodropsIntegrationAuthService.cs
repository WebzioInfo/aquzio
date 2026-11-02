using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Aquora.Application.Interfaces.Services;

namespace Aquora.Application.Services
{
    public class BiodropsIntegrationAuthService : IBiodropsIntegrationAuthService
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<BiodropsIntegrationAuthService> _logger;

        // In-memory revocation tracking: Key/Fingerprint -> Reason
        private static readonly ConcurrentDictionary<string, string> _revokedKeys = new(StringComparer.OrdinalIgnoreCase);

        // Fallback default key for local development and test environments if no env var is set
        public const string DefaultDevelopmentApiKey = "biodrops_live_secret_key_2026";

        public BiodropsIntegrationAuthService(
            IConfiguration configuration,
            ILogger<BiodropsIntegrationAuthService> logger)
        {
            _configuration = configuration;
            _logger = logger;

            LoadConfiguredRevocations();
        }

        private void LoadConfiguredRevocations()
        {
            var revokedConfig = _configuration["BIODROPS_REVOKED_API_KEYS"] 
                ?? _configuration["Integration:Biodrops:RevokedKeys"];

            if (!string.IsNullOrWhiteSpace(revokedConfig))
            {
                var keys = revokedConfig.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var k in keys)
                {
                    var cleanKey = k.Trim();
                    _revokedKeys.TryAdd(cleanKey, "Revoked via configuration");
                    _revokedKeys.TryAdd(ComputeSha256Fingerprint(cleanKey), "Revoked via configuration");
                }
            }
        }

        public BiodropsAuthResult Authenticate(string? apiKey, string? clientIp = null, string? requestPath = null)
        {
            var ip = string.IsNullOrWhiteSpace(clientIp) ? "Unknown" : clientIp;
            var path = string.IsNullOrWhiteSpace(requestPath) ? "/" : requestPath;

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication failed: Missing API key. Client IP: {IpAddress}, Path: {Path}", ip, path);
                return BiodropsAuthResult.Failure("API key is missing. Provide X-API-Key header or Authorization: Bearer <key>.");
            }

            var cleanKey = apiKey.Trim();

            // 1. Check for credential revocation
            if (IsApiKeyRevoked(cleanKey))
            {
                var reason = _revokedKeys.TryGetValue(cleanKey, out var r) ? r : "API key has been revoked";
                _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication rejected: Revoked API key used from IP: {IpAddress}, Path: {Path}. Reason: {Reason}", ip, path, reason);
                return BiodropsAuthResult.Revoked("The provided API key has been revoked.");
            }

            // 2. Resolve configured valid keys
            var validKeys = GetConfiguredValidKeys();

            // 3. Validate against configured keys using constant-time comparison
            var providedBytes = Encoding.UTF8.GetBytes(cleanKey);

            foreach (var kvp in validKeys)
            {
                var expectedBytes = Encoding.UTF8.GetBytes(kvp.Value);

                if (providedBytes.Length == expectedBytes.Length &&
                    CryptographicOperations.FixedTimeEquals(providedBytes, expectedBytes))
                {
                    _logger.LogInformation("[INTEGRATION AUDIT] External integration client '{ClientName}' successfully authenticated. IP: {IpAddress}, Path: {Path}", kvp.Key, ip, path);
                    return BiodropsAuthResult.Success(kvp.Key);
                }
            }

            _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication failed: Invalid API key attempt from IP: {IpAddress}, Path: {Path}", ip, path);
            return BiodropsAuthResult.Failure("Invalid API key.");
        }

        public void RevokeApiKey(string apiKeyOrKeyId, string reason)
        {
            if (string.IsNullOrWhiteSpace(apiKeyOrKeyId)) return;

            var clean = apiKeyOrKeyId.Trim();
            _revokedKeys.TryAdd(clean, reason);
            _revokedKeys.TryAdd(ComputeSha256Fingerprint(clean), reason);

            var fp = ComputeSha256Fingerprint(clean);
            var prefix = fp.Length >= 10 ? fp.Substring(0, 10) : fp;
            _logger.LogWarning("[INTEGRATION SECURITY AUDIT] API key '{Fingerprint}...' revoked. Reason: {Reason}", prefix, reason);
        }

        public bool IsApiKeyRevoked(string apiKeyOrKeyId)
        {
            if (string.IsNullOrWhiteSpace(apiKeyOrKeyId)) return false;

            var clean = apiKeyOrKeyId.Trim();
            if (_revokedKeys.ContainsKey(clean)) return true;

            var fingerprint = ComputeSha256Fingerprint(clean);
            return _revokedKeys.ContainsKey(fingerprint);
        }

        private Dictionary<string, string> GetConfiguredValidKeys()
        {
            var keys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            // Primary environment / config key
            var primaryKey = _configuration["BIODROPS_INTEGRATION_API_KEY"] 
                ?? _configuration["Integration:Biodrops:ApiKey"];

            if (!string.IsNullOrWhiteSpace(primaryKey))
            {
                keys["BiodropsProductionApp"] = primaryKey.Trim();
            }

            // Multi-client keys in configuration section Integration:Biodrops:ApiKeys
            var multiKeysSection = _configuration.GetSection("Integration:Biodrops:ApiKeys");
            if (multiKeysSection.Exists())
            {
                foreach (var child in multiKeysSection.GetChildren())
                {
                    if (!string.IsNullOrWhiteSpace(child.Value))
                    {
                        keys[child.Key] = child.Value.Trim();
                    }
                }
            }

            // If no key is configured anywhere, provide development fallback
            if (keys.Count == 0)
            {
                keys["BiodropsDevClient"] = DefaultDevelopmentApiKey;
            }

            return keys;
        }

        private static string ComputeSha256Fingerprint(string input)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
