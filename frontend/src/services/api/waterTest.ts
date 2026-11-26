import { api, getDeduplicated } from '../api';

export interface WaterTestParameter {
    id: string;
    name: string;
    category: string;
    frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | string;
    unit: string;
    minWarning?: number | null;
    minAcceptable?: number | null;
    maxAcceptable?: number | null;
    maxWarning?: number | null;
    requiredDurationHours?: number;
}

export type ParameterResultLifecycleStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_RESULT' | 'OVERDUE' | 'COMPLETED' | 'NOT_APPLICABLE';

export interface WaterTestResult {
    id: string;
    parameterId: string;
    parameterName: string;
    parameterCategory: string;
    parameterUnit: string;
    minWarning?: number | null;
    minAcceptable?: number | null;
    maxAcceptable?: number | null;
    maxWarning?: number | null;
    value?: number | null;
    stringValue?: string | null;
    isPass: boolean;
    qualityStatus: string;
    requiredDurationHours?: number;
    startedAt?: string | null;
    expectedCompletionAt?: string | null;
    actualCompletedAt?: string | null;
    resultStatus?: ParameterResultLifecycleStatus;
}

export interface WaterTestReport {
    id: string;
    reportNumber: string;
    batchNumber: string;
    sampleNumber?: string | null;
    productionDate?: string | null;
    reportType: string;
    status: string;
    sampleTime?: string | null;
    testedBy?: string | null;
    collectedBy?: string | null;
    verifiedBy?: string | null;
    remarks?: string | null;
    attachments?: string | null;
    concurrencyToken?: string | null;
    createdAt: string;
    createdBy: string;
    createdByName: string;
    completionStatus?: string;
    totalParametersCount?: number;
    completedParametersCount?: number;
    pendingParametersCount?: number;
    overdueParametersCount?: number;
    earliestPendingDueDate?: string | null;
    results: WaterTestResult[];
}

export interface CreateWaterTestReportRequest {
    batchNumber: string;
    sampleNumber?: string | null;
    productionDate?: string | null;
    reportType: string;
    status: string;
    sampleTime?: string | null;
    testedBy?: string | null;
    collectedBy?: string | null;
    verifiedBy?: string | null;
    remarks?: string | null;
    attachments?: string | null;
    concurrencyToken?: string | null;
    results: {
        id?: string | null;
        parameterId: string;
        value?: number | null;
        stringValue?: string | null;
        startedAt?: string | null;
        expectedCompletionAt?: string | null;
        actualCompletedAt?: string | null;
        resultStatus?: ParameterResultLifecycleStatus;
        requiredDurationHours?: number;
    }[];
}

export interface EnterSingleResultRequest {
    value?: number | null;
    stringValue?: string | null;
    testedBy?: string | null;
    remarks?: string | null;
    startedAt?: string | null;
    concurrencyToken?: string | null;
}

export interface QCPendingTask {
    reportId: string;
    reportNumber: string;
    batchNumber: string;
    sampleNumber?: string | null;
    reportType: string;
    parameterId: string;
    parameterName: string;
    parameterCategory: string;
    unit: string;
    requiredDurationHours: number;
    startedAt?: string | null;
    expectedCompletionAt?: string | null;
    status: string;
    hoursRemainingOrOverdue: number;
    urgencyLevel: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'IN_PROGRESS';
}

export interface MonthlyReportStat {
    month: string;
    passed: number;
    failed: number;
}

export interface WaterTestDashboard {
    totalReports: number;
    todayReports: number;
    passedReports: number;
    failedReports: number;
    pendingReports: number;
    overdueTasksCount?: number;
    dueTodayTasksCount?: number;
    inProgressTasksCount?: number;
    pendingTasks?: QCPendingTask[];
    monthlyStats: MonthlyReportStat[];
    recentReports: WaterTestReport[];
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
}

export interface ComplianceRecord {
    id: string;
    reportId?: string | null;
    referenceNumber: string;
    type: string;
    severity: string;
    status: string;
    parameterName: string;
    batchNumber: string;
    defectDescription: string;
    measuredValue?: string | null;
    expectedRange?: string | null;
    rootCauseAnalysis?: string | null;
    correctiveAction?: string | null;
    preventiveAction?: string | null;
    assignedTo: string;
    targetResolutionDate?: string | null;
    resolvedAt?: string | null;
    resolvedBy?: string | null;
    resolutionNotes?: string | null;
    createdAt: string;
    createdBy: string;
}

export interface ResolveComplianceRequest {
    rootCauseAnalysis: string;
    correctiveAction: string;
    preventiveAction: string;
    resolutionNotes: string;
}

export interface CustomLicenseItem {
    name: string;
    number: string;
}

export interface QCSettings {
    autoGenerateCAPAOnFailure: boolean;
    requireVerificationBeforeSubmit: boolean;
    standardComplianceType: string;
    digitalSignatureTitle: string;
    labAddress: string;
    contactEmail: string;
    notificationRecipients: string;
    fssaiNumber?: string;
    bisNumber?: string;
    additionalLicensesJson?: string;
}

export interface QCAuditLog {
    id: string;
    reportId?: string | null;
    reportNumber?: string | null;
    action: string;
    performedBy: string;
    userRole?: string | null;
    timestamp: string;
    details: string;
    ipAddress?: string | null;
}

export const waterTestApi = {
    getDashboard: () => api.get<WaterTestDashboard>('/api/v1/qc/water-test/dashboard'),
    
    getReports: (params: { pageNumber?: number; pageSize?: number; search?: string; type?: string; status?: string; startDate?: string; endDate?: string }) => 
        getDeduplicated<PagedResult<WaterTestReport>>('/api/v1/qc/water-test/reports', { params }),
    
    getReportById: (id: string) => api.get<WaterTestReport>(`/api/v1/qc/water-test/reports/${id}`),
    
    createReport: (data: CreateWaterTestReportRequest) => api.post<WaterTestReport>('/api/v1/qc/water-test/reports', data),
    
    updateReport: (id: string, data: CreateWaterTestReportRequest) => api.put<WaterTestReport>(`/api/v1/qc/water-test/reports/${id}`, data),
    
    deleteReport: (id: string) => api.delete(`/api/v1/qc/water-test/reports/${id}`),

    enterSingleResult: (reportId: string, parameterId: string, data: EnterSingleResultRequest) =>
        api.post<WaterTestReport>(`/api/v1/qc/water-test/reports/${reportId}/results/${parameterId}`, data),

    getTasks: () => api.get<QCPendingTask[]>('/api/v1/qc/water-test/tasks'),

    getReminders: () => api.get<QCPendingTask[]>('/api/v1/qc/water-test/reminders'),
    
    getParameters: () => api.get<WaterTestParameter[]>('/api/v1/qc/water-test/parameters'),
 
    saveParameter: (param: Partial<WaterTestParameter>) => api.post<WaterTestParameter>('/api/v1/qc/water-test/parameters', param),

    // Compliance (NCR/CAPA)
    getComplianceRecords: () => api.get<ComplianceRecord[]>('/api/v1/qc/water-test/compliance'),

    resolveComplianceRecord: (id: string, data: ResolveComplianceRequest) =>
        api.post(`/api/v1/qc/water-test/compliance/${id}/resolve`, data),

    // QC Settings & Audit Logs
    getSettings: () => api.get<QCSettings>('/api/v1/qc/water-test/settings'),

    updateSettings: (settings: QCSettings) => api.put<QCSettings>('/api/v1/qc/water-test/settings', settings),

    getAuditLogs: (reportId?: string) => api.get<QCAuditLog[]>('/api/v1/qc/water-test/audit-logs', { params: { reportId } }),

    downloadReportPdf: (id: string) => api.get(`/api/v1/qc/water-test/reports/${id}/pdf`, { responseType: 'blob' })
};

export interface FormattedLimitsDisplay {
    standardText: string;
    warningText: string | null;
}

export function formatParameterLimitsDisplay(param: WaterTestParameter): FormattedLimitsDisplay {
    if (!param) return { standardText: '—', warningText: null };

    const pName = (param.name || '').toLowerCase().trim();
    const unit = param.unit && param.unit !== '—' && param.unit !== 'Descriptor' ? ` ${param.unit}` : '';

    if (['colour', 'color', 'odour', 'odor', 'taste'].includes(pName)) {
        return {
            standardText: 'Agreeable',
            warningText: null
        };
    }

    if (param.category === 'MICROBIOLOGY') {
        const isAmc = pName.includes('aerobic') || pName.includes('amc');
        const is22 = pName.includes('22');
        const is37 = pName.includes('37');
        if (isAmc) {
            if (is22) return { standardText: '<= 100 CFU/ml', warningText: null };
            if (is37) return { standardText: '<= 20 CFU/ml', warningText: null };
            return { standardText: '<= 100 CFU/ml', warningText: null };
        }
        return { standardText: 'Absent / 250ml', warningText: null };
    }

    const minWarn = param.minWarning !== null && param.minWarning !== undefined && String(param.minWarning).trim() !== '' ? Number(param.minWarning) : null;
    const minAcc = param.minAcceptable !== null && param.minAcceptable !== undefined && String(param.minAcceptable).trim() !== '' ? Number(param.minAcceptable) : null;
    const maxAcc = param.maxAcceptable !== null && param.maxAcceptable !== undefined && String(param.maxAcceptable).trim() !== '' ? Number(param.maxAcceptable) : null;
    const maxWarn = param.maxWarning !== null && param.maxWarning !== undefined && String(param.maxWarning).trim() !== '' ? Number(param.maxWarning) : null;

    // Standard range text
    let standardText = '—';
    if (minAcc !== null && maxAcc !== null) {
        standardText = `${minAcc} – ${maxAcc}${unit}`;
    } else if (maxAcc !== null) {
        standardText = `<= ${maxAcc}${unit}`;
    } else if (minAcc !== null) {
        standardText = `>= ${minAcc}${unit}`;
    }

    // Warning range text
    const warningParts: string[] = [];

    // Lower warning zone: [minWarn .. < minAcc]
    if (minWarn !== null && minAcc !== null) {
        if (minWarn < minAcc) {
            warningParts.push(`${minWarn} – < ${minAcc}`);
        } else {
            warningParts.push(`Warn Min: ${minWarn}`);
        }
    } else if (minWarn !== null && minAcc === null) {
        warningParts.push(`< ${minWarn}`);
    }

    // Upper warning zone: [> maxAcc .. maxWarn]
    if (maxWarn !== null && maxAcc !== null) {
        if (maxWarn > maxAcc) {
            warningParts.push(`> ${maxAcc} – ${maxWarn}`);
        } else {
            warningParts.push(`Warn Max: ${maxWarn}`);
        }
    } else if (maxWarn !== null && maxAcc === null) {
        warningParts.push(`> ${maxWarn}`);
    }

    let warningText: string | null = null;
    if (warningParts.length > 0) {
        warningText = `Warning: ${warningParts.join(', ')}${unit}`;
    }

    return {
        standardText,
        warningText
    };
}

export function evaluateWaterTestParameterStatus(
    param: WaterTestParameter,
    valueStr?: string | number | null,
    strVal?: string | null
): 'PASS' | 'FAIL' | 'WARNING' | 'NOT_ENTERED' {
    if (!param) return 'NOT_ENTERED';

    const pName = (param.name || '').toLowerCase().trim();
    const category = (param.category || '').toUpperCase().trim();

    // 1. Qualitative Descriptors (Colour, Odour, Taste)
    if (['colour', 'color', 'odour', 'odor', 'taste'].includes(pName)) {
        if (strVal === undefined || strVal === null || strVal.trim() === '' || strVal === '—' || strVal.toLowerCase() === 'not entered') {
            return 'NOT_ENTERED';
        }
        const s = strVal.trim().toLowerCase();
        if (s === 'agreeable' || s === 'unobjectionable') return 'PASS';
        if (s === 'not agreeable' || s === 'objectionable') return 'FAIL';
        return 'FAIL';
    }

    // 2. Microbiology
    if (category === 'MICROBIOLOGY') {
        const isAmc = pName.includes('aerobic') || pName.includes('amc');
        if (isAmc) {
            if (strVal === undefined || strVal === null || strVal.trim() === '' || strVal === '—' || strVal === 'Select...' || strVal.toLowerCase() === 'not entered') {
                return 'NOT_ENTERED';
            }
            const s = strVal.trim().toLowerCase();
            if (s === 'absent') return 'PASS';
            if (s === 'present') return 'FAIL';
            if (s === 'enter count' || s === 'enter count...') {
                if (valueStr === undefined || valueStr === null || String(valueStr).trim() === '') {
                    return 'NOT_ENTERED';
                }
                const num = typeof valueStr === 'number' ? valueStr : parseFloat(String(valueStr));
                if (isNaN(num)) return 'NOT_ENTERED';
                if (num < 0) return 'FAIL';

                const is22 = pName.includes('22');
                const maxLimit = param.maxAcceptable !== null && param.maxAcceptable !== undefined ? Number(param.maxAcceptable) : (is22 ? 100 : 20);
                return num <= maxLimit ? 'PASS' : 'FAIL';
            }
            return 'FAIL';
        } else {
            if (strVal === undefined || strVal === null || strVal.trim() === '' || strVal === '—' || strVal === 'Select...' || strVal.toLowerCase() === 'not entered') {
                return 'NOT_ENTERED';
            }
            const s = strVal.trim().toLowerCase();
            if (s === 'absent') return 'PASS';
            if (s === 'present') return 'FAIL';
            return 'FAIL';
        }
    }

    // 3. Numeric Parameters
    if (valueStr === undefined || valueStr === null || String(valueStr).trim() === '' || String(valueStr).trim() === '—') {
        return 'NOT_ENTERED';
    }
    const val = typeof valueStr === 'number' ? valueStr : parseFloat(String(valueStr));
    if (isNaN(val)) return 'NOT_ENTERED';

    const minWarn = param.minWarning !== null && param.minWarning !== undefined && String(param.minWarning).trim() !== '' ? Number(param.minWarning) : null;
    const minAcc = param.minAcceptable !== null && param.minAcceptable !== undefined && String(param.minAcceptable).trim() !== '' ? Number(param.minAcceptable) : null;
    const maxAcc = param.maxAcceptable !== null && param.maxAcceptable !== undefined && String(param.maxAcceptable).trim() !== '' ? Number(param.maxAcceptable) : null;
    const maxWarn = param.maxWarning !== null && param.maxWarning !== undefined && String(param.maxWarning).trim() !== '' ? Number(param.maxWarning) : null;

    // Step A: Lower Bound Evaluation
    if (minWarn !== null && val < minWarn) {
        return 'FAIL';
    }
    if (minWarn !== null && minAcc !== null && val >= minWarn && val < minAcc) {
        return 'WARNING';
    }
    if (minWarn === null && minAcc !== null && val < minAcc) {
        return 'FAIL';
    }

    // Step B: Upper Bound Evaluation
    if (maxWarn !== null && val > maxWarn) {
        return 'FAIL';
    }
    if (maxWarn !== null && maxAcc !== null && val > maxAcc && val <= maxWarn) {
        return 'WARNING';
    }
    if (maxWarn === null && maxAcc !== null && val > maxAcc) {
        return 'FAIL';
    }

    // Step C: Standard Acceptable Range
    return 'PASS';
}
