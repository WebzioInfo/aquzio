using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace Aquora.Application.Services
{
    public class BiodropsConfigurationValidationResult
    {
        public bool IsValid { get; set; }
        public bool IsConfigured { get; set; }
        public string? ErrorMessage { get; set; }
        public List<string> Warnings { get; set; } = new();

        public static BiodropsConfigurationValidationResult Success(bool isConfigured, List<string>? warnings = null) =>
            new() { IsValid = true, IsConfigured = isConfigured, Warnings = warnings ?? new() };

        public static BiodropsConfigurationValidationResult Failure(string error) =>
            new() { IsValid = false, IsConfigured = false, ErrorMessage = error };
    }

    /// <summary>
    /// Validates Biodrops External Integration configuration at application startup and test time.
    /// Ensures production environments have properly provisioned secrets without relying on hardcoded defaults.
    /// </summary>
    public static class BiodropsConfigurationValidator
    {
        /// <summary>
        /// SHA-256 fingerprint of the previous compromised/exposed legacy key.
        /// Plaintext credentials are never retained in code or configuration.
        /// </summary>
        public const string RevokedLegacyKeySha256 = "c6dac52f2630fb3751ea940be7f3c7fe78d85ecf8abceefc38ec53f51a040bd0";

        public static BiodropsConfigurationValidationResult Validate(IConfiguration configuration, bool isProduction)
        {
            if (configuration == null)
            {
                return BiodropsConfigurationValidationResult.Failure("Configuration root is null.");
            }

            var primaryKey = configuration["Integration:Biodrops:ApiKey"]
                ?? configuration["Integration__Biodrops__ApiKey"]
                ?? configuration["BIODROPS_INTEGRATION_API_KEY"];

            var isConfigured = !string.IsNullOrWhiteSpace(primaryKey);

            if (isProduction)
            {
                if (!isConfigured)
                {
                    return BiodropsConfigurationValidationResult.Failure(
                        "CRITICAL: Production environment is missing required integration API key. " +
                        "Configure environment variable 'Integration__Biodrops__ApiKey'.");
                }

                var cleanKey = primaryKey!.Trim();

                if (IsMatchingLegacyFingerprint(cleanKey))
                {
                    return BiodropsConfigurationValidationResult.Failure(
                        "CRITICAL: Production integration API key matches a revoked credential fingerprint. " +
                        "Generate a new secret key and update 'Integration__Biodrops__ApiKey'.");
                }

                if (cleanKey.Length < 16)
                {
                    return BiodropsConfigurationValidationResult.Failure(
                        "CRITICAL: Production integration API key is too short. " +
                        "Must be at least 16 characters for adequate entropy.");
                }
            }
            else
            {
                var warnings = new List<string>();

                if (!isConfigured)
                {
                    warnings.Add("Integration:Biodrops:ApiKey is not configured in this environment. External integration requests will be safely rejected.");
                }
                else if (IsMatchingLegacyFingerprint(primaryKey!.Trim()))
                {
                    warnings.Add("Integration:Biodrops:ApiKey matches a revoked credential fingerprint and will be rejected.");
                }

                return BiodropsConfigurationValidationResult.Success(isConfigured, warnings);
            }

            return BiodropsConfigurationValidationResult.Success(true);
        }

        public static bool IsMatchingLegacyFingerprint(string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return false;
            var keyHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key.Trim()))).ToLowerInvariant();
            var computedBytes = Encoding.UTF8.GetBytes(keyHash);
            var expectedBytes = Encoding.UTF8.GetBytes(RevokedLegacyKeySha256);

            return computedBytes.Length == expectedBytes.Length &&
                   CryptographicOperations.FixedTimeEquals(computedBytes, expectedBytes);
        }
    }
}
