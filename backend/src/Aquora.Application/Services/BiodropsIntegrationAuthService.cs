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

        // In-memory revocation tracking: Key/FingerprintHex -> (HashBytes, Reason)
        private static readonly ConcurrentDictionary<string, (byte[] HashBytes, string Reason)> _revokedFingerprints = new(StringComparer.OrdinalIgnoreCase);

        public BiodropsIntegrationAuthService(
            IConfiguration configuration,
            ILogger<BiodropsIntegrationAuthService> logger)
        {
            _configuration = configuration;
            _logger = logger;

            // Automatically blacklist the compromised legacy key fingerprint
            BlacklistCompromisedLegacyKey();
            LoadConfiguredRevocations();
        }

        public bool IsConfigured
        {
            get
            {
                var keys = GetConfiguredValidKeys();
                return keys.Count > 0;
            }
        }

        private void BlacklistCompromisedLegacyKey()
        {
            var legacyHashHex = BiodropsConfigurationValidator.RevokedLegacyKeySha256;
            var legacyHashBytes = Convert.FromHexString(legacyHashHex);
            _revokedFingerprints.TryAdd(legacyHashHex, (legacyHashBytes, "Legacy exposed key fingerprint permanently revoked and blacklisted."));
        }

        private void LoadConfiguredRevocations()
        {
            var revokedConfig = _configuration["Integration:Biodrops:RevokedKeys"]
                ?? _configuration["Integration__Biodrops__RevokedKeys"]
                ?? _configuration["BIODROPS_REVOKED_API_KEYS"];

            if (!string.IsNullOrWhiteSpace(revokedConfig))
            {
                var entries = revokedConfig.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var entry in entries)
                {
                    var clean = entry.Trim();
                    AddRevocationEntry(clean, "Revoked via configuration");
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

            // 1. Hash incoming credential before revocation lookup using SHA-256
            var incomingHashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(cleanKey));

            // Check for credential revocation using constant-time comparison across stored fingerprints
            if (IsHashBytesRevoked(incomingHashBytes, out var revocationReason))
            {
                _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication rejected: Revoked API credential used from IP: {IpAddress}, Path: {Path}. Reason: {Reason}", ip, path, revocationReason);
                return BiodropsAuthResult.Revoked("The provided API key has been revoked.");
            }

            // 2. Resolve configured valid keys
            var validKeys = GetConfiguredValidKeys();

            // Fail safely if no keys are configured in the environment
            if (validKeys.Count == 0)
            {
                _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication failed: No integration API key is configured on the server. External request rejected. Client IP: {IpAddress}, Path: {Path}", ip, path);
                return BiodropsAuthResult.Failure("API key authentication is not configured on the server.");
            }

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

            _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Authentication failed: Invalid API credential attempt from IP: {IpAddress}, Path: {Path}", ip, path);
            return BiodropsAuthResult.Failure("Invalid API key.");
        }

        public void RevokeApiKey(string apiKeyOrFingerprint, string reason)
        {
            if (string.IsNullOrWhiteSpace(apiKeyOrFingerprint)) return;

            var clean = apiKeyOrFingerprint.Trim();
            AddRevocationEntry(clean, reason);

            _logger.LogWarning("[INTEGRATION SECURITY AUDIT] Credential revoked. Reason: {Reason}", reason);
        }

        public bool IsApiKeyRevoked(string apiKeyOrFingerprint)
        {
            if (string.IsNullOrWhiteSpace(apiKeyOrFingerprint)) return false;

            var clean = apiKeyOrFingerprint.Trim();
            byte[] hashBytes;

            // If clean is already a 64-hex char SHA-256 fingerprint
            if (clean.Length == 64 && IsHexString(clean))
            {
                hashBytes = Convert.FromHexString(clean);
            }
            else
            {
                hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(clean));
            }

            return IsHashBytesRevoked(hashBytes, out _);
        }

        private bool IsHashBytesRevoked(byte[] hashBytes, out string? reason)
        {
            foreach (var item in _revokedFingerprints.Values)
            {
                if (item.HashBytes.Length == hashBytes.Length &&
                    CryptographicOperations.FixedTimeEquals(item.HashBytes, hashBytes))
                {
                    reason = item.Reason;
                    return true;
                }
            }

            reason = null;
            return false;
        }

        private void AddRevocationEntry(string entry, string reason)
        {
            byte[] hashBytes;
            string hexKey;

            // If entry is already a 64-character hex SHA-256 fingerprint
            if (entry.Length == 64 && IsHexString(entry))
            {
                hexKey = entry.ToLowerInvariant();
                hashBytes = Convert.FromHexString(entry);
            }
            else
            {
                hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(entry));
                hexKey = Convert.ToHexString(hashBytes).ToLowerInvariant();
            }

            _revokedFingerprints.TryAdd(hexKey, (hashBytes, reason));
        }

        private Dictionary<string, string> GetConfiguredValidKeys()
        {
            var keys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            // Primary environment / config key
            var primaryKey = _configuration["Integration:Biodrops:ApiKey"]
                ?? _configuration["Integration__Biodrops__ApiKey"]
                ?? _configuration["BIODROPS_INTEGRATION_API_KEY"];

            if (!string.IsNullOrWhiteSpace(primaryKey))
            {
                var cleanPrimary = primaryKey.Trim();
                if (!IsApiKeyRevoked(cleanPrimary))
                {
                    keys["BiodropsProductionApp"] = cleanPrimary;
                }
            }

            // Secondary / Rotation key for zero-downtime rotation support
            var secondaryKey = _configuration["Integration:Biodrops:SecondaryApiKey"]
                ?? _configuration["Integration__Biodrops__SecondaryApiKey"];

            if (!string.IsNullOrWhiteSpace(secondaryKey))
            {
                var cleanSecondary = secondaryKey.Trim();
                if (!IsApiKeyRevoked(cleanSecondary))
                {
                    keys["BiodropsRotationApp"] = cleanSecondary;
                }
            }

            // Multi-client keys in configuration section Integration:Biodrops:ApiKeys
            var multiKeysSection = _configuration.GetSection("Integration:Biodrops:ApiKeys");
            if (multiKeysSection.Exists())
            {
                foreach (var child in multiKeysSection.GetChildren())
                {
                    if (!string.IsNullOrWhiteSpace(child.Value))
                    {
                        var cleanMulti = child.Value.Trim();
                        if (!IsApiKeyRevoked(cleanMulti))
                        {
                            keys[child.Key] = cleanMulti;
                        }
                    }
                }
            }

            return keys;
        }

        private static bool IsHexString(string input)
        {
            foreach (var c in input)
            {
                var isHex = (c >= '0' && c <= '9') ||
                            (c >= 'a' && c <= 'f') ||
                            (c >= 'A' && c <= 'F');
                if (!isHex) return false;
            }
            return true;
        }
    }
}
