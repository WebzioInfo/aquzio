using System;
using System.Collections.Generic;

namespace Aquora.Application.DTOs.QC
{
    public class WaterTestReportDto
    {
        public Guid Id { get; set; }
        public string ReportNumber { get; set; } = string.Empty;
        public string BatchNumber { get; set; } = string.Empty;
        public string? SampleNumber { get; set; }
        public DateTime? ProductionDate { get; set; }
        public string ReportType { get; set; } = "DAILY";
        public string Status { get; set; } = "DRAFT";
        public string ReportCompletionStatus { get; set; } = "DRAFT"; // DRAFT, IN_PROGRESS, PARTIALLY_COMPLETED, RESULTS_OVERDUE, COMPLETED
        public string CompletionStatus { get => ReportCompletionStatus; set => ReportCompletionStatus = value; }
        public DateTime? SampleTime { get; set; }
        public string? TestedBy { get; set; }
        public string? CollectedBy { get; set; }
        public string? VerifiedBy { get; set; }
        public string? Remarks { get; set; }
        public string? Attachments { get; set; }
        public string? ConcurrencyToken { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public string CreatedByName { get; set; } = string.Empty;

        // Result counts & timing indicators
        public int TotalParametersCount { get; set; }
        public int CompletedParametersCount { get; set; }
        public int PendingParametersCount { get; set; }
        public int OverdueParametersCount { get; set; }
        public bool HasOverdueResults { get; set; }
        public DateTime? EarliestDueAt { get; set; }

        public List<WaterTestResultDto> Results { get; set; } = new List<WaterTestResultDto>();
    }

    public class WaterTestParameterDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Frequency { get; set; } = "DAILY";
        public string Unit { get; set; } = string.Empty;
        public double? MinWarning { get; set; }
        public double? MinAcceptable { get; set; }
        public double? MaxAcceptable { get; set; }
        public double? MaxWarning { get; set; }
        public int RequiredDurationHours { get; set; } = 0; // 0 for immediate, 24/48/72 for incubation/delayed
    }

    public class WaterTestResultDto
    {
        public Guid Id { get; set; }
        public Guid ParameterId { get; set; }
        public string ParameterName { get; set; } = string.Empty;
        public string ParameterCategory { get; set; } = string.Empty;
        public string ParameterUnit { get; set; } = string.Empty;
        public double? MinWarning { get; set; }
        public double? MinAcceptable { get; set; }
        public double? MaxAcceptable { get; set; }
        public double? MaxWarning { get; set; }
        public double? Value { get; set; }
        public string? StringValue { get; set; }
        public bool IsPass { get; set; }
        public string QualityStatus { get; set; } = "PASS";

        // Time-based incubation & result lifecycle
        public int RequiredDurationHours { get; set; } = 0;
        public DateTime? StartedAt { get; set; }
        public DateTime? ExpectedCompletionAt { get; set; }
        public DateTime? ActualCompletedAt { get; set; }
        public string ResultStatus { get; set; } = "COMPLETED"; // NOT_STARTED, IN_PROGRESS, PENDING_RESULT, OVERDUE, COMPLETED, NOT_APPLICABLE
        public bool IsDelayed { get; set; }
        public bool IsOverdue { get; set; }
        public double? RemainingHours { get; set; }
        public double? HoursOverdue { get; set; }
    }

    public class CreateWaterTestReportRequest
    {
        public string BatchNumber { get; set; } = string.Empty;
        public string? SampleNumber { get; set; }
        public DateTime? ProductionDate { get; set; }
        public string ReportType { get; set; } = "DAILY";
        public string Status { get; set; } = "DRAFT";
        public DateTime? SampleTime { get; set; }
        public string? TestedBy { get; set; }
        public string? CollectedBy { get; set; }
        public string? VerifiedBy { get; set; }
        public string? Remarks { get; set; }
        public string? Attachments { get; set; }
        public string? ConcurrencyToken { get; set; }

        public List<CreateWaterTestResultRequest> Results { get; set; } = new List<CreateWaterTestResultRequest>();
    }

    public class CreateWaterTestResultRequest
    {
        public string? Id { get; set; }
        public string ParameterId { get; set; } = string.Empty; // Parameter name or Guid string
        public double? Value { get; set; }
        public string? StringValue { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? ExpectedCompletionAt { get; set; }
        public DateTime? ActualCompletedAt { get; set; }
        public string? ResultStatus { get; set; }
    }

    public class EnterSingleResultRequest
    {
        public double? Value { get; set; }
        public string? StringValue { get; set; }
        public string? ConcurrencyToken { get; set; }
        public string? Remarks { get; set; }
        public string? TestedBy { get; set; }
    }

    public class QCPendingTaskDto
    {
        public Guid ReportId { get; set; }
        public string ReportNumber { get; set; } = string.Empty;
        public string BatchNumber { get; set; } = string.Empty;
        public string? SampleNumber { get; set; }
        public Guid ParameterId { get; set; }
        public string ParameterName { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string ParameterCategory { get => Category; set => Category = value; }
        public string Unit { get; set; } = string.Empty;
        public int RequiredDurationHours { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? ExpectedCompletionAt { get; set; }
        public string Status { get; set; } = "IN_PROGRESS"; // IN_PROGRESS, DUE, OVERDUE
        public bool IsOverdue { get; set; }
        public double? HoursOverdue { get; set; }
        public double? RemainingHours { get; set; }
        public double HoursRemainingOrOverdue { get; set; }
        public string UrgencyLevel { get; set; } = "IN_PROGRESS"; // OVERDUE, DUE_TODAY, UPCOMING, IN_PROGRESS
    }

    public class WaterTestDashboardDto
    {
        public int TotalReports { get; set; }
        public int TodayReports { get; set; }
        public int PassedReports { get; set; }
        public int FailedReports { get; set; }
        public int PendingReports { get; set; }

        // Time-based result indicators
        public int ResultsDueTodayCount { get; set; }
        public int OverdueResultsCount { get; set; }
        public int ActiveIncubationsCount { get; set; }
        public int CompletedTodayCount { get; set; }
        public List<QCPendingTaskDto> PendingTasks { get; set; } = new List<QCPendingTaskDto>();

        public List<MonthlyReportStatDto> MonthlyStats { get; set; } = new List<MonthlyReportStatDto>();
        public List<WaterTestReportDto> RecentReports { get; set; } = new List<WaterTestReportDto>();
    }

    public class MonthlyReportStatDto
    {
        public string Month { get; set; } = string.Empty; // E.g. "Jan", "Feb"
        public int Passed { get; set; }
        public int Failed { get; set; }
    }

    public class ComplianceRecordDto
    {
        public Guid Id { get; set; }
        public Guid? ReportId { get; set; }
        public string ReferenceNumber { get; set; } = string.Empty;
        public string Type { get; set; } = "NCR";
        public string Severity { get; set; } = "HIGH";
        public string Status { get; set; } = "OPEN";
        public string ParameterName { get; set; } = string.Empty;
        public string BatchNumber { get; set; } = string.Empty;
        public string DefectDescription { get; set; } = string.Empty;
        public string? MeasuredValue { get; set; }
        public string? ExpectedRange { get; set; }
        public string? RootCauseAnalysis { get; set; }
        public string? CorrectiveAction { get; set; }
        public string? PreventiveAction { get; set; }
        public string AssignedTo { get; set; } = string.Empty;
        public DateTime? TargetResolutionDate { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public string? ResolvedBy { get; set; }
        public string? ResolutionNotes { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class ResolveComplianceRequest
    {
        public string RootCauseAnalysis { get; set; } = string.Empty;
        public string CorrectiveAction { get; set; } = string.Empty;
        public string PreventiveAction { get; set; } = string.Empty;
        public string ResolutionNotes { get; set; } = string.Empty;
    }

    public class QCSettingsDto
    {
        public bool AutoGenerateCAPAOnFailure { get; set; } = true;
        public bool RequireVerificationBeforeSubmit { get; set; } = false;
        public string StandardComplianceType { get; set; } = "BIS_IS_14543";
        public string DigitalSignatureTitle { get; set; } = "Quality Assurance Manager";
        public string LabAddress { get; set; } = string.Empty;
        public string ContactEmail { get; set; } = string.Empty;
        public string NotificationRecipients { get; set; } = string.Empty;

        // Regulatory & Plant Licenses
        public string? FssaiNumber { get; set; }
        public string? BisNumber { get; set; }
        public string? AdditionalLicensesJson { get; set; }
    }

    public class QCAuditLogDto
    {
        public Guid Id { get; set; }
        public Guid? ReportId { get; set; }
        public string? ReportNumber { get; set; }
        public string Action { get; set; } = string.Empty;
        public string PerformedBy { get; set; } = string.Empty;
        public string? UserRole { get; set; }
        public DateTime Timestamp { get; set; }
        public string Details { get; set; } = string.Empty;
        public string? IPAddress { get; set; }
    }
}
