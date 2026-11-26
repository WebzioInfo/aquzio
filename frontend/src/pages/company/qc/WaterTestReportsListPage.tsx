import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Droplets, 
  Plus, 
  Search, 
  Edit2, 
  Eye, 
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';

import PageContainer from '../../../components/ui/layout/PageContainer';
import PageHeader from '../../../components/ui/layout/PageHeader';
import { EnterpriseCard } from '../../../components/ui/EnterpriseCard';
import { EnterpriseInput } from '../../../components/ui/EnterpriseInput';
import { EnterpriseSelect } from '../../../components/ui/EnterpriseSelect';
import { EnterpriseTable, type ColumnDef } from '../../../components/ui/EnterpriseTable';
import { EnterpriseBadge } from '../../../components/ui/EnterpriseBadge';
import { EnterpriseButton } from '../../../components/ui/EnterpriseButton';

import { waterTestApi } from '../../../services/api/waterTest';
import type { WaterTestReport } from '../../../services/api/waterTest';
import { useAuthStore } from '../../../store/useAuthStore';
import { isOwnerUser } from '../../../utils/permissions';

export const WaterTestReportsListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const isOwner = isOwnerUser(user);

  const isCompanyContext = location.pathname.startsWith('/company');
  const basePath = isCompanyContext ? '/company/qc/water-test' : '/qc/water-tests';

  // Filters & Pagination state
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize] = useState(15);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [reportType, setReportType] = useState('');
  const [status, setStatus] = useState('');

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPageNumber(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Query reports using React Query for automatic deduplication, caching & error boundaries
  const {
    data: reportsData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['waterTestReports', { pageNumber, pageSize, search: debouncedSearch, reportType, status }],
    queryFn: async () => {
      const res = await waterTestApi.getReports({
        pageNumber,
        pageSize,
        search: debouncedSearch || undefined,
        type: reportType || undefined,
        status: status || undefined
      });
      return res.data;
    },
    staleTime: 10000,
    retry: 1
  });

  const reports = useMemo(() => reportsData?.items || [], [reportsData]);
  const totalCount = reportsData?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const getCompletionBadge = (report: WaterTestReport) => {
    const total = report.totalParametersCount ?? report.results?.length ?? 0;
    const completed = report.completedParametersCount ?? (report.results ? report.results.filter(r => r.resultStatus === 'COMPLETED').length : 0);
    let comp = report.completionStatus || 'COMPLETED';
    if (comp === 'COMPLETED' && total > 0 && completed < total) {
      comp = (report.overdueParametersCount ?? 0) > 0 ? 'RESULTS_OVERDUE' : 'PARTIALLY_COMPLETED';
    }
    switch (comp) {
      case 'RESULTS_OVERDUE':
        return <EnterpriseBadge variant="danger">Overdue</EnterpriseBadge>;
      case 'PARTIALLY_COMPLETED':
        return <EnterpriseBadge variant="warning">Pending</EnterpriseBadge>;
      case 'IN_PROGRESS':
        return <EnterpriseBadge variant="info">Incubating</EnterpriseBadge>;
      case 'DRAFT':
        return <EnterpriseBadge variant="gray">Draft</EnterpriseBadge>;
      case 'COMPLETED':
      default:
        return <EnterpriseBadge variant="success">Completed</EnterpriseBadge>;
    }
  };

  const columns: ColumnDef<WaterTestReport>[] = [
    {
      id: 'reportNumber',
      header: 'Report Number',
      accessorKey: 'reportNumber',
      cell: (row: WaterTestReport) => (
        <span 
          onClick={() => navigate(`${basePath}/${row.id}`)}
          className="font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
        >
          {row.reportNumber || row.id.substring(0, 8).toUpperCase()}
        </span>
      )
    },
    {
      id: 'batchNumber',
      header: 'Batch Number',
      accessorKey: 'batchNumber',
      cell: (row: WaterTestReport) => <span className="font-semibold text-slate-800">{row.batchNumber || '—'}</span>
    },
    {
      id: 'reportType',
      header: 'Report Type',
      accessorKey: 'reportType',
      cell: (row: WaterTestReport) => (
        <span className="text-slate-600 font-medium">{row.reportType || 'DAILY'}</span>
      )
    },
    {
      id: 'sampleTime',
      header: 'Sample Collection Time',
      accessorKey: 'sampleTime',
      cell: (row: WaterTestReport) => row.sampleTime ? format(new Date(row.sampleTime), 'dd MMM yyyy, hh:mm a') : (row.createdAt ? format(new Date(row.createdAt), 'dd MMM yyyy, hh:mm a') : '—')
    },
    {
      id: 'progress',
      header: 'Parameters',
      cell: (row: WaterTestReport) => {
        const total = row.totalParametersCount ?? row.results?.length ?? 0;
        const completed = row.completedParametersCount ?? (row.results ? row.results.filter(r => r.resultStatus === 'COMPLETED' || (r.value !== null && r.value !== undefined) || (r.stringValue && r.stringValue.trim() !== '')).length : 0);
        const overdue = row.overdueParametersCount ?? 0;

        return (
          <div className="flex flex-col gap-1 min-w-[110px]">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700">{completed}/{total}</span>
              {overdue > 0 && <span className="text-rose-600 text-[10px] font-bold">{overdue} Overdue</span>}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full ${overdue > 0 ? 'bg-rose-500' : (completed === total ? 'bg-emerald-500' : 'bg-blue-500')}`}
                style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        );
      }
    },
    {
      id: 'completionStatus',
      header: 'Lifecycle Status',
      cell: (row: WaterTestReport) => getCompletionBadge(row)
    },
    {
      id: 'testedBy',
      header: 'Tested By',
      accessorKey: 'testedBy',
      cell: (row: WaterTestReport) => row.testedBy || row.createdByName || '—'
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row: WaterTestReport) => (
        <div className="flex items-center justify-end gap-2">
          <EnterpriseButton
            variant="ghost"
            size="sm"
            onClick={() => navigate(`${basePath}/${row.id}`)}
          >
            <Eye className="w-4 h-4 mr-1.5" /> View
          </EnterpriseButton>
          {!isOwner && (
            <EnterpriseButton
              variant="secondary"
              size="sm"
              onClick={() => navigate(`${basePath}/${row.id}/edit`)}
            >
              <Edit2 className="w-4 h-4 mr-1.5" /> Edit
            </EnterpriseButton>
          )}
        </div>
      )
    }
  ];

  return (
    <PageContainer>
      {/* HEADER */}
      <PageHeader
        title="Water Test Reports"
        description="View, search, and manage all quality control laboratory test reports."
        actions={
          !isOwner ? (
            <button
              onClick={() => navigate(`${basePath}/new`)}
              className="h-[32px] px-3 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Water Test Report</span>
            </button>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <EnterpriseCard className="p-4 bg-white border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2">
            <EnterpriseInput
              placeholder="Search by Report No, Batch, Analyst..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>
          <EnterpriseSelect
            value={reportType}
            onChange={(e) => {
              setReportType(e.target.value);
              setPageNumber(1);
            }}
            options={[
              { value: '', label: 'All Report Types' },
              { value: 'DAILY', label: 'Daily Routine' },
              { value: 'WEEKLY', label: 'Weekly Analysis' },
              { value: 'MONTHLY', label: 'Monthly Deep Test' },
              { value: 'QUARTERLY', label: 'Quarterly Lab Test' }
            ]}
          />
          <EnterpriseSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPageNumber(1);
            }}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'due_today', label: '⏰ Results Due Today' },
              { value: 'overdue', label: '⚠ Overdue Results' },
              { value: 'in_progress', label: '🔬 Incubating / In Progress' },
              { value: 'completed', label: '✓ Completed' },
              { value: 'DRAFT', label: 'Draft' }
            ]}
          />
        </div>
      </EnterpriseCard>

      {/* Error Banner with Retry */}
      {isError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-900 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>Unable to load water test reports. Please try again.</span>
          </div>
          <EnterpriseButton
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            className="border-rose-300 text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 inline-block" />
            Retry
          </EnterpriseButton>
        </div>
      )}

      {/* Reports Data Grid */}
      <EnterpriseCard className="overflow-hidden border border-slate-200 shadow-sm bg-white">
        <EnterpriseTable
          columns={columns}
          data={reports}
          loading={isLoading}
          emptyMessage="No water test reports found."
        />

        {/* Pagination Bar */}
        {!isLoading && totalCount > 0 && (
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Showing <span className="font-semibold text-slate-700">{((pageNumber - 1) * pageSize) + 1}</span> to{' '}
              <span className="font-semibold text-slate-700">{Math.min(pageNumber * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-slate-700">{totalCount}</span> reports
            </div>
            <div className="flex items-center gap-2">
              <EnterpriseButton
                variant="secondary"
                size="sm"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Previous
              </EnterpriseButton>
              <span className="px-2 font-medium text-slate-600">
                Page {pageNumber} of {totalPages}
              </span>
              <EnterpriseButton
                variant="secondary"
                size="sm"
                disabled={pageNumber >= totalPages}
                onClick={() => setPageNumber(p => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </EnterpriseButton>
            </div>
          </div>
        )}
      </EnterpriseCard>
    </PageContainer>
  );
};

export default WaterTestReportsListPage;
