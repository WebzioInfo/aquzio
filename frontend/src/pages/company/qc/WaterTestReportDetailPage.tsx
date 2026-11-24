import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { 
  Beaker, 
  FileText, 
  Edit2, 
  Printer, 
  Download,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  User,
  FlaskConical,
  Activity,
  Clock,
  Check,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '../../../utils/toast';

import PageContainer from '../../../components/ui/layout/PageContainer';
import PageHeader from '../../../components/ui/layout/PageHeader';
import { EnterpriseCard } from '../../../components/ui/EnterpriseCard';
import { EnterpriseBadge } from '../../../components/ui/EnterpriseBadge';
import { EnterpriseButton } from '../../../components/ui/EnterpriseButton';
import { EnterpriseLoading } from '../../../components/ui/EnterpriseLoading';
import EnterpriseModal from '../../../components/ui/EnterpriseModal';
import { EnterpriseInput } from '../../../components/ui/EnterpriseInput';

import { waterTestApi } from '../../../services/api/waterTest';
import type { WaterTestReport, WaterTestResult } from '../../../services/api/waterTest';
import { useAuthStore } from '../../../store/useAuthStore';
import { generateWaterTestReportPDF } from '../../../utils/waterTestPdfEngine';
import { fetchGlobalCompanyProfileAsync } from '../../../utils/companyPdfHeader';
import type { PDFCompanyProfile } from '../../../utils/companyPdfHeader';

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

import { isOwnerUser } from '../../../utils/permissions';

export const WaterTestReportDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const isOwner = isOwnerUser(user);

  const isCompanyContext = location.pathname.startsWith('/company');
  const basePath = isCompanyContext ? '/company/qc/water-test' : '/qc/water-tests';

  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [report, setReport] = useState<WaterTestReport | null>(null);
  const [companyProfile, setCompanyProfile] = useState<PDFCompanyProfile | null>(null);

  // Quick Result Entry Modal State
  const [editingResult, setEditingResult] = useState<WaterTestResult | null>(null);
  const [quickResultValue, setQuickResultValue] = useState('');
  const [quickResultString, setQuickResultString] = useState('');
  const [isSubmittingQuickResult, setIsSubmittingQuickResult] = useState(false);

  useEffect(() => {
    fetchGlobalCompanyProfileAsync().then(profile => setCompanyProfile(profile));
  }, []);

  const companyInfo = useMemo(() => ({
    name: companyProfile?.name || user?.companyName || user?.tenantName || 'Aiwa Minerals',
    displayName: companyProfile?.displayName || user?.companyName || user?.tenantName || 'Aiwa Minerals',
    address: companyProfile?.address,
    city: companyProfile?.city,
    state: companyProfile?.state,
    country: companyProfile?.country,
    pincode: companyProfile?.pincode,
    phone: companyProfile?.phone,
    email: companyProfile?.email,
    gstNumber: companyProfile?.gstNumber
  }), [companyProfile, user?.companyName, user?.tenantName]);

  const fetchReportDetails = async (reportId: string) => {
    setIsLoading(true);
    try {
      const res = await waterTestApi.getReportById(reportId);
      setReport(res.data);
    } catch (error) {
      toast.error('Failed to load water test report details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchReportDetails(id);
    }
  }, [id]);

  const handleOpenQuickResult = (r: WaterTestResult) => {
    setEditingResult(r);
    setQuickResultValue(r.value !== null && r.value !== undefined ? String(r.value) : '');
    setQuickResultString(r.stringValue || (r.parameterCategory === 'MICROBIOLOGY' ? 'Absent' : ''));
  };

  const handleSaveQuickResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !editingResult) return;

    const isNumeric = editingResult.parameterCategory !== 'MICROBIOLOGY' || quickResultString === 'Enter Count';
    const numVal = isNumeric && quickResultValue.trim() !== '' ? parseFloat(quickResultValue) : null;
    const strVal = quickResultString.trim() !== '' ? quickResultString.trim() : null;

    if (!isNumeric && !strVal) {
      toast.error('Please select or enter a result value');
      return;
    }
    if (isNumeric && (numVal === null || isNaN(numVal))) {
      toast.error('Please enter a valid numeric result');
      return;
    }

    setIsSubmittingQuickResult(true);
    try {
      const res = await waterTestApi.enterSingleResult(report.id, editingResult.parameterId, {
        value: numVal,
        stringValue: strVal,
        testedBy: user?.fullName || user?.email || 'QC Chemist'
      });
      toast.success(`Result updated for ${editingResult.parameterName}`);
      setReport(res.data);
      setEditingResult(null);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Failed to enter result';
      toast.error(msg);
    } finally {
      setIsSubmittingQuickResult(false);
    }
  };

  const physicalChemicalResults = useMemo(() => {
    if (!report?.results) return [];
    return [...report.results.filter(r => r.parameterCategory === 'PHYSICAL' || r.parameterCategory === 'CHEMICAL')].sort((a, b) => {
      const idxA = PHYSICAL_CHEMICAL_ORDER.findIndex(o => o.toLowerCase() === (a.parameterName || '').toLowerCase());
      const idxB = PHYSICAL_CHEMICAL_ORDER.findIndex(o => o.toLowerCase() === (b.parameterName || '').toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return (a.parameterName || '').localeCompare(b.parameterName || '');
    });
  }, [report?.results]);

  const microResults = useMemo(() => {
    if (!report?.results) return [];
    return [...report.results.filter(r => r.parameterCategory === 'MICROBIOLOGY')].sort((a, b) => {
      const idxA = MICROBIOLOGY_ORDER.findIndex(o => o.toLowerCase() === (a.parameterName || '').toLowerCase());
      const idxB = MICROBIOLOGY_ORDER.findIndex(o => o.toLowerCase() === (b.parameterName || '').toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return (a.parameterName || '').localeCompare(b.parameterName || '');
    });
  }, [report?.results]);

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsDownloadingPdf(true);
    try {
      const doc = generateWaterTestReportPDF({
        report,
        company: companyInfo
      });
      const fileReportNo = report.reportNumber || report.id.substring(0, 8).toUpperCase();
      doc.save(`Water_Test_Report_${fileReportNo}.pdf`);
      toast.success('Water Test Report PDF generated successfully');
    } catch (error) {
      console.error('Frontend PDF generation failed, falling back to backend PDF endpoint', error);
      try {
        const res = await waterTestApi.downloadReportPdf(report.id);
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Water_Test_Report_${report.reportNumber || report.id.substring(0, 8).toUpperCase()}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success('Water Test Report PDF downloaded successfully');
      } catch (backendErr) {
        toast.error('Unable to generate the water test report PDF.');
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrintPdf = () => {
    if (!report) return;
    try {
      const doc = generateWaterTestReportPDF({
        report,
        company: companyInfo
      });
      doc.autoPrint();
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    } catch (error) {
      window.print();
    }
  };

  const getParameterStatusBadge = (r: WaterTestResult) => {
    const lifecycle = r.resultStatus || 'COMPLETED';
    if (lifecycle === 'OVERDUE') {
      return <EnterpriseBadge variant="danger">Overdue</EnterpriseBadge>;
    }
    if (lifecycle === 'IN_PROGRESS' || lifecycle === 'PENDING_RESULT') {
      return <EnterpriseBadge variant="info">Incubating</EnterpriseBadge>;
    }
    if (lifecycle === 'NOT_STARTED') {
      return <EnterpriseBadge variant="gray">Not Started</EnterpriseBadge>;
    }
    
    // For completed: show Quality pass/fail badge
    const qStatus = r.qualityStatus?.toUpperCase() || (r.isPass ? 'PASS' : 'FAIL');
    if (qStatus === 'PASS' || qStatus === 'APPROVED') {
      return <EnterpriseBadge variant="success">Pass</EnterpriseBadge>;
    }
    if (qStatus === 'WARNING') {
      return <EnterpriseBadge variant="warning">Warning</EnterpriseBadge>;
    }
    return <EnterpriseBadge variant="danger">Fail</EnterpriseBadge>;
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="p-8 flex items-center justify-center">
          <EnterpriseLoading label="Loading water test report..." />
        </div>
      </PageContainer>
    );
  }

  if (!report) {
    return (
      <PageContainer>
        <div className="p-8 text-center space-y-4">
          <p className="text-slate-500">Report not found.</p>
          <EnterpriseButton variant="secondary" onClick={() => navigate(basePath)}>
            Back to Reports
          </EnterpriseButton>
        </div>
      </PageContainer>
    );
  }

  const compStatus = report.completionStatus || 'COMPLETED';
  const isOverdue = compStatus === 'RESULTS_OVERDUE' || (report.overdueParametersCount && report.overdueParametersCount > 0);
  const isInProgress = compStatus === 'IN_PROGRESS' || compStatus === 'PARTIALLY_COMPLETED' || (report.pendingParametersCount && report.pendingParametersCount > 0);

  return (
    <PageContainer>
      {/* HEADER */}
      <div className="print:hidden">
        <PageHeader
          title={`Water Test Report #${report.reportNumber}`}
          description={`Batch Number: ${report.batchNumber} | Created: ${format(new Date(report.createdAt), 'dd MMM yyyy, hh:mm a')}`}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="h-[32px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" /> Export PDF
              </button>
              <button
                onClick={handlePrintPdf}
                className="h-[32px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" /> Print Certificate
              </button>
              {!isOwner && (
                <button
                  onClick={() => navigate(`${basePath}/${report.id}/edit`)}
                  className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Full Report
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* OVERALL LIFECYCLE BANNER */}
      {isOverdue ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-900 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-rose-900">Overdue QC Results Detected</h4>
              <p className="text-xs text-rose-700 mt-0.5">One or more microbiological incubation durations have elapsed. Please enter the observation results to complete this report.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-md border border-rose-300">
            {report.overdueParametersCount || 1} Overdue
          </span>
        </div>
      ) : isInProgress ? (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-blue-900 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-blue-900">Active Microbiological Incubation in Progress</h4>
              <p className="text-xs text-blue-700 mt-0.5">Physical/chemical parameters recorded. Microbiological samples are currently incubating under observation.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-md border border-blue-300">
            {report.pendingParametersCount || 1} Incubating
          </span>
        </div>
      ) : (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-900 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-900">All Parameters Finalized & Completed</h4>
              <p className="text-xs text-emerald-700">All laboratory tests, observations, and incubations have been recorded and verified.</p>
            </div>
          </div>
          <EnterpriseBadge variant="success">Report Complete</EnterpriseBadge>
        </div>
      )}

      {/* Main Report Details */}
      <EnterpriseCard className="p-8 space-y-8 bg-white border border-slate-200 shadow-sm">
        
        {/* Meta Header */}
        <div className="flex flex-wrap justify-between items-start border-b border-slate-200 pb-6 gap-6">
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Enterprise Quality Compliance Certificate</span>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">Water Quality Test Analysis Report</h1>
            <p className="text-sm text-slate-500 mt-1">Laboratory compliance certificate for 20L Bottled Water Production.</p>
          </div>
          <div className="flex items-center gap-3">
            {compStatus === 'RESULTS_OVERDUE' && <EnterpriseBadge variant="danger">Overdue Results</EnterpriseBadge>}
            {compStatus === 'IN_PROGRESS' && <EnterpriseBadge variant="info">Incubating (In Progress)</EnterpriseBadge>}
            {compStatus === 'PARTIALLY_COMPLETED' && <EnterpriseBadge variant="warning">Partially Completed</EnterpriseBadge>}
            {compStatus === 'COMPLETED' && <EnterpriseBadge variant="success">Completed</EnterpriseBadge>}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200/80">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Batch Number</span>
            <span className="text-sm font-bold text-slate-900">{report.batchNumber}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Sample Number</span>
            <span className="text-sm font-semibold text-slate-800">{report.sampleNumber || '—'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Report Type</span>
            <span className="text-sm font-semibold text-slate-800">{report.reportType}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Sample Time</span>
            <span className="text-sm font-semibold text-slate-800">
              {report.sampleTime ? format(new Date(report.sampleTime), 'dd MMM yyyy, hh:mm a') : '—'}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Tested By</span>
            <span className="text-sm font-semibold text-slate-800">{report.testedBy || '—'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Verified By</span>
            <span className="text-sm font-semibold text-slate-800">{report.verifiedBy || '—'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Created By</span>
            <span className="text-sm font-semibold text-slate-800">{report.createdByName}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Production Date</span>
            <span className="text-sm font-semibold text-slate-800">
              {report.productionDate ? format(new Date(report.productionDate), 'dd MMM yyyy') : '—'}
            </span>
          </div>
        </div>

        {/* Physical & Chemical Results Table */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-blue-600" />
            Physical & Chemical Analysis Results
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold h-10">
                  <th className="py-3 px-4 font-semibold text-sm">Parameter Name</th>
                  <th className="py-3 px-4 font-semibold text-sm">Measured Value</th>
                  <th className="py-3 px-4 font-semibold text-sm">Unit</th>
                  <th className="py-3 px-4 font-semibold text-sm">Incubation / Started</th>
                  <th className="py-3 px-4 font-semibold text-sm">Status</th>
                  <th className="py-3 px-4 font-semibold text-sm text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {physicalChemicalResults.map(r => {
                  const isPending = r.resultStatus === 'IN_PROGRESS' || r.resultStatus === 'PENDING_RESULT' || r.resultStatus === 'OVERDUE' || r.resultStatus === 'NOT_STARTED';

                  return (
                    <tr key={r.id} className="h-11">
                      <td className="py-3 px-4 font-medium text-slate-900">{r.parameterName}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {r.stringValue ? r.stringValue : (r.value !== null && r.value !== undefined ? r.value : '—')}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-medium">{r.parameterUnit}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.requiredDurationHours ? `${r.requiredDurationHours}h duration` : 'Immediate (0h)'}
                      </td>
                      <td className="py-3 px-4">{getParameterStatusBadge(r)}</td>
                      <td className="py-3 px-4 text-right">
                        {!isOwner && (
                          <EnterpriseButton
                            variant={isPending ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => handleOpenQuickResult(r)}
                          >
                            {isPending ? 'Enter Result' : 'Edit'}
                          </EnterpriseButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Microbiological Results Table */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            Microbiological Analysis & Incubation Results
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold h-10">
                  <th className="py-3 px-4 font-semibold text-sm">Organism / Parameter</th>
                  <th className="py-3 px-4 font-semibold text-sm">Observation Result</th>
                  <th className="py-3 px-4 font-semibold text-sm">Incubation Duration</th>
                  <th className="py-3 px-4 font-semibold text-sm">Expected Completion</th>
                  <th className="py-3 px-4 font-semibold text-sm">Lifecycle Status</th>
                  <th className="py-3 px-4 font-semibold text-sm text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {microResults.map(r => {
                  const isPending = r.resultStatus === 'IN_PROGRESS' || r.resultStatus === 'PENDING_RESULT' || r.resultStatus === 'OVERDUE' || r.resultStatus === 'NOT_STARTED';

                  return (
                    <tr key={r.id} className="h-11">
                      <td className="py-3 px-4 font-medium text-slate-900">{r.parameterName}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {r.stringValue ? r.stringValue : (r.value !== null && r.value !== undefined ? `${r.value} CFU/ml` : (isPending ? <span className="text-indigo-600 italic">Under Incubation</span> : '—'))}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                          {r.requiredDurationHours || 24}h Incubation
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.expectedCompletionAt ? format(new Date(r.expectedCompletionAt), 'dd MMM yyyy, hh:mm a') : '—'}
                      </td>
                      <td className="py-3 px-4">{getParameterStatusBadge(r)}</td>
                      <td className="py-3 px-4 text-right">
                        {!isOwner && (
                          <EnterpriseButton
                            variant={isPending ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => handleOpenQuickResult(r)}
                          >
                            {isPending ? 'Enter Result' : 'Edit'}
                          </EnterpriseButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Remarks Section */}
        {report.remarks && (
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Analyst Remarks & Conclusion</h4>
            <p className="text-sm text-slate-800 whitespace-pre-line">{report.remarks}</p>
          </div>
        )}

      </EnterpriseCard>

      {/* Quick Parameter Result Entry Modal */}
      {editingResult && (
        <EnterpriseModal
          isOpen={Boolean(editingResult)}
          onClose={() => setEditingResult(null)}
          title={`Enter Result — ${editingResult.parameterName}`}
        >
          <form onSubmit={handleSaveQuickResult} className="space-y-4 pt-2">
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Batch Number:</span>
                <span className="font-bold text-slate-900">{report.batchNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Parameter:</span>
                <span className="font-semibold text-slate-800">{editingResult.parameterName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Incubation Duration:</span>
                <span className="font-semibold text-indigo-700">{editingResult.requiredDurationHours || 0} Hours</span>
              </div>
              {editingResult.expectedCompletionAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Completion:</span>
                  <span className="font-semibold text-slate-800">
                    {format(new Date(editingResult.expectedCompletionAt), 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>
              )}
            </div>

            {editingResult.parameterCategory === 'MICROBIOLOGY' ? (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 block">Microbiological Observation</label>
                <select
                  className="w-full h-9 px-3 rounded-md border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                  value={quickResultString}
                  onChange={(e) => setQuickResultString(e.target.value)}
                >
                  <option value="Absent">Absent (Compliant)</option>
                  <option value="Present">Present (Non-Compliant)</option>
                  <option value="Enter Count">Enter Colony Count (CFU/ml)</option>
                </select>

                {quickResultString === 'Enter Count' && (
                  <EnterpriseInput
                    label="Colony Count (CFU/ml) *"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 0, 5, 25"
                    value={quickResultValue}
                    onChange={(e) => setQuickResultValue(e.target.value)}
                    required
                  />
                )}
              </div>
            ) : (
              <EnterpriseInput
                label={`Measured Result (${editingResult.parameterUnit}) *`}
                type="number"
                step="any"
                placeholder={`Enter result in ${editingResult.parameterUnit}`}
                value={quickResultValue}
                onChange={(e) => setQuickResultValue(e.target.value)}
                required
              />
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <EnterpriseButton
                type="button"
                variant="secondary"
                onClick={() => setEditingResult(null)}
              >
                Cancel
              </EnterpriseButton>
              <EnterpriseButton
                type="submit"
                variant="primary"
                loading={isSubmittingQuickResult}
              >
                Save & Update Parameter
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>
      )}

    </PageContainer>
  );
};

export default WaterTestReportDetailPage;
