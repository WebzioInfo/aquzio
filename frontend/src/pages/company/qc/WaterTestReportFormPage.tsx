import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Beaker,
  FileText,
  Save,
  Send,
  Upload,
  FlaskConical,
  Activity,
  CheckCircle2,
  AlertCircle,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '../../../utils/toast';

import PageContainer from '../../../components/ui/layout/PageContainer';
import PageHeader from '../../../components/ui/layout/PageHeader';
import { EnterpriseCard } from '../../../components/ui/EnterpriseCard';
import { EnterpriseInput } from '../../../components/ui/EnterpriseInput';
import { EnterpriseSelect } from '../../../components/ui/EnterpriseSelect';
import { EnterpriseButton } from '../../../components/ui/EnterpriseButton';
import { EnterpriseBadge } from '../../../components/ui/EnterpriseBadge';
import { EnterpriseLoading } from '../../../components/ui/EnterpriseLoading';
import { BatchNumberSuggestion } from '../../../components/batch/BatchNumberSuggestion';
import { api } from '../../../services/api';

import {
  waterTestApi,
  evaluateWaterTestParameterStatus,
  formatParameterLimitsDisplay
} from '../../../services/api/waterTest';
import type {
  WaterTestParameter,
  CreateWaterTestReportRequest
} from '../../../services/api/waterTest';

// Standard BQMS Parameter Order Definitions
const PHYSICAL_CHEMICAL_ORDER = [
  'pH',
  'TDS',
  'Turbidity',
  'Sulphate',
  'Colour',
  'Odour',
  'Taste',
  'Residual Free Chlorine',
  'Alkalinity',
  'Chloride'
];

const MICROBIOLOGY_ORDER = [
  'E.coli',
  'Coliform',
  'Pseudomonas',
  'Clostridia',
  'Aerobic Microbial Count 22°C',
  'Aerobic Microbial Count 37°C',
  'Yeast & Mold'
];

import { useAuthStore } from '../../../store/useAuthStore';
import { isOwnerUser } from '../../../utils/permissions';

export const WaterTestReportFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const location = useLocation();
  const isCompanyContext = location.pathname.startsWith('/company');
  const basePath = isCompanyContext ? '/company/qc/water-test' : '/qc/water-tests';

  const { user } = useAuthStore();

  useEffect(() => {
    if (isOwnerUser(user)) {
      navigate(basePath, { replace: true });
    }
  }, [user, navigate, basePath]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = React.useRef(false);
  const [concurrencyToken, setConcurrencyToken] = useState<string | null>(null);

  const [parameters, setParameters] = useState<WaterTestParameter[]>([]);
  const [reportNumber, setReportNumber] = useState('');

  // Form Fields
  const [badgeLetters, setBadgeLetters] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [sampleNumber, setSampleNumber] = useState('');
  const [reportType, setReportType] = useState('DAILY');
  const [showAllParameters, setShowAllParameters] = useState(false);
  const [productionDate, setProductionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sampleTime, setSampleTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [testedBy, setTestedBy] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachments, setAttachments] = useState('');

  // Parameter Results Map: key -> { id, value, stringValue }. The ID keeps an
  // existing result tied to its tracked database row on subsequent edits.
  const [results, setResults] = useState<Record<string, { id?: string; value?: string; stringValue?: string }>>({});

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      try {
        const cached = localStorage.getItem('aquzio_company_profile');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.badgeLetters) setBadgeLetters(parsed.badgeLetters.toUpperCase());
        }
        const settingsRes = await api.get('/api/v1/company/settings');
        if (settingsRes.data?.data?.badgeLetters) {
          setBadgeLetters(settingsRes.data.data.badgeLetters.toUpperCase());
        }
      } catch {}

      const paramsRes = await waterTestApi.getParameters();
      setParameters(paramsRes.data);

      if (id) {
        const reportRes = await waterTestApi.getReportById(id);
        const r = reportRes.data;
        setReportNumber(r.reportNumber);
        setBatchNumber(r.batchNumber);
        setSampleNumber(r.sampleNumber || '');
        setReportType(r.reportType || 'DAILY');
        setProductionDate(r.productionDate ? format(new Date(r.productionDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
        setSampleTime(r.sampleTime ? format(new Date(r.sampleTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setTestedBy(r.testedBy || '');
        setCollectedBy(r.collectedBy || '');
        setVerifiedBy(r.verifiedBy || '');
        setRemarks(r.remarks || '');
        setAttachments(r.attachments || '');
        setConcurrencyToken(r.concurrencyToken || null);

        const mapped: Record<string, { id?: string; value?: string; stringValue?: string }> = {};
        r.results.forEach(res => {
          let strVal = res.stringValue || '';
          const valStr = res.value !== null && res.value !== undefined ? res.value.toString() : '';
          const pName = (res.parameterName || '').toLowerCase();
          if (valStr !== '' && (!strVal || strVal === '')) {
            if (pName.includes('aerobic') || pName.includes('amc')) {
              strVal = 'Enter Count';
            }
          }

          const resData = {
            id: res.id,
            value: valStr,
            stringValue: strVal
          };

          if (res.parameterId) {
            mapped[res.parameterId] = resData;
          }
          if (res.parameterName) {
            mapped[res.parameterName] = resData;
            mapped[res.parameterName.toLowerCase().trim()] = resData;
          }
        });
        setResults(mapped);
      }
    } catch (error) {
      toast.error('Failed to load form data');
    } finally {
      setIsLoading(false);
    }
  };

  const getParamResult = (param: WaterTestParameter) => {
    return results[param.id] || results[param.name] || results[param.name?.toLowerCase().trim()];
  };

  const updateParamResult = (
    param: WaterTestParameter,
    updates: { value?: string; stringValue?: string }
  ) => {
    setResults(prev => {
      const existing = prev[param.id] || prev[param.name] || prev[param.name?.toLowerCase().trim()] || {};
      const updated = {
        ...existing,
        ...updates
      };
      const next = { ...prev };
      if (param.id) next[param.id] = updated;
      if (param.name) {
        next[param.name] = updated;
        next[param.name.toLowerCase().trim()] = updated;
      }
      return next;
    });
  };

  const handleResultChange = (param: WaterTestParameter, field: 'value' | 'stringValue', val: string) => {
    updateParamResult(param, { [field]: val });
  };

  // Check if a parameter is included based on the selected report type
  const isParamAllowedByReportType = (param: WaterTestParameter) => {
    if (showAllParameters) return true;

    // Always keep if an existing value has already been recorded/entered
    const res = getParamResult(param);
    const hasValue = Boolean(
      (res?.value && res.value.trim() !== '') ||
      (res?.stringValue && res.stringValue.trim() !== '')
    );
    if (hasValue) return true;

    const freq = (param.frequency || 'DAILY').toUpperCase();
    if (reportType === 'DAILY') {
      return freq === 'DAILY';
    }
    if (reportType === 'WEEKLY') {
      return freq === 'DAILY' || freq === 'WEEKLY';
    }
    // MONTHLY or EXTERNAL_LAB includes all
    return true;
  };

  // Group and sort Physical & Chemical parameters from database
  const physicalChemicalParams = useMemo(() => {
    const filtered = parameters
      .filter(p => p.category === 'PHYSICAL' || p.category === 'CHEMICAL')
      .filter(isParamAllowedByReportType);
    const uniqueMap = new Map<string, WaterTestParameter>();
    filtered.forEach(p => {
      const key = p.name.toLowerCase().trim();
      if (!uniqueMap.has(key)) uniqueMap.set(key, p);
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const idxA = PHYSICAL_CHEMICAL_ORDER.findIndex(o => o.toLowerCase() === a.name.toLowerCase());
      const idxB = PHYSICAL_CHEMICAL_ORDER.findIndex(o => o.toLowerCase() === b.name.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [parameters, reportType, showAllParameters, results]);

  // Group and sort Microbiology parameters from database
  const microParams = useMemo(() => {
    const filtered = parameters
      .filter(p => p.category === 'MICROBIOLOGY')
      .filter(isParamAllowedByReportType);
    const uniqueMap = new Map<string, WaterTestParameter>();
    filtered.forEach(p => {
      const key = p.name.toLowerCase().trim();
      if (!uniqueMap.has(key)) uniqueMap.set(key, p);
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const idxA = MICROBIOLOGY_ORDER.findIndex(o => o.toLowerCase() === a.name.toLowerCase());
      const idxB = MICROBIOLOGY_ORDER.findIndex(o => o.toLowerCase() === b.name.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [parameters, reportType, showAllParameters, results]);

  const evaluateParamStatus = (param: WaterTestParameter): 'PASS' | 'FAIL' | 'WARNING' | 'NOT_ENTERED' => {
    const res = getParamResult(param);
    return evaluateWaterTestParameterStatus(param, res?.value, res?.stringValue);
  };

  const handleSave = async (submitStatus: 'DRAFT' | 'SUBMITTED') => {
    if (isSavingRef.current || isSaving) {
      return;
    }

    if (!batchNumber.trim()) {
      toast.error('Batch Number is required');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const allFormParameters = parameters.length > 0 ? parameters : [...physicalChemicalParams, ...microParams];
      const deduplicatedPayloadMap = new Map<string, { id?: string; parameterId: string; value: number | null; stringValue: string | null }>();

      allFormParameters.forEach(param => {
        const res = getParamResult(param);
        if (!res) return;

        const valNum = res.value && res.value.trim() !== '' ? parseFloat(res.value) : null;
        const strVal = res.stringValue && res.stringValue.trim() !== '' ? res.stringValue.trim() : null;

        if ((valNum !== null && !isNaN(valNum)) || strVal !== null) {
          const key = param.id || param.name;
          deduplicatedPayloadMap.set(param.name.toLowerCase().trim(), {
            id: (res as any)?.id || undefined,
            parameterId: key,
            value: (valNum !== null && !isNaN(valNum)) ? valNum : null,
            stringValue: strVal
          });
        }
      });

      const mappedResults = Array.from(deduplicatedPayloadMap.values());

      const payload: CreateWaterTestReportRequest = {
        batchNumber: batchNumber.trim(),
        sampleNumber: sampleNumber.trim() || null,
        reportType,
        status: submitStatus,
        productionDate: productionDate ? new Date(productionDate).toISOString() : null,
        sampleTime: sampleTime ? new Date(sampleTime).toISOString() : null,
        testedBy: testedBy.trim() || null,
        collectedBy: collectedBy.trim() || null,
        verifiedBy: verifiedBy.trim() || null,
        remarks: remarks.trim() || null,
        attachments: attachments.trim() || null,
        concurrencyToken: concurrencyToken || undefined,
        results: mappedResults
      };

      if (id) {
        const updateRes = await waterTestApi.updateReport(id, payload);
        if (updateRes.data?.concurrencyToken) {
          setConcurrencyToken(updateRes.data.concurrencyToken);
        }
        toast.success(`Water test report updated successfully (${submitStatus === 'SUBMITTED' ? 'Submitted' : 'Saved as Draft'})`);
        navigate(`${basePath}/${id}`);
      } else {
        await waterTestApi.createReport(payload);
        toast.success(`Water test report created successfully (${submitStatus === 'SUBMITTED' ? 'Submitted' : 'Saved as Draft'})`);
        navigate(basePath);
      }
    } catch (error: any) {
      const errCode = error?.response?.data?.code || error?.code;
      const status = error?.response?.status;

    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const renderParameterInput = (param: WaterTestParameter) => {
    const pName = (param.name || '').toLowerCase();
    const paramRes = getParamResult(param);

    if (['colour', 'color', 'odour', 'odor', 'taste'].includes(pName)) {
      const currentStr = paramRes?.stringValue || '';
      let selectValue = '';
      if (currentStr) {
        const lower = currentStr.toLowerCase().trim();
        if (lower === 'agreeable' || lower === 'unobjectionable') selectValue = 'Agreeable';
        else if (lower === 'not agreeable' || lower === 'objectionable') selectValue = 'Not Agreeable';
        else selectValue = currentStr;
      }

      return (
        <select
          id={`param-select-${param.id}`}
          className="w-full h-9 px-3 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
          value={selectValue}
          onChange={(e) => updateParamResult(param, { stringValue: e.target.value })}
        >
          <option value="">-- Select Result --</option>
          <option value="Agreeable">Agreeable</option>
          <option value="Not Agreeable">Not Agreeable</option>
        </select>
      );
    }

    if (param.category === 'MICROBIOLOGY') {
      const isAmc = pName.includes('aerobic') || pName.includes('amc');
      const currentStr = paramRes?.stringValue || '';

      let selectValue = '';
      if (currentStr) {
        const lower = currentStr.toLowerCase().trim();
        if (lower === 'absent') selectValue = 'Absent';
        else if (lower === 'present') selectValue = 'Present';
        else if (lower === 'enter count') selectValue = 'Enter Count';
        else selectValue = currentStr;
      }

      return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            id={`micro-select-${param.id}`}
            className="h-9 px-3 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white min-w-[140px]"
            value={selectValue}
            onChange={(e) => {
              const strVal = e.target.value;
              if (strVal === 'Enter Count') {
                updateParamResult(param, { stringValue: strVal });
              } else {
                updateParamResult(param, { stringValue: strVal, value: '' });
              }
            }}
          >
            <option value="">-- Select Result --</option>
            <option value="Absent">Absent</option>
            <option value="Present">Present</option>
            {isAmc && <option value="Enter Count">Enter Count</option>}
          </select>

          {isAmc && selectValue === 'Enter Count' && (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <input
                id={`micro-count-${param.id}`}
                type="number"
                min="0"
                step="1"
                placeholder="Count"
                className="w-24 h-9 px-3 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                value={paramRes?.value || ''}
                onChange={(e) => updateParamResult(param, { value: e.target.value })}
              />
              <span className="text-xs font-semibold text-slate-500">CFU/ml</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <input
          id={`param-input-${param.id}`}
          type="number"
          step="any"
          placeholder="Enter numeric value..."
          className="w-full h-9 px-3 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
          value={paramRes?.value || ''}
          onChange={(e) => updateParamResult(param, { value: e.target.value })}
        />
        {param.unit && param.unit !== '—' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">
            {param.unit}
          </span>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="p-8 flex items-center justify-center">
          <EnterpriseLoading label="Loading water test report form..." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* HEADER */}
      <PageHeader
        title={isEdit ? `Edit Water Test Report (${reportNumber})` : 'New Water Test Report'}
        description="Record physical, chemical, and microbiological water quality parameters."
      />

      {/* 1. Production & Sampling Information */}
      <EnterpriseCard className="p-6 space-y-6 bg-white border border-slate-200">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Batch & Sampling Information</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col">
            <EnterpriseInput
              label="Batch Number *"
              placeholder={badgeLetters ? `e.g. ${badgeLetters}-${format(new Date(), 'yyyy-MM')}-001` : "e.g. BATCH-2026-0805"}
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
            />
            <BatchNumberSuggestion
              value={batchNumber}
              badgeLetters={badgeLetters}
              onApplyPrefix={(newVal) => setBatchNumber(newVal)}
            />
          </div>

          <EnterpriseInput
            label="Sample Number"
            placeholder="e.g. SMP-001"
            value={sampleNumber}
            onChange={(e) => setSampleNumber(e.target.value)}
          />

          <EnterpriseInput
            label="Production Date"
            type="date"
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
          />

          <EnterpriseInput
            label="Sample Date & Time"
            type="datetime-local"
            value={sampleTime}
            onChange={(e) => setSampleTime(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <EnterpriseSelect
            label="Report Type"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            options={[
              { value: 'DAILY', label: 'Daily Water Test' },
              { value: 'WEEKLY', label: 'Weekly Comprehensive' },
              { value: 'MONTHLY', label: 'Monthly Verification' },
              { value: 'EXTERNAL_LAB', label: 'External NABL Lab Test' }
            ]}
          />

          <EnterpriseInput
            label="Tested By (Analyst)"
            placeholder="e.g. QA Chemist"
            value={testedBy}
            onChange={(e) => setTestedBy(e.target.value)}
          />

          <EnterpriseInput
            label="Sample Collected By"
            placeholder="e.g. Lab Technician"
            value={collectedBy}
            onChange={(e) => setCollectedBy(e.target.value)}
          />

          <EnterpriseInput
            label="Verified By (Manager)"
            placeholder="e.g. QC Manager"
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
          />
        </div>
      </EnterpriseCard>

      {/* Parameter Filter Bar & Indicator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Filter className="w-4 h-4 text-blue-600" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">
              {showAllParameters
                ? `Showing All Parameters (${physicalChemicalParams.length + microParams.length}/${parameters.length})`
                : `Filtered by ${reportType === 'DAILY' ? 'Daily Water Test' : reportType === 'WEEKLY' ? 'Weekly Comprehensive' : reportType === 'MONTHLY' ? 'Monthly Verification' : 'External NABL Lab Test'} (${physicalChemicalParams.length + microParams.length}/${parameters.length} active)`}
            </span>
            {!showAllParameters && (
              <EnterpriseBadge variant="info">
                {reportType}
              </EnterpriseBadge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setShowAllParameters(!showAllParameters)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
          >
            {showAllParameters ? 'Filter by Report Type' : 'Show All Parameters'}
          </button>
        </div>
      </div>

      {/* 2. Physical & Chemical Parameters Section */}
      <EnterpriseCard className="p-6 space-y-4 bg-white border border-slate-200">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Physical & Chemical Parameters</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {physicalChemicalParams.length} Parameters
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="h-10 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider bg-slate-50">
                <th className="py-2.5 px-4">Parameter</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Standard Range</th>
                <th className="py-2.5 px-4">Result Value</th>
                <th className="py-2.5 px-4 text-center">Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {physicalChemicalParams.map((param) => {
                const status = evaluateParamStatus(param);
                const { standardText, warningText } = formatParameterLimitsDisplay(param);

                return (
                  <tr key={param.id} className="h-12 hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-800">
                      {param.name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      <EnterpriseBadge variant="gray">{param.category}</EnterpriseBadge>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{standardText}</span>
                        {/* {warningText && (
                          // <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded w-fit border border-amber-200/60">
                          //   {warningText}
                          // </span>
                        )} */}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 min-w-[220px]">
                      {renderParameterInput(param)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {status === 'PASS' && <EnterpriseBadge variant="success">Pass</EnterpriseBadge>}
                      {status === 'FAIL' && <EnterpriseBadge variant="danger">Fail</EnterpriseBadge>}
                      {status === 'WARNING' && <EnterpriseBadge variant="warning">Warning</EnterpriseBadge>}
                      {status === 'NOT_ENTERED' && <span className="text-slate-400 italic text-xs">Not Entered</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </EnterpriseCard>

      {/* 3. Microbiological Parameters Section */}
      <EnterpriseCard className="p-6 space-y-4 bg-white border border-slate-200">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Microbiological Parameters</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {microParams.length} Organisms
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="h-10 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider bg-slate-50">
                <th className="py-2.5 px-4">Organism Parameter</th>
                <th className="py-2.5 px-4">Standard Requirement</th>
                <th className="py-2.5 px-4">Incubation Timing</th>
                <th className="py-2.5 px-4">Observation Result</th>
                <th className="py-2.5 px-4 text-center">Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {microParams.map((param) => {
                const status = evaluateParamStatus(param);
                const pName = param.name.toLowerCase();
                const isAmc = pName.includes('aerobic') || pName.includes('amc');
                const is22 = pName.includes('22');
                const stdReq = isAmc ? (is22 ? '<= 100 CFU/ml' : '<= 20 CFU/ml') : 'Absent / 250ml';
                const duration = param.requiredDurationHours || (pName.includes('amc 22') || pName.includes('yeast') ? 72 : (pName.includes('pseudomonas') || pName.includes('clostridia') ? 48 : 24));

                return (
                  <tr key={param.id} className="h-12 hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-800">
                      {param.name}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-medium">
                      {stdReq}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {duration}h Incubation
                      </span>
                    </td>
                    <td className="py-2.5 px-4 min-w-[280px]">
                      {renderParameterInput(param)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {status === 'PASS' && <EnterpriseBadge variant="success">Pass</EnterpriseBadge>}
                      {status === 'FAIL' && <EnterpriseBadge variant="danger">Fail</EnterpriseBadge>}
                      {status === 'NOT_ENTERED' && (
                        <span className="text-indigo-600 text-xs font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                          Incubating (Pending)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </EnterpriseCard>

      {/* 4. Remarks & Attachments Section */}
      <EnterpriseCard className="p-6 space-y-6 bg-white border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Remarks & Laboratory Notes</label>
            <textarea
              className="w-full min-h-[90px] p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
              placeholder="Enter quality notes, observations, or analyst comments..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">External Lab Attachments / Documents (URL / File Ref)</label>
            <textarea
              className="w-full min-h-[90px] p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
              placeholder="Enter file link or document references..."
              value={attachments}
              onChange={(e) => setAttachments(e.target.value)}
            />
          </div>
        </div>
      </EnterpriseCard>

      {/* Form Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
        <EnterpriseButton
          type="button"
          variant="secondary"
          onClick={() => navigate('/qc/water-tests')}
        >
          Cancel
        </EnterpriseButton>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <EnterpriseButton
            type="button"
            variant="secondary"
            loading={isSaving}
            onClick={() => handleSave('DRAFT')}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" /> Save Draft
          </EnterpriseButton>

          <EnterpriseButton
            type="button"
            variant="primary"
            loading={isSaving}
            onClick={() => handleSave('SUBMITTED')}
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Submit Report
          </EnterpriseButton>
        </div>
      </div>

    </PageContainer>
  );
};

export default WaterTestReportFormPage;









