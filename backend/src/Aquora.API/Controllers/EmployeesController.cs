using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Aquora.API.Controllers;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.DTOs.Employees;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.Finance;
using Aquora.Shared.Models;

namespace Aquora.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/v1/[controller]")]
    public class EmployeesController : ApiControllerBase
    {
        private readonly IPlatformDbContext _platformContext;
        private readonly ITenantDbContext _tenantContext;
        private readonly IPasswordHasher _passwordHasher;
        private readonly ITenantProvider _tenantProvider;
        private readonly IUserRoleResolver _roleResolver;

        public EmployeesController(
            IPlatformDbContext platformContext,
            ITenantDbContext tenantContext,
            IPasswordHasher passwordHasher,
            ITenantProvider tenantProvider,
            IUserRoleResolver roleResolver)
        {
            _platformContext = platformContext;
            _tenantContext = tenantContext;
            _passwordHasher = passwordHasher;
            _tenantProvider = tenantProvider;
            _roleResolver = roleResolver;
        }

        private Guid GetTenantId()
        {
            var claim = User.FindFirst("tenant_id")?.Value;
            if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var tenantId))
            {
                throw new UnauthorizedAccessException("Tenant context is missing or invalid.");
            }
            return tenantId;
        }

        private string GetCurrentUserEmail()
        {
            return User.FindFirst("email")?.Value ?? User.Identity?.Name ?? "System";
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<EmployeeDto>>>> GetEmployees()
        {
            try
            {
                var tenantId = GetTenantId();
                var usersRaw = await _platformContext.Users
                    .AsNoTracking()
                    .Where(u => u.TenantId == tenantId && !u.IsDeleted)
                    .OrderByDescending(u => u.CreatedAt)
                    .Select(u => new
                    {
                        u.Id,
                        u.FirstName,
                        u.LastName,
                        u.Username,
                        u.Email,
                        u.RoleName,
                        u.Department,
                        u.CurrentSalary,
                        u.IsActive,
                        u.CreatedAt,
                        u.LastLoginAt,
                        u.IsPlatformAdmin,
                        u.TenantId
                    })
                    .ToListAsync();

                var users = usersRaw.Select(u => new User
                {
                    Id = u.Id,
                    FirstName = u.FirstName,
                    LastName = u.LastName,
                    Username = u.Username,
                    Email = u.Email,
                    RoleName = u.RoleName,
                    Department = u.Department,
                    CurrentSalary = u.CurrentSalary,
                    IsActive = u.IsActive,
                    CreatedAt = u.CreatedAt,
                    LastLoginAt = u.LastLoginAt,
                    IsPlatformAdmin = u.IsPlatformAdmin,
                    TenantId = u.TenantId
                }).ToList();

                var roles = await _tenantContext.Roles.ToListAsync();
                var roleMap = await _roleResolver.ResolveUsersRolesAsync(users, tenantId);

                var ownerMap = new Dictionary<Guid, Guid>();
                try
                {
                    var linkedOwners = await _tenantContext.Owners
                        .AsNoTracking()
                        .Where(o => o.TenantId == tenantId && !o.IsDeleted && o.UserId != null)
                        .Select(o => new { o.Id, o.UserId })
                        .ToListAsync();
                    ownerMap = linkedOwners.Where(o => o.UserId.HasValue).ToDictionary(o => o.UserId!.Value, o => o.Id);
                }
                catch
                {
                    // Fallback gracefully if Owners table or column is transiently being repaired
                    ownerMap = new Dictionary<Guid, Guid>();
                }

                var result = new List<EmployeeDto>();
                foreach (var user in users)
                {
                    var resolvedRole = roleMap.TryGetValue(user.Id, out var r) ? r : (user.RoleName ?? "Operator");
                    var matchingRole = roles.FirstOrDefault(rl => rl.Name.Equals(resolvedRole, StringComparison.OrdinalIgnoreCase) || rl.Code.Equals(resolvedRole, StringComparison.OrdinalIgnoreCase));

                    result.Add(new EmployeeDto
                    {
                        Id = user.Id,
                        FullName = $"{user.FirstName} {user.LastName}".Trim(),
                        Username = user.Username ?? user.Email,
                        Email = user.Email ?? string.Empty,
                        RoleName = resolvedRole,
                        RoleCode = matchingRole?.Code ?? resolvedRole.ToUpperInvariant().Replace(" ", "_"),
                        Department = user.Department ?? "Operations",
                        CurrentSalary = user.CurrentSalary ?? 0m,
                        IsActive = user.IsActive,
                        CreatedAt = user.CreatedAt,
                        LastLogin = user.LastLoginAt,
                        OwnerId = ownerMap.TryGetValue(user.Id, out var oId) ? oId : (Guid?)null,
                        Phone = user.Phone
                    });
                }

                return Success(result, "Employees loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<List<EmployeeDto>>(ex.Message, "Failed to load employees.");
            }
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<EmployeeDto>>> CreateEmployee([FromBody] CreateEmployeeRequest request)
        {
            try
            {
                var tenantId = GetTenantId();
                var usernameNormalized = request.Username.Trim().ToLowerInvariant();
                var emailNormalized = request.Email.Trim().ToLowerInvariant();

                // Unique username check globally across all tenants
                var usernameExists = await _platformContext.Users
                    .AnyAsync(u => u.Username != null && u.Username.ToLower() == usernameNormalized && !u.IsDeleted);

                if (usernameExists)
                {
                    return Failure<EmployeeDto>("Username is already taken. Please choose another username.", "Validation Error");
                }

                // Globally unique email mapping check
                var emailExists = await _platformContext.Users
                    .AnyAsync(u => u.Email.ToLower() == emailNormalized && !u.IsDeleted);

                if (emailExists)
                {
                    return Failure<EmployeeDto>("Email is already registered.", "Validation Error");
                }

                // Enforce restriction: Company Admin cannot create or assign system Admin role
                if (string.Equals(request.RoleCode?.Trim(), "Admin", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(request.RoleCode?.Trim(), "ADMIN", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(ApiResponse<EmployeeDto>.CreateFailure("Company administrators are not permitted to create or assign the system Admin role.", "Validation Error", HttpContext.TraceIdentifier));
                }

                // Check role existence inside tenant schema
                var role = await _tenantContext.Roles
                    .FirstOrDefaultAsync(r => r.Code.ToUpper() == request.RoleCode.ToUpper() || r.Name.ToLower() == request.RoleCode.ToLower());

                if (role != null && (role.Code.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) || role.Name.Equals("Admin", StringComparison.OrdinalIgnoreCase)))
                {
                    return BadRequest(ApiResponse<EmployeeDto>.CreateFailure("Company administrators are not permitted to create or assign the system Admin role.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (role == null && (request.RoleCode.Equals("OWNER", StringComparison.OrdinalIgnoreCase) || request.RoleCode.Equals("Owner", StringComparison.OrdinalIgnoreCase)))
                {
                    role = new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Owner",
                        Code = "OWNER",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.Roles.Add(role);
                    await _tenantContext.SaveChangesAsync();
                }

                if (role == null && (request.RoleCode.Equals("ACCOUNTANT", StringComparison.OrdinalIgnoreCase) || request.RoleCode.Equals("Accountant", StringComparison.OrdinalIgnoreCase)))
                {
                    role = new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Accountant",
                        Code = "ACCOUNTANT",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.Roles.Add(role);
                    await _tenantContext.SaveChangesAsync();

                    var companyAdminRole = await _tenantContext.Roles.FirstOrDefaultAsync(r => r.Code.ToUpper() == "COMPANYADMIN" || r.Name.ToLower() == "companyadmin");
                    if (companyAdminRole != null)
                    {
                        var adminPerms = await _tenantContext.RolePermissions.Where(rp => rp.RoleId == companyAdminRole.Id).ToListAsync();
                        foreach (var ap in adminPerms)
                        {
                            _tenantContext.RolePermissions.Add(new RolePermission
                            {
                                RoleId = role.Id,
                                PermissionId = ap.PermissionId,
                                TenantId = tenantId
                            });
                        }
                        await _tenantContext.SaveChangesAsync();
                    }
                }

                if (role == null)
                {
                    return Failure<EmployeeDto>($"Role Code '{request.RoleCode}' is invalid or does not exist for this tenant.", "Validation Error");
                }

                // Split full name
                var parts = request.FullName.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                var firstName = parts.Length > 0 ? parts[0] : string.Empty;
                var lastName = parts.Length > 1 ? parts[1] : string.Empty;

                // Secure one-way password/PIN hashing
                var hash = _passwordHasher.HashPassword(request.PasswordOrPin);

                var newUser = new User
                {
                    Id = Guid.NewGuid(),
                    Username = request.Username.Trim(),
                    Email = emailNormalized,
                    FirstName = firstName,
                    LastName = lastName,
                    PasswordHash = hash,
                    PinHash = hash,
                    TenantId = tenantId,
                    Department = request.Department ?? "Operations",
                    CurrentSalary = request.CurrentSalary,
                    RoleName = role.Name,
                    IsActive = true,
                    EmailVerified = true,
                    TokenVersion = 0,
                    Phone = !string.IsNullOrWhiteSpace(request.Phone) ? request.Phone.Trim() : null
                };

                _platformContext.Users.Add(newUser);

                // UserMembership link in Platform Db
                var membership = new UserMembership
                {
                    Id = Guid.NewGuid(),
                    PlatformUserId = newUser.Id,
                    TenantId = tenantId,
                    RoleId = role.Id,
                    Status = "Active",
                    JoinedAt = DateTime.UtcNow
                };
                _platformContext.UserMemberships.Add(membership);

                // UserRole link in Tenant Db
                var tenantUserRole = new UserRole
                {
                    Id = Guid.NewGuid(),
                    UserId = newUser.Id,
                    RoleId = role.Id,
                    TenantId = tenantId
                };
                _tenantContext.UserRoles.Add(tenantUserRole);

                // Owner Integration: If role is Owner, create or link Owner profile
                bool isOwnerRole = role.Code.Equals("OWNER", StringComparison.OrdinalIgnoreCase) ||
                                   role.Name.Equals("Owner", StringComparison.OrdinalIgnoreCase);
                Owner? createdOrLinkedOwner = null;

                if (isOwnerRole)
                {
                    var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                    var companyId = company?.Id ?? Guid.Empty;

                    // Duplicate protection: Check if an Owner record already exists for this tenant and this user or email
                    var existingOwner = await _tenantContext.Owners
                        .FirstOrDefaultAsync(o => o.TenantId == tenantId &&
                            (o.UserId == newUser.Id || (!string.IsNullOrWhiteSpace(emailNormalized) && o.Email != null && o.Email.ToLower() == emailNormalized)) &&
                            !o.IsDeleted);

                    if (existingOwner != null)
                    {
                        existingOwner.UserId = newUser.Id;
                        existingOwner.CompanyId = companyId;
                        if (string.IsNullOrWhiteSpace(existingOwner.Name)) existingOwner.Name = request.FullName.Trim();
                        if (string.IsNullOrWhiteSpace(existingOwner.Email)) existingOwner.Email = emailNormalized;
                        if (!string.IsNullOrWhiteSpace(request.Phone)) existingOwner.Phone = request.Phone.Trim();
                        if (request.OwnershipPercentage.HasValue && request.OwnershipPercentage > 0 && existingOwner.OwnershipPercentage == 0)
                        {
                            existingOwner.OwnershipPercentage = request.OwnershipPercentage.Value;
                        }
                        if (request.InitialInvestment.HasValue && request.InitialInvestment > 0 && existingOwner.InitialInvestment == 0)
                        {
                            existingOwner.InitialInvestment = request.InitialInvestment.Value;
                            existingOwner.CurrentInvestment = request.InitialInvestment.Value;
                        }
                        existingOwner.UpdatedAt = DateTime.UtcNow;
                        existingOwner.UpdatedBy = GetCurrentUserEmail();
                        createdOrLinkedOwner = existingOwner;
                    }
                    else
                    {
                        var newOwner = new Owner
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            CompanyId = companyId,
                            UserId = newUser.Id,
                            Name = request.FullName.Trim(),
                            Email = emailNormalized,
                            Phone = !string.IsNullOrWhiteSpace(request.Phone) ? request.Phone.Trim() : string.Empty,
                            OwnershipPercentage = request.OwnershipPercentage ?? 0m,
                            InitialInvestment = request.InitialInvestment ?? 0m,
                            CurrentInvestment = request.InitialInvestment ?? 0m,
                            Notes = "Created automatically via Employee Registration (Role = Owner)",
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = GetCurrentUserEmail()
                        };
                        _tenantContext.Owners.Add(newOwner);
                        createdOrLinkedOwner = newOwner;
                    }
                }

                await _platformContext.SaveChangesAsync();
                try
                {
                    await _tenantContext.SaveChangesAsync();
                }
                catch
                {
                    _platformContext.Users.Remove(newUser);
                    await _platformContext.SaveChangesAsync();
                    throw;
                }

                // Non-blocking Platform Audit Trail logging
                try
                {
                    var auditLog = new PlatformAuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        UserId = newUser.Id.ToString(),
                        UserEmail = GetCurrentUserEmail(),
                        Action = "Insert",
                        TableName = "Users",
                        PrimaryKey = newUser.Id.ToString(),
                        OldValues = "{}",
                        NewValues = System.Text.Json.JsonSerializer.Serialize(new {
                            newUser.Id,
                            newUser.Username,
                            newUser.Email,
                            newUser.FirstName,
                            newUser.LastName,
                            newUser.Department,
                            RoleName = role.Name,
                            RoleCode = role.Code,
                            OwnerId = createdOrLinkedOwner?.Id
                        }),
                        Timestamp = DateTime.UtcNow,
                        IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                        Reason = "Employee creation",
                        Module = "User Management"
                    };
                    _platformContext.PlatformAuditLogs.Add(auditLog);
                    await _platformContext.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[AUDIT LOG FAILURE - NON-BLOCKING]: Failed to write employee creation platform audit: {ex.Message}");
                }

                var dto = new EmployeeDto
                {
                    Id = newUser.Id,
                    FullName = request.FullName.Trim(),
                    Username = newUser.Username,
                    Email = newUser.Email,
                    RoleName = role.Name,
                    RoleCode = role.Code,
                    Department = newUser.Department,
                    CurrentSalary = newUser.CurrentSalary ?? 0m,
                    IsActive = newUser.IsActive,
                    CreatedAt = newUser.CreatedAt,
                    LastLogin = null,
                    OwnerId = createdOrLinkedOwner?.Id,
                    Phone = newUser.Phone
                };

                return Success(dto, isOwnerRole ? "Owner employee created successfully." : "Employee created successfully.");
            }
            catch (DbUpdateException dbEx)
            {
                var details = new System.Text.StringBuilder();
                details.AppendLine($"Database Save Failure: {dbEx.Message}");
                if (dbEx.InnerException is Npgsql.PostgresException pgEx)
                {
                    details.AppendLine($"Postgres Error Code (SqlState): {pgEx.SqlState}");
                    details.AppendLine($"Constraint Name: {pgEx.ConstraintName}");
                    details.AppendLine($"Column Name: {pgEx.ColumnName}");
                    details.AppendLine($"Table Name: {pgEx.TableName}");
                    details.AppendLine($"Error Message: {pgEx.MessageText}");
                    details.AppendLine($"Detail: {pgEx.Detail}");
                }
                var fullError = details.ToString();
                Console.WriteLine($"[CREATE EMPLOYEE DATABASE ERROR]:\n{fullError}");
                return Failure<EmployeeDto>(fullError, "Failed to save database changes during employee creation.");
            }
            catch (Exception ex)
            {
                var fullError = ex.Message;
                if (ex.InnerException != null)
                {
                    fullError += $"\nInner Exception: {ex.InnerException.ToString()}";
                }
                Console.WriteLine($"[CREATE EMPLOYEE EXCEPTION]:\n{fullError}");
                return Failure<EmployeeDto>(fullError, "Failed to create employee.");
            }
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult<ApiResponse<EmployeeDto>>> UpdateEmployee(Guid id, [FromBody] UpdateEmployeeRequest request)
        {
            try
            {
                var tenantId = GetTenantId();
                var user = await _platformContext.Users
                    .FirstOrDefaultAsync(u => u.Id == id && u.TenantId == tenantId && !u.IsDeleted);

                if (user == null)
                {
                    return NotFound(ApiResponse<EmployeeDto>.CreateFailure("Employee not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                var usernameNormalized = request.Username.Trim().ToLowerInvariant();
                var emailNormalized = request.Email.Trim().ToLowerInvariant();

                // Unique username check globally across all tenants (excluding current user)
                var usernameExists = await _platformContext.Users
                    .AnyAsync(u => u.Id != id && u.Username != null && u.Username.ToLower() == usernameNormalized && !u.IsDeleted);

                if (usernameExists)
                {
                    return Failure<EmployeeDto>("Username is already taken. Please choose another username.", "Validation Error");
                }

                // Globally unique email mapping check (excluding current user)
                var emailExists = await _platformContext.Users
                    .AnyAsync(u => u.Id != id && u.Email.ToLower() == emailNormalized && !u.IsDeleted);

                if (emailExists)
                {
                    return Failure<EmployeeDto>("Email is already registered.", "Validation Error");
                }

                // Enforce restriction: Company Admin cannot assign system Admin role
                if (string.Equals(request.RoleCode?.Trim(), "Admin", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(request.RoleCode?.Trim(), "ADMIN", StringComparison.OrdinalIgnoreCase))
                {
                    return BadRequest(ApiResponse<EmployeeDto>.CreateFailure("Company administrators are not permitted to assign the system Admin role.", "Validation Error", HttpContext.TraceIdentifier));
                }

                // Check role
                var role = await _tenantContext.Roles
                    .FirstOrDefaultAsync(r => r.Code.ToUpper() == request.RoleCode.ToUpper() || r.Name.ToLower() == request.RoleCode.ToLower());

                if (role != null && (role.Code.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) || role.Name.Equals("Admin", StringComparison.OrdinalIgnoreCase)))
                {
                    return BadRequest(ApiResponse<EmployeeDto>.CreateFailure("Company administrators are not permitted to assign the system Admin role.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (role == null && (request.RoleCode.Equals("OWNER", StringComparison.OrdinalIgnoreCase) || request.RoleCode.Equals("Owner", StringComparison.OrdinalIgnoreCase)))
                {
                    role = new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Owner",
                        Code = "OWNER",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.Roles.Add(role);
                    await _tenantContext.SaveChangesAsync();
                }

                if (role == null && (request.RoleCode.Equals("ACCOUNTANT", StringComparison.OrdinalIgnoreCase) || request.RoleCode.Equals("Accountant", StringComparison.OrdinalIgnoreCase)))
                {
                    role = new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Accountant",
                        Code = "ACCOUNTANT",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.Roles.Add(role);
                    await _tenantContext.SaveChangesAsync();

                    var companyAdminRole = await _tenantContext.Roles.FirstOrDefaultAsync(r => r.Code.ToUpper() == "COMPANYADMIN" || r.Name.ToLower() == "companyadmin");
                    if (companyAdminRole != null)
                    {
                        var adminPerms = await _tenantContext.RolePermissions.Where(rp => rp.RoleId == companyAdminRole.Id).ToListAsync();
                        foreach (var ap in adminPerms)
                        {
                            _tenantContext.RolePermissions.Add(new RolePermission
                            {
                                RoleId = role.Id,
                                PermissionId = ap.PermissionId,
                                TenantId = tenantId
                            });
                        }
                        await _tenantContext.SaveChangesAsync();
                    }
                }

                if (role == null)
                {
                    return Failure<EmployeeDto>($"Role Code '{request.RoleCode}' is invalid.", "Validation Error");
                }

                // If new PIN is provided, securely update one-way password/PIN hash
                if (!string.IsNullOrWhiteSpace(request.Pin))
                {
                    var pinTrimmed = request.Pin.Trim();
                    if (pinTrimmed.Length < 4)
                    {
                        return Failure<EmployeeDto>("PIN must be at least 4 digits.", "Validation Error");
                    }
                    var newHash = _passwordHasher.HashPassword(pinTrimmed);
                    user.PinHash = newHash;
                    user.PasswordHash = newHash;
                }

                // Capture old values before mutation
                var oldValuesJson = System.Text.Json.JsonSerializer.Serialize(new {
                    user.FirstName,
                    user.LastName,
                    user.Username,
                    user.Email,
                    user.Department,
                    user.IsActive,
                    user.CurrentSalary
                });

                // Update details
                var parts = request.FullName.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                user.FirstName = parts.Length > 0 ? parts[0] : string.Empty;
                user.LastName = parts.Length > 1 ? parts[1] : string.Empty;
                user.Username = request.Username.Trim();
                user.Email = emailNormalized;
                user.Department = request.Department ?? "Operations";
                user.CurrentSalary = request.CurrentSalary;
                user.RoleName = role.Name;
                user.IsActive = request.IsActive;
                if (!string.IsNullOrWhiteSpace(request.Phone))
                {
                    user.Phone = request.Phone.Trim();
                }

                // Update Role link in Platform DB
                var membership = await _platformContext.UserMemberships
                    .FirstOrDefaultAsync(m => m.PlatformUserId == user.Id && m.TenantId == tenantId);
                if (membership != null)
                {
                    membership.RoleId = role.Id;
                    membership.Status = user.IsActive ? "Active" : "Inactive";
                }

                // Update Role link in Tenant DB
                var tenantUserRole = await _tenantContext.UserRoles
                    .FirstOrDefaultAsync(ur => ur.UserId == user.Id && ur.TenantId == tenantId);
                if (tenantUserRole != null)
                {
                    tenantUserRole.RoleId = role.Id;
                }
                else
                {
                    _tenantContext.UserRoles.Add(new UserRole
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        RoleId = role.Id,
                        TenantId = tenantId
                    });
                }

                // Owner Integration: If role is Owner, create or link Owner profile
                bool isOwnerRole = role.Code.Equals("OWNER", StringComparison.OrdinalIgnoreCase) ||
                                   role.Name.Equals("Owner", StringComparison.OrdinalIgnoreCase);
                Owner? linkedOwner = null;

                if (isOwnerRole)
                {
                    var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                    var companyId = company?.Id ?? Guid.Empty;

                    var existingOwner = await _tenantContext.Owners
                        .FirstOrDefaultAsync(o => o.TenantId == tenantId &&
                            (o.UserId == user.Id || (!string.IsNullOrWhiteSpace(emailNormalized) && o.Email != null && o.Email.ToLower() == emailNormalized)) &&
                            !o.IsDeleted);

                    if (existingOwner != null)
                    {
                        existingOwner.UserId = user.Id;
                        existingOwner.CompanyId = companyId;
                        existingOwner.Name = request.FullName.Trim();
                        existingOwner.Email = emailNormalized;
                        if (!string.IsNullOrWhiteSpace(request.Phone)) existingOwner.Phone = request.Phone.Trim();
                        if (request.OwnershipPercentage.HasValue && request.OwnershipPercentage > 0)
                        {
                            existingOwner.OwnershipPercentage = request.OwnershipPercentage.Value;
                        }
                        if (request.InitialInvestment.HasValue && request.InitialInvestment > 0 && existingOwner.InitialInvestment == 0)
                        {
                            existingOwner.InitialInvestment = request.InitialInvestment.Value;
                            existingOwner.CurrentInvestment = request.InitialInvestment.Value;
                        }
                        existingOwner.UpdatedAt = DateTime.UtcNow;
                        existingOwner.UpdatedBy = GetCurrentUserEmail();
                        linkedOwner = existingOwner;
                    }
                    else
                    {
                        var newOwner = new Owner
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            CompanyId = companyId,
                            UserId = user.Id,
                            Name = request.FullName.Trim(),
                            Email = emailNormalized,
                            Phone = !string.IsNullOrWhiteSpace(request.Phone) ? request.Phone.Trim() : string.Empty,
                            OwnershipPercentage = request.OwnershipPercentage ?? 0m,
                            InitialInvestment = request.InitialInvestment ?? 0m,
                            CurrentInvestment = request.InitialInvestment ?? 0m,
                            Notes = "Created automatically via Employee Role update to Owner",
                            CreatedAt = DateTime.UtcNow,
                            CreatedBy = GetCurrentUserEmail()
                        };
                        _tenantContext.Owners.Add(newOwner);
                        linkedOwner = newOwner;
                    }
                }
                else
                {
                    // Role is NOT Owner: Preserve existing financial Owner profile intact for accounting continuity
                    var prevOwner = await _tenantContext.Owners
                        .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.UserId == user.Id && !o.IsDeleted);
                    if (prevOwner != null)
                    {
                        prevOwner.UpdatedAt = DateTime.UtcNow;
                        prevOwner.UpdatedBy = GetCurrentUserEmail();
                        linkedOwner = prevOwner;
                    }
                }

                await _platformContext.SaveChangesAsync();
                await _tenantContext.SaveChangesAsync();

                // Non-blocking Platform Audit Trail logging
                try
                {
                    var auditLog = new PlatformAuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        UserId = user.Id.ToString(),
                        UserEmail = GetCurrentUserEmail(),
                        Action = "Update",
                        TableName = "Users",
                        PrimaryKey = user.Id.ToString(),
                        OldValues = oldValuesJson,
                        NewValues = System.Text.Json.JsonSerializer.Serialize(new {
                            FirstName = user.FirstName,
                            LastName = user.LastName,
                            Username = user.Username,
                            Email = user.Email,
                            Department = user.Department,
                            IsActive = user.IsActive,
                            CurrentSalary = user.CurrentSalary,
                            RoleName = role.Name,
                            RoleCode = role.Code,
                            OwnerId = linkedOwner?.Id
                        }),
                        Timestamp = DateTime.UtcNow,
                        IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                        Reason = "Employee profile update",
                        Module = "User Management"
                    };
                    _platformContext.PlatformAuditLogs.Add(auditLog);
                    await _platformContext.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[AUDIT LOG FAILURE - NON-BLOCKING]: Failed to write employee update platform audit: {ex.Message}");
                }

                var dto = new EmployeeDto
                {
                    Id = user.Id,
                    FullName = $"{user.FirstName} {user.LastName}".Trim(),
                    Username = user.Username ?? user.Email,
                    Email = user.Email ?? string.Empty,
                    RoleName = role.Name,
                    RoleCode = role.Code,
                    Department = user.Department,
                    CurrentSalary = user.CurrentSalary ?? 0m,
                    IsActive = user.IsActive,
                    CreatedAt = user.CreatedAt,
                    LastLogin = user.LastLoginAt,
                    OwnerId = linkedOwner?.Id,
                    Phone = user.Phone
                };

                return Success(dto, "Employee updated successfully.");
            }
            catch (Exception ex)
            {
                return Failure<EmployeeDto>(ex.Message, "Failed to update employee.");
            }
        }

        [HttpDelete("{id:guid}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteEmployee(Guid id)
        {
            try
            {
                var tenantId = GetTenantId();
                var user = await _platformContext.Users
                    .FirstOrDefaultAsync(u => u.Id == id && u.TenantId == tenantId && !u.IsDeleted);

                if (user == null)
                {
                    return NotFound(ApiResponse<bool>.CreateFailure("Employee not found.", "Not Found", HttpContext.TraceIdentifier));
                }

                var oldValuesJson = System.Text.Json.JsonSerializer.Serialize(new {
                    user.Id,
                    user.Username,
                    user.Email,
                    user.FirstName,
                    user.LastName,
                    user.Department,
                    user.IsActive
                });

                user.IsDeleted = true;
                user.DeletedAt = DateTime.UtcNow;
                user.DeletedBy = GetCurrentUserEmail();

                // Remove memberships and role links
                var memberships = await _platformContext.UserMemberships
                    .Where(m => m.PlatformUserId == user.Id && m.TenantId == tenantId)
                    .ToListAsync();
                _platformContext.UserMemberships.RemoveRange(memberships);

                var tenantUserRoles = await _tenantContext.UserRoles
                    .Where(ur => ur.UserId == user.Id && ur.TenantId == tenantId)
                    .ToListAsync();
                _tenantContext.UserRoles.RemoveRange(tenantUserRoles);

                // Check linked Owner profile: Protect business-critical financial history
                var linkedOwner = await _tenantContext.Owners
                    .Include(o => o.InvestmentTransactions)
                    .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.UserId == user.Id && !o.IsDeleted);

                if (linkedOwner != null)
                {
                    bool hasTransactions = linkedOwner.InvestmentTransactions.Any(t => !t.IsDeleted);
                    if (!hasTransactions && linkedOwner.CurrentInvestment == 0 && linkedOwner.InitialInvestment == 0)
                    {
                        // Clean soft delete if no financial history exists
                        linkedOwner.IsDeleted = true;
                        linkedOwner.DeletedAt = DateTime.UtcNow;
                        linkedOwner.DeletedBy = GetCurrentUserEmail();
                    }
                    else
                    {
                        // Preserve ledger integrity, detach user account
                        linkedOwner.UserId = null;
                        linkedOwner.UpdatedAt = DateTime.UtcNow;
                        linkedOwner.UpdatedBy = GetCurrentUserEmail();
                    }
                }

                await _platformContext.SaveChangesAsync();
                await _tenantContext.SaveChangesAsync();

                // Non-blocking Platform Audit Trail logging
                try
                {
                    var auditLog = new PlatformAuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        UserId = user.Id.ToString(),
                        UserEmail = GetCurrentUserEmail(),
                        Action = "Delete",
                        TableName = "Users",
                        PrimaryKey = user.Id.ToString(),
                        OldValues = oldValuesJson,
                        NewValues = "{}",
                        Timestamp = DateTime.UtcNow,
                        IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                        Reason = "Employee deletion",
                        Module = "User Management"
                    };
                    _platformContext.PlatformAuditLogs.Add(auditLog);
                    await _platformContext.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[AUDIT LOG FAILURE - NON-BLOCKING]: Failed to write employee deletion platform audit: {ex.Message}");
                }

                return Success(true, "Employee soft-deleted successfully.");
            }
            catch (Exception ex)
            {
                return Failure<bool>(ex.Message, "Failed to delete employee.");
            }
        }

        [HttpPut("reset-password")]
        [HttpPost("reset-password")]
        public async Task<ActionResult<ApiResponse<bool>>> ResetPassword([FromBody] ResetEmployeePasswordRequest request)
        {
            try
            {
                var roles = User.FindAll(System.Security.Claims.ClaimTypes.Role).Select(c => c.Value.ToUpperInvariant()).ToList();
                if (!roles.Contains("COMPANYADMIN") && !roles.Contains("ACCOUNTANT") && !roles.Contains("SUPERADMIN") && !roles.Contains("PLATFORMADMIN"))
                {
                    return StatusCode(403, ApiResponse<bool>.CreateFailure("Only Company Admin or Accountant can reset employee password.", "Forbidden", HttpContext.TraceIdentifier));
                }

                var tenantId = GetTenantId();
                var adminPin = request.ResolvedAdminPin;

                if (string.IsNullOrWhiteSpace(adminPin))
                {
                    return BadRequest(ApiResponse<bool>.CreateFailure("Admin PIN is required.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (!VerifySecurityPin(tenantId, adminPin))
                {
                    await LogSecurityAuditAsync(tenantId, "InvalidPin", request.EmployeeId.ToString(), "Invalid Admin PIN attempt during employee password reset.");
                    return BadRequest(ApiResponse<bool>.CreateFailure("Invalid admin PIN.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (string.IsNullOrWhiteSpace(request.PasswordOrPin) || request.PasswordOrPin.Trim().Length < 8)
                {
                    return BadRequest(ApiResponse<bool>.CreateFailure("New password must be at least 8 characters.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var user = await _platformContext.Users
                    .FirstOrDefaultAsync(u => u.Id == request.EmployeeId && u.TenantId == tenantId && !u.IsDeleted);

                if (user == null)
                {
                    return NotFound(ApiResponse<bool>.CreateFailure("Employee not found in your organization.", "Not Found", HttpContext.TraceIdentifier));
                }

                var oldValuesJson = System.Text.Json.JsonSerializer.Serialize(new {
                    user.Username,
                    user.Email,
                    user.Department
                });

                // Secure one-way hash computation
                var hash = _passwordHasher.HashPassword(request.PasswordOrPin.Trim());
                user.PasswordHash = hash;
                user.PinHash = hash;

                // Invalidate existing sessions / refresh tokens
                user.TokenVersion++;
                user.RefreshToken = null;
                user.RefreshTokenExpiryTime = null;

                await _platformContext.SaveChangesAsync();

                // Safe audit event with no credentials or secrets logged
                await LogSecurityAuditAsync(tenantId, "ResetPassword", user.Id.ToString(), $"Employee password reset by administrator for: {user.Username ?? user.Email}");

                try
                {
                    var auditLog = new PlatformAuditLog
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        UserId = user.Id.ToString(),
                        UserEmail = GetCurrentUserEmail(),
                        Action = "Update",
                        TableName = "Users",
                        PrimaryKey = user.Id.ToString(),
                        OldValues = oldValuesJson,
                        NewValues = System.Text.Json.JsonSerializer.Serialize(new {
                            Action = "PasswordReset",
                            Timestamp = DateTime.UtcNow
                        }),
                        Timestamp = DateTime.UtcNow,
                        IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                        Reason = "Employee password reset",
                        Module = "User Management"
                    };
                    _platformContext.PlatformAuditLogs.Add(auditLog);
                    await _platformContext.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[AUDIT LOG FAILURE - NON-BLOCKING]: Failed to write employee reset password platform audit: {ex.Message}");
                }

                return Success(true, "Employee password updated successfully.");
            }
            catch (Exception ex)
            {
                return Failure<bool>(ex.Message, "Failed to reset password.");
            }
        }

        [HttpPost("security-pin")]
        public async Task<ActionResult<ApiResponse<bool>>> SaveSecurityPin([FromBody] SecuritySettingsRequest request)
        {
            try
            {
                var roles = User.FindAll(System.Security.Claims.ClaimTypes.Role).Select(c => c.Value.ToUpperInvariant()).ToList();
                if (!roles.Contains("COMPANYADMIN") && !roles.Contains("ACCOUNTANT") && !roles.Contains("SUPERADMIN") && !roles.Contains("PLATFORMADMIN"))
                {
                    return StatusCode(403, ApiResponse<bool>.CreateFailure("Only Company Admin or Accountant can set the security PIN.", "Forbidden", HttpContext.TraceIdentifier));
                }

                var pin = request.ResolvedAdminPin;
                var confirmPin = request.ResolvedConfirmPin;

                if (string.IsNullOrWhiteSpace(pin) || pin.Length != 4 || !pin.All(char.IsDigit))
                {
                    return BadRequest(ApiResponse<bool>.CreateFailure("Admin PIN must be exactly 4 digits.", "Validation Error", HttpContext.TraceIdentifier));
                }

                if (pin != confirmPin)
                {
                    return BadRequest(ApiResponse<bool>.CreateFailure("PINs do not match.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var tenantId = GetTenantId();
                var pinHash = _passwordHasher.HashPassword(pin);

                var company = await _tenantContext.Companies.FirstOrDefaultAsync(c => !c.IsDeleted);
                if (company != null)
                {
                    company.AdminPinHash = pinHash;
                    await _tenantContext.SaveChangesAsync();
                }

                SaveSecurityPinHash(tenantId, pinHash);

                return Success(true, "Security PIN updated successfully.");
            }
            catch (Exception ex)
            {
                return Failure<bool>(ex.Message, "Failed to save security PIN.");
            }
        }

        [HttpGet("security-pin/status")]
        public ActionResult<ApiResponse<object>> GetSecurityPinStatus()
        {
            try
            {
                var tenantId = GetTenantId();
                var hash = GetSecurityPinHash(tenantId);
                return Success<object>(new { isPinSet = !string.IsNullOrEmpty(hash) }, "PIN status loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<object>(ex.Message, "Failed to load PIN status.");
            }
        }

        [HttpPost("security-pin/verify")]
        public async Task<ActionResult<ApiResponse<bool>>> VerifyPin([FromBody] VerifyPinRequest request)
        {
            try
            {
                var pin = request.ResolvedAdminPin;
                if (string.IsNullOrWhiteSpace(pin) || pin.Length != 4 || !pin.All(char.IsDigit))
                {
                    return BadRequest(ApiResponse<bool>.CreateFailure("Admin PIN must be exactly 4 digits.", "Validation Error", HttpContext.TraceIdentifier));
                }

                var tenantId = GetTenantId();
                var isValid = VerifySecurityPin(tenantId, pin);
                if (!isValid)
                {
                    await LogSecurityAuditAsync(tenantId, "InvalidPin", null, "Invalid Admin PIN verification attempt.");
                    return BadRequest(ApiResponse<bool>.CreateFailure("Invalid admin PIN.", "Validation Error", HttpContext.TraceIdentifier));
                }
                return Success(true, "Admin PIN verified successfully.");
            }
            catch (Exception ex)
            {
                return Failure<bool>(ex.Message, "PIN verification failed.");
            }
        }

        private string GetSecurityPinFilePath(Guid tenantId)
        {
            var dir = System.IO.Path.Combine(AppContext.BaseDirectory, "settings");
            if (!System.IO.Directory.Exists(dir))
            {
                System.IO.Directory.CreateDirectory(dir);
            }
            return System.IO.Path.Combine(dir, $"security-settings-{tenantId}.json");
        }

        private string? GetSecurityPinHash(Guid tenantId)
        {
            try
            {
                var company = _tenantContext.Companies.FirstOrDefault(c => !c.IsDeleted);
                if (company != null && !string.IsNullOrEmpty(company.AdminPinHash))
                {
                    return company.AdminPinHash;
                }
            }
            catch { }

            var path = GetSecurityPinFilePath(tenantId);
            if (!System.IO.File.Exists(path)) return null;
            try
            {
                var json = System.IO.File.ReadAllText(path);
                var dict = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                return dict != null && dict.TryGetValue("SecretPinHash", out var hash) ? hash : null;
            }
            catch
            {
                return null;
            }
        }

        private bool VerifySecurityPin(Guid tenantId, string pin)
        {
            if (string.IsNullOrWhiteSpace(pin)) return false;
            var hash = GetSecurityPinHash(tenantId);
            if (string.IsNullOrEmpty(hash)) return false;
            return _passwordHasher.VerifyPassword(pin.Trim(), hash);
        }

        private void SaveSecurityPinHash(Guid tenantId, string pinHash)
        {
            var path = GetSecurityPinFilePath(tenantId);
            var dict = new Dictionary<string, string> { { "SecretPinHash", pinHash } };
            var json = System.Text.Json.JsonSerializer.Serialize(dict);
            System.IO.File.WriteAllText(path, json);
        }

        private async Task LogSecurityAuditAsync(Guid tenantId, string action, string? employeeId, string reason)
        {
            try
            {
                var adminUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value ?? "System";
                var auditLog = new AuditLog
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    UserId = adminUserId,
                    UserEmail = GetCurrentUserEmail(),
                    Action = action,
                    TableName = "Users",
                    PrimaryKey = employeeId ?? "None",
                    OldValues = "{}",
                    NewValues = System.Text.Json.JsonSerializer.Serialize(new { Reason = reason }),
                    Timestamp = DateTime.UtcNow,
                    IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1",
                    Device = Request.Headers["User-Agent"].ToString() ?? "Unknown",
                    Reason = reason,
                    Module = "Security"
                };

                _tenantContext.AuditLogs.Add(auditLog);
                await _tenantContext.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SECURITY AUDIT LOG FAILURE - NON-BLOCKING]: {ex.Message}");
            }
        }

        [HttpGet("roles")]
        public async Task<ActionResult<ApiResponse<List<Role>>>> GetRoles()
        {
            try
            {
                var tenantId = GetTenantId();
                var hasOwner = await _tenantContext.Roles.AnyAsync(r => r.Code.ToUpper() == "OWNER" || r.Name.ToLower() == "owner");
                if (!hasOwner)
                {
                    _tenantContext.Roles.Add(new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Owner",
                        Code = "OWNER",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    });
                    await _tenantContext.SaveChangesAsync();
                }

                var hasAccountant = await _tenantContext.Roles.AnyAsync(r => r.Code.ToUpper() == "ACCOUNTANT" || r.Name.ToLower() == "accountant");
                if (!hasAccountant)
                {
                    var accountantRole = new Role
                    {
                        Id = Guid.NewGuid(),
                        Name = "Accountant",
                        Code = "ACCOUNTANT",
                        TenantId = tenantId,
                        CreatedAt = DateTime.UtcNow,
                        CreatedBy = "System"
                    };
                    _tenantContext.Roles.Add(accountantRole);
                    await _tenantContext.SaveChangesAsync();

                    var companyAdminRole = await _tenantContext.Roles.FirstOrDefaultAsync(r => r.Code.ToUpper() == "COMPANYADMIN" || r.Name.ToLower() == "companyadmin");
                    if (companyAdminRole != null)
                    {
                        var adminPerms = await _tenantContext.RolePermissions.Where(rp => rp.RoleId == companyAdminRole.Id).ToListAsync();
                        foreach (var ap in adminPerms)
                        {
                            _tenantContext.RolePermissions.Add(new RolePermission
                            {
                                RoleId = accountantRole.Id,
                                PermissionId = ap.PermissionId,
                                TenantId = tenantId
                            });
                        }
                        await _tenantContext.SaveChangesAsync();
                    }
                }

                var roles = await _tenantContext.Roles
                    .Where(r => r.Code.ToUpper() != "ADMIN" && r.Name.ToLower() != "admin")
                    .OrderBy(r => r.Name)
                    .ToListAsync();
                return Success(roles, "Roles loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<List<Role>>(ex.Message, "Failed to load roles.");
            }
        }

        [HttpGet("departments")]
        public async Task<ActionResult<ApiResponse<List<string>>>> GetDepartments()
        {
            try
            {
                var dbDepartments = new List<string>
                {
                    "Administration",
                    "Operations",
                    "Production",
                    "Sales",
                    "Finance",
                    "HR",
                    "IT Support",
                    "Quality"
                };

                return Success(dbDepartments, "Departments loaded successfully.");
            }
            catch (Exception ex)
            {
                return Failure<List<string>>(ex.Message, "Failed to load departments.");
            }
        }
    }
}
