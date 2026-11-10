using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Aquora.Application.Interfaces;
using Aquora.Persistence.Context;

namespace Aquora.API.Middleware
{
    public class TenantResolutionMiddleware
    {
        private readonly RequestDelegate _next;

        public TenantResolutionMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, ITenantProvider tenantProvider, PlatformDbContext platformContext)
        {
            if (HttpMethods.IsOptions(context.Request.Method) ||
                context.Request.Path.StartsWithSegments("/api/v1/integrations") ||
                context.Request.Path.StartsWithSegments("/health") ||
                context.Request.Path.StartsWithSegments("/swagger"))
            {
                await _next(context);
                return;
            }

            Guid? resolvedTenantId = null;
            string? resolvedSchemaName = null;

            // 1. Resolve by Host Subdomain / Custom Domain
            var host = context.Request.Host.Host;
            var parts = host.Split('.');
            
            var systemSubdomains = new[] { "www", "aquora", "aquora-backend", "aquora-webzio", "webziointernational", "vercel", "api", "app", "admin", "platform", "localhost", "127.0.0.1" };

            // Exclude system base domains
            if (parts.Length > 1 && !host.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            {
                var subdomain = parts[0];
                if (!systemSubdomains.Contains(subdomain.ToLowerInvariant()))
                {
                    // Look up by subdomain
                    var tenant = await platformContext.Tenants
                        .Where(t => t.Subdomain.ToLower() == subdomain.ToLower() && !t.IsDeleted)
                        .Select(t => new { t.Id, t.SchemaName })
                        .FirstOrDefaultAsync();

                    if (tenant != null)
                    {
                        resolvedTenantId = tenant.Id;
                        resolvedSchemaName = tenant.SchemaName;
                    }
                }
            }

            // 2. Fallback to Custom Domain (skip for localhost/127.0.0.1)
            if (resolvedTenantId == null && !host.Equals("localhost", StringComparison.OrdinalIgnoreCase) && !host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase))
            {
                var tenant = await platformContext.Tenants
                    .Where(t => t.CustomDomain != null && t.CustomDomain.ToLower() == host.ToLower() && !t.IsDeleted)
                    .Select(t => new { t.Id, t.SchemaName })
                    .FirstOrDefaultAsync();

                if (tenant != null)
                {
                    resolvedTenantId = tenant.Id;
                    resolvedSchemaName = tenant.SchemaName;
                }
            }

            // 3. Fallback to X-Tenant-Id / X-Tenant-Code Headers
            if (resolvedTenantId == null)
            {
                if (context.Request.Headers.TryGetValue("X-Tenant-Id", out var tenantHeaderStr) && 
                    Guid.TryParse(tenantHeaderStr, out var tenantIdFromHeader))
                {
                    var tenant = await platformContext.Tenants
                        .Where(t => t.Id == tenantIdFromHeader && !t.IsDeleted)
                        .Select(t => new { t.Id, t.SchemaName })
                        .FirstOrDefaultAsync();
                    if (tenant != null)
                    {
                        resolvedTenantId = tenant.Id;
                        resolvedSchemaName = tenant.SchemaName;
                    }
                }
                else if (context.Request.Headers.TryGetValue("X-Tenant-Code", out var tenantCodeHeaderStr))
                {
                    var codeStr = tenantCodeHeaderStr.ToString().ToLower();
                    var tenant = await platformContext.Tenants
                        .Where(t => t.Code.ToLower() == codeStr && !t.IsDeleted)
                        .Select(t => new { t.Id, t.SchemaName })
                        .FirstOrDefaultAsync();
                    if (tenant != null)
                    {
                        resolvedTenantId = tenant.Id;
                        resolvedSchemaName = tenant.SchemaName;
                    }
                }
            }

            // 4. Fallback to JWT Claims if authenticated
            if (resolvedTenantId == null && context.User.Identity != null && context.User.Identity.IsAuthenticated)
            {
                var tenantClaim = context.User.FindFirst("tenant_id")?.Value;
                if (Guid.TryParse(tenantClaim, out var tenantIdFromClaims))
                {
                    var tenant = await platformContext.Tenants
                        .Where(t => t.Id == tenantIdFromClaims && !t.IsDeleted)
                        .Select(t => new { t.Id, t.SchemaName })
                        .FirstOrDefaultAsync();
                    if (tenant != null)
                    {
                        resolvedTenantId = tenant.Id;
                        resolvedSchemaName = tenant.SchemaName;
                    }
                }
            }

            // If resolved, set the tenant context!
            if (resolvedTenantId != null)
            {
                tenantProvider.SetTenantId(resolvedTenantId.Value);
                tenantProvider.SetTenantSchemaName(resolvedSchemaName ?? "public");
                context.Response.Headers.Append("X-Resolved-Tenant-Schema", resolvedSchemaName ?? "public");
                Console.WriteLine($"[TENANT RESOLVED] Tenant ID: {resolvedTenantId.Value}, Schema: {resolvedSchemaName}, Host: {host}");
            }

            await _next(context);
        }
    }
}
