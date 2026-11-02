using System;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Aquora.Application.Interfaces.Services;
using Aquora.Shared.Models;

namespace Aquora.API.Authorization
{
    /// <summary>
    /// Action filter enforcing dedicated API key authentication for external Biodrops integration endpoints.
    /// Rejects requests with missing, invalid, or revoked credentials.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class BiodropsApiKeyAuthAttribute : TypeFilterAttribute
    {
        public BiodropsApiKeyAuthAttribute() : base(typeof(BiodropsApiKeyAuthFilter))
        {
        }
    }

    public class BiodropsApiKeyAuthFilter : IAsyncActionFilter
    {
        private readonly IBiodropsIntegrationAuthService _authService;

        public BiodropsApiKeyAuthFilter(IBiodropsIntegrationAuthService authService)
        {
            _authService = authService;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var httpContext = context.HttpContext;
            var ip = GetClientIpAddress(httpContext);
            var path = httpContext.Request.Path.Value ?? string.Empty;

            string? apiKey = null;

            if (httpContext.Request.Headers.TryGetValue("X-API-Key", out var headerVal) && !string.IsNullOrWhiteSpace(headerVal))
            {
                apiKey = headerVal.ToString().Trim();
            }
            else if (httpContext.Request.Headers.TryGetValue("Authorization", out var authHeaderVal) && !string.IsNullOrWhiteSpace(authHeaderVal))
            {
                var authStr = authHeaderVal.ToString().Trim();
                if (authStr.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    apiKey = authStr.Substring(7).Trim();
                }
                else if (authStr.StartsWith("ApiKey ", StringComparison.OrdinalIgnoreCase))
                {
                    apiKey = authStr.Substring(7).Trim();
                }
            }

            var authResult = _authService.Authenticate(apiKey, ip, path);

            if (!authResult.IsAuthorized)
            {
                var statusCode = authResult.IsRevoked ? HttpStatusCode.Forbidden : HttpStatusCode.Unauthorized;
                var errorCode = authResult.IsRevoked ? "CREDENTIAL_REVOKED" : "UNAUTHORIZED_INTEGRATION";
                var message = authResult.ErrorMessage ?? "Unauthorized integration access.";

                var failureResponse = ApiResponse<object>.CreateFailure(message, errorCode, httpContext.TraceIdentifier);

                context.Result = new ObjectResult(failureResponse)
                {
                    StatusCode = (int)statusCode
                };
                return;
            }

            // Expose client identity in HttpContext items for request tracking
            httpContext.Items["BiodropsClient"] = authResult.ClientName;
            await next();
        }

        private static string GetClientIpAddress(HttpContext context)
        {
            if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded))
            {
                var ip = forwarded.ToString().Split(',')[0].Trim();
                if (!string.IsNullOrWhiteSpace(ip)) return ip;
            }

            return context.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
        }
    }
}
