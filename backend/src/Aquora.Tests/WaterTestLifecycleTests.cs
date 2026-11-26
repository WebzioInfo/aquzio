using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using Aquora.Application.DTOs.QC;
using Aquora.Application.Interfaces;
using Aquora.Application.Interfaces.Services;
using Aquora.Application.Services;
using Aquora.Domain.Entities;
using Aquora.Domain.Entities.QC;
using Aquora.Persistence.Context;

namespace Aquora.Tests
{
    public class WaterTestLifecycleTests
    {
        private static (TenantDbContext TenantDb, PlatformDbContext PlatformDb, WaterTestService Service) CreateFixture(Guid tenantId, string schema = "tenant_a")
        {
            var dbName = Guid.NewGuid().ToString();
            var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>()
                .UseInMemoryDatabase(dbName)
                .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
                .Options;

            var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;

            var tenantProvider = new Mock<ITenantProvider>();
            tenantProvider.Setup(p => p.TenantId).Returns(tenantId);
            tenantProvider.Setup(p => p.TenantSchemaName).Returns(schema);

            var currentUser = new Mock<ICurrentUserContext>();
            currentUser.Setup(c => c.TenantId).Returns(tenantId);
            currentUser.Setup(c => c.UserId).Returns(Guid.NewGuid().ToString());
            currentUser.Setup(c => c.Email).Returns("qc@aquzio.com");
            currentUser.Setup(c => c.Roles).Returns(new List<string> { "QC", "CompanyAdmin" });

            var tenantDb = new TenantDbContext(tenantOptions, tenantProvider.Object, currentUser.Object);
            var platformDb = new PlatformDbContext(platformOptions, currentUser.Object);

            tenantDb.Companies.Add(new Company
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Name = "Test Plant",
                Code = "TEST",
                IsActive = true
            });
            tenantDb.SaveChanges();

            var service = new WaterTestService(
                tenantDb,
                platformDb,
                tenantProvider.Object,
                currentUser.Object,
                new QualityEvaluationService(),
                new Mock<IQCPdfCertificateService>().Object,
                new Mock<ILogger<WaterTestService>>().Object
            );

            return (tenantDb, platformDb, service);
        }

        private static async Task<List<WaterTestParameter>> SeedCustomParametersAsync(TenantDbContext db, int dailyCount, int weeklyCount, int incubatedDailyIndex = -1)
        {
            var list = new List<WaterTestParameter>();
            for (int i = 0; i < dailyCount; i++)
            {
                var p = new WaterTestParameter
                {
                    Id = Guid.NewGuid(),
                    Name = $"DailyParam_{i + 1}",
                    Category = i == incubatedDailyIndex ? "MICROBIOLOGY" : "PHYSICAL",
                    Frequency = "DAILY",
                    Unit = "mg/L",
                    MinAcceptable = 0,
                    MaxAcceptable = 100,
                    RequiredDurationHours = i == incubatedDailyIndex ? 24 : 0,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "Test"
                };
                list.Add(p);
                db.WaterTestParameters.Add(p);
            }
            for (int i = 0; i < weeklyCount; i++)
            {
                var p = new WaterTestParameter
                {
                    Id = Guid.NewGuid(),
                    Name = $"WeeklyParam_{i + 1}",
                    Category = "CHEMICAL",
                    Frequency = "WEEKLY",
                    Unit = "mg/L",
                    MinAcceptable = 0,
                    MaxAcceptable = 50,
                    RequiredDurationHours = 0,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    CreatedBy = "Test"
                };
                list.Add(p);
                db.WaterTestParameters.Add(p);
            }
            await db.SaveChangesAsync();
            return list;
        }

        [Fact]
        public async Task Scenario1_DailyReport_AllParametersCompleted_ShouldBeCompleted()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            var allParams = await SeedCustomParametersAsync(db, dailyCount: 13, weeklyCount: 5);

            var dailyParams = allParams.Where(p => p.Frequency == "DAILY").ToList();
            var req = new CreateWaterTestReportRequest
            {
                BatchNumber = "B-001",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow,
                Results = dailyParams.Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 7.2 }).ToList()
            };

            var created = await service.CreateWaterTestReportAsync(req);
            Assert.Equal(13, created.TotalParametersCount);
            Assert.Equal(13, created.CompletedParametersCount);
            Assert.Equal(0, created.PendingParametersCount);
            Assert.Equal("COMPLETED", created.ReportCompletionStatus);
        }

        [Fact]
        public async Task Scenario2And3And5_DailyReport_12Of13With24hIncubation_ShouldBePendingUntil13thEntered()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            var allParams = await SeedCustomParametersAsync(db, dailyCount: 13, weeklyCount: 5, incubatedDailyIndex: 12);

            var dailyParams = allParams.Where(p => p.Frequency == "DAILY").ToList();
            var sampleTime = DateTime.UtcNow;

            // Submit only 12 results (omit the 13th incubated parameter)
            var req = new CreateWaterTestReportRequest
            {
                BatchNumber = "B-002",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = sampleTime,
                Results = dailyParams.Take(12).Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 10.0 }).ToList()
            };

            var created = await service.CreateWaterTestReportAsync(req);
            Assert.Equal(13, created.TotalParametersCount);
            Assert.Equal(12, created.CompletedParametersCount);
            Assert.Equal(1, created.PendingParametersCount);
            Assert.Equal("PARTIALLY_COMPLETED", created.ReportCompletionStatus);

            var pendingParam = dailyParams[12];
            var pendingRow = Assert.Single(created.Results, r => r.ParameterId == pendingParam.Id);
            Assert.Equal("IN_PROGRESS", pendingRow.ResultStatus);
            Assert.Equal(24, pendingRow.RequiredDurationHours);
            Assert.NotNull(pendingRow.ExpectedCompletionAt);

            // Scenario 5: Enter the 13th result later via EnterSingleParameterResultAsync
            var updated = await service.EnterSingleParameterResultAsync(created.Id, pendingParam.Id, new EnterSingleResultRequest
            {
                StringValue = "Absent",
                ConcurrencyToken = created.ConcurrencyToken
            });

            Assert.NotNull(updated);
            Assert.Equal(13, updated!.TotalParametersCount);
            Assert.Equal(13, updated.CompletedParametersCount);
            Assert.Equal(0, updated.PendingParametersCount);
            Assert.Equal("COMPLETED", updated.ReportCompletionStatus);
            Assert.Equal("SUBMITTED", updated.Status); // Workflow status preserved
            var completedRow = Assert.Single(updated.Results, r => r.ParameterId == pendingParam.Id);
            Assert.Equal("COMPLETED", completedRow.ResultStatus);
            Assert.NotNull(completedRow.ActualCompletedAt);
        }

        [Fact]
        public async Task Scenario4_WeeklyReport_ShouldHaveIndependentParameterCount()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            await SeedCustomParametersAsync(db, dailyCount: 10, weeklyCount: 6);

            var req = new CreateWaterTestReportRequest
            {
                BatchNumber = "B-WK-1",
                ReportType = "WEEKLY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow,
                Results = new List<CreateWaterTestResultRequest>()
            };

            var created = await service.CreateWaterTestReportAsync(req);
            Assert.Equal(6, created.TotalParametersCount);
            Assert.Equal(0, created.CompletedParametersCount);
            Assert.Equal("IN_PROGRESS", created.ReportCompletionStatus);
        }

        [Fact]
        public async Task Scenario6_OverdueIncubatedResult_ShouldMarkResultsOverdueAndNotCompleted()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            var allParams = await SeedCustomParametersAsync(db, dailyCount: 3, weeklyCount: 0, incubatedDailyIndex: 2);

            var req = new CreateWaterTestReportRequest
            {
                BatchNumber = "B-OVD-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow.AddHours(-30), // 24h incubation expired 6h ago
                Results = allParams.Take(2).Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 5.0 }).ToList()
            };

            var created = await service.CreateWaterTestReportAsync(req);
            Assert.Equal(3, created.TotalParametersCount);
            Assert.Equal(2, created.CompletedParametersCount);
            Assert.Equal(1, created.OverdueParametersCount);
            Assert.Equal("RESULTS_OVERDUE", created.ReportCompletionStatus);
        }

        [Fact]
        public async Task Scenario7_EditingReportWithPendingParameters_ShouldPreservePendingRows()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            var allParams = await SeedCustomParametersAsync(db, dailyCount: 4, weeklyCount: 0, incubatedDailyIndex: 3);

            var created = await service.CreateWaterTestReportAsync(new CreateWaterTestReportRequest
            {
                BatchNumber = "B-EDIT-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow,
                Results = allParams.Take(3).Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 4.0 }).ToList()
            });

            var originalPendingId = created.Results.Single(r => r.ParameterId == allParams[3].Id).Id;

            // Update report omitting the pending row in request.Results
            var updated = await service.UpdateWaterTestReportAsync(created.Id, new CreateWaterTestReportRequest
            {
                BatchNumber = "B-EDIT-1-REV",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                ConcurrencyToken = created.ConcurrencyToken,
                Results = allParams.Take(3).Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 4.5 }).ToList()
            });

            Assert.NotNull(updated);
            Assert.Equal(4, updated!.TotalParametersCount);
            Assert.Equal(3, updated.CompletedParametersCount);
            Assert.Equal("PARTIALLY_COMPLETED", updated.ReportCompletionStatus);
            Assert.Contains(updated.Results, r => r.Id == originalPendingId && r.ResultStatus == "IN_PROGRESS");
        }

        [Fact]
        public async Task Scenario8And9_FrequencyChangeAndHistoricalSnapshot_ShouldNotAlterHistoricalReport()
        {
            var tenantId = Guid.NewGuid();
            var (db, _, service) = CreateFixture(tenantId);
            var allParams = await SeedCustomParametersAsync(db, dailyCount: 3, weeklyCount: 2);

            // Create historical Daily report (3 parameters)
            var historical = await service.CreateWaterTestReportAsync(new CreateWaterTestReportRequest
            {
                BatchNumber = "B-HIST-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow,
                Results = allParams.Where(p => p.Frequency == "DAILY")
                    .Select(p => new CreateWaterTestResultRequest { ParameterId = p.Id.ToString(), Value = 6.5 }).ToList()
            });
            Assert.Equal(3, historical.TotalParametersCount);

            // Change one WEEKLY parameter to DAILY
            var weeklyParam = allParams.First(p => p.Frequency == "WEEKLY");
            await service.CreateOrUpdateParameterAsync(new WaterTestParameterDto
            {
                Id = weeklyParam.Id,
                Name = weeklyParam.Name,
                Category = weeklyParam.Category,
                Frequency = "DAILY",
                Unit = weeklyParam.Unit,
                MinAcceptable = weeklyParam.MinAcceptable,
                MaxAcceptable = weeklyParam.MaxAcceptable,
                RequiredDurationHours = weeklyParam.RequiredDurationHours
            });

            // Historical report must still have 3/3 and COMPLETED
            var reloadedHistorical = await service.GetWaterTestReportByIdAsync(historical.Id);
            Assert.Equal(3, reloadedHistorical!.TotalParametersCount);
            Assert.Equal(3, reloadedHistorical.CompletedParametersCount);
            Assert.Equal("COMPLETED", reloadedHistorical.ReportCompletionStatus);

            // New Daily report must now have 4 parameters
            var newDaily = await service.CreateWaterTestReportAsync(new CreateWaterTestReportRequest
            {
                BatchNumber = "B-NEW-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                SampleTime = DateTime.UtcNow,
                Results = new List<CreateWaterTestResultRequest>()
            });
            Assert.Equal(4, newDaily.TotalParametersCount);
        }

        [Fact]
        public async Task Scenario10_TenantIsolation_ShouldKeepReportsSeparateBetweenTenants()
        {
            var tenantA = Guid.NewGuid();
            var tenantB = Guid.NewGuid();
            var (dbA, _, serviceA) = CreateFixture(tenantA, "tenant_a");
            var (dbB, _, serviceB) = CreateFixture(tenantB, "tenant_b");

            await SeedCustomParametersAsync(dbA, dailyCount: 5, weeklyCount: 2);
            await SeedCustomParametersAsync(dbB, dailyCount: 8, weeklyCount: 4);

            var reportA = await serviceA.CreateWaterTestReportAsync(new CreateWaterTestReportRequest
            {
                BatchNumber = "TA-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                Results = new List<CreateWaterTestResultRequest>()
            });
            var reportB = await serviceB.CreateWaterTestReportAsync(new CreateWaterTestReportRequest
            {
                BatchNumber = "TB-1",
                ReportType = "DAILY",
                Status = "SUBMITTED",
                Results = new List<CreateWaterTestResultRequest>()
            });

            Assert.Equal(5, reportA.TotalParametersCount);
            Assert.Equal(8, reportB.TotalParametersCount);

            var listA = await serviceA.GetWaterTestReportsAsync(1, 20, null, null, null, null, null);
            Assert.Single(listA.Items);
            Assert.Equal("TA-1", listA.Items[0].BatchNumber);
        }
    }
}

