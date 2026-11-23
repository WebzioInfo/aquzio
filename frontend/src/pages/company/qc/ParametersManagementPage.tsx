import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Sliders, 
  Plus, 
  Edit2, 
  ChevronRight, 
  FlaskConical, 
  Activity, 
  Search, 
  CheckCircle2 
} from 'lucide-react';
import { toast } from '../../../utils/toast';

import { EnterpriseHeader } from '../../../components/ui/EnterpriseHeader';
import { EnterpriseCard } from '../../../components/ui/EnterpriseCard';
import { EnterpriseInput } from '../../../components/ui/EnterpriseInput';
import { EnterpriseSelect } from '../../../components/ui/EnterpriseSelect';
import { EnterpriseTable, type ColumnDef } from '../../../components/ui/EnterpriseTable';
import { EnterpriseBadge } from '../../../components/ui/EnterpriseBadge';
import { EnterpriseButton } from '../../../components/ui/EnterpriseButton';
import { EnterpriseLoading } from '../../../components/ui/EnterpriseLoading';
import EnterpriseModal from '../../../components/ui/EnterpriseModal';

import { waterTestApi, formatParameterLimitsDisplay } from '../../../services/api/waterTest';
import type { WaterTestParameter } from '../../../services/api/waterTest';

export const ParametersManagementPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [parameters, setParameters] = useState<WaterTestParameter[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterFrequency, setFilterFrequency] = useState('ALL');

  // Parameter Edit Modal State
  const [editingParam, setEditingParam] = useState<Partial<WaterTestParameter> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchParameters();
  }, []);

  const fetchParameters = async () => {
    setIsLoading(true);
    try {
      const res = await waterTestApi.getParameters();
      setParameters(res.data);
    } catch (error) {
      toast.error('Failed to load laboratory parameters');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveParameter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParam || !editingParam.name?.trim()) {
      toast.error('Parameter Name is required');
      return;
    }

    const minWarn = editingParam.minWarning !== undefined && editingParam.minWarning !== null && String(editingParam.minWarning) !== '' ? Number(editingParam.minWarning) : null;
    const minAcc = editingParam.minAcceptable !== undefined && editingParam.minAcceptable !== null && String(editingParam.minAcceptable) !== '' ? Number(editingParam.minAcceptable) : null;
    const maxAcc = editingParam.maxAcceptable !== undefined && editingParam.maxAcceptable !== null && String(editingParam.maxAcceptable) !== '' ? Number(editingParam.maxAcceptable) : null;
    const maxWarn = editingParam.maxWarning !== undefined && editingParam.maxWarning !== null && String(editingParam.maxWarning) !== '' ? Number(editingParam.maxWarning) : null;
    const durationHours = editingParam.requiredDurationHours !== undefined && editingParam.requiredDurationHours !== null && String(editingParam.requiredDurationHours) !== '' ? Number(editingParam.requiredDurationHours) : 0;

    setIsSubmitting(true);
    try {
      await waterTestApi.saveParameter({
        id: editingParam.id,
        name: editingParam.name.trim(),
        category: editingParam.category || 'PHYSICAL',
        frequency: editingParam.frequency || 'DAILY',
        unit: editingParam.unit || '—',
        minWarning: minWarn,
        minAcceptable: minAcc,
        maxAcceptable: maxAcc,
        maxWarning: maxWarn,
        requiredDurationHours: durationHours
      });
      toast.success(`Parameter '${editingParam.name}' saved successfully.`);
      setEditingParam(null);
      fetchParameters();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to save parameter';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredParameters = parameters.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'ALL' || p.category === filterCategory;
    const pFreq = (p.frequency || 'DAILY').toUpperCase();
    const matchesFrequency = filterFrequency === 'ALL' || pFreq === filterFrequency;
    return matchesSearch && matchesCategory && matchesFrequency;
  });

  const columns: ColumnDef<WaterTestParameter>[] = [
    {
      id: 'name',
      header: 'Parameter Name',
      accessorKey: 'name',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.category === 'MICROBIOLOGY' ? (
            <Activity className="w-4 h-4 text-emerald-600" />
          ) : (
            <FlaskConical className="w-4 h-4 text-blue-600" />
          )}
          <span className="font-semibold text-slate-900">{row.name}</span>
        </div>
      )
    },
    {
      id: 'category',
      header: 'Category',
      accessorKey: 'category',
      cell: (row) => (
        <EnterpriseBadge variant={row.category === 'MICROBIOLOGY' ? 'success' : 'info'}>
          {row.category}
        </EnterpriseBadge>
      )
    },
    {
      id: 'frequency',
      header: 'Testing Schedule',
      accessorKey: 'frequency',
      cell: (row) => {
        const freq = (row.frequency || 'DAILY').toUpperCase();
        if (freq === 'MONTHLY') {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              Monthly
            </span>
          );
        }
        if (freq === 'WEEKLY') {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
              Weekly
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            Daily
          </span>
        );
      }
    },
    {
      id: 'duration',
      header: 'Incubation / Duration',
      cell: (row) => {
        const hours = row.requiredDurationHours || 0;
        if (hours === 0) {
          return <span className="text-xs text-slate-500 font-medium">Immediate (0h)</span>;
        }
        return (
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            {hours} Hours Incubation
          </span>
        );
      }
    },
    {
      id: 'unit',
      header: 'Measurement Unit',
      accessorKey: 'unit',
      cell: (row) => <span className="font-medium text-slate-600">{row.unit}</span>
    },
    {
      id: 'range',
      header: 'Standard & Warning Limits',
      cell: (row) => {
        const { standardText, warningText } = formatParameterLimitsDisplay(row);
        return (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-800">{standardText}</span>
            {warningText && (
              <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 inline-block w-fit">
                {warningText}
              </span>
            )}
          </div>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (row: WaterTestParameter) => (
        <div className="flex justify-end">
          <EnterpriseButton
            variant="ghost"
            size="sm"
            onClick={() => setEditingParam(row)}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Limits
          </EnterpriseButton>
        </div>
      )
    }
  ];

  if (isLoading) {
    return (
      <div className="p-8">
        <EnterpriseLoading label="Loading laboratory parameter configuration..." />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 pb-32 max-w-[1600px] mx-auto">
      
      {/* Breadcrumbs & Header */}
      <div className="space-y-2">
        <nav className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
          <Link to="/qc/dashboard" className="hover:text-slate-900 transition-colors">Quality Control</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-semibold">Laboratory Parameters</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <EnterpriseHeader
            title="BIS Drinking Water Parameter Specifications"
            description="Manage physical, chemical, and microbiological test parameters, measurement units, acceptable standard ranges, and warning limits."
          />

          <EnterpriseButton
            variant="primary"
            onClick={() => setEditingParam({ name: '', category: 'PHYSICAL', unit: 'mg/L' })}
          >
            <Plus className="w-4 h-4 mr-2" /> Add New Parameter
          </EnterpriseButton>
        </div>
      </div>

      {/* Filter Bar */}
      <EnterpriseCard className="p-4 bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="md:col-span-2">
            <EnterpriseInput
              placeholder="Search parameter by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>
          <EnterpriseSelect
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Categories' },
              { value: 'PHYSICAL', label: 'Physical Parameters' },
              { value: 'CHEMICAL', label: 'Chemical Parameters' },
              { value: 'MICROBIOLOGY', label: 'Microbiological Organisms' }
            ]}
          />
          <EnterpriseSelect
            value={filterFrequency}
            onChange={(e) => setFilterFrequency(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Schedules (Daily / Weekly / Monthly)' },
              { value: 'DAILY', label: 'Daily Parameters' },
              { value: 'WEEKLY', label: 'Weekly Parameters' },
              { value: 'MONTHLY', label: 'Monthly Parameters' }
            ]}
          />
        </div>

        {/* Quick Filter Schedule Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-semibold mr-1">Testing Schedule:</span>
          {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((tab) => {
            const count = tab === 'ALL' 
              ? parameters.length 
              : parameters.filter(p => (p.frequency || 'DAILY').toUpperCase() === tab).length;
            const isActive = filterFrequency === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterFrequency(tab)}
                className={`px-3 py-1 rounded-full font-medium transition-colors cursor-pointer text-xs ${
                  isActive 
                    ? 'bg-[#05303B] text-white shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL' ? 'All Parameters' : tab.charAt(0) + tab.slice(1).toLowerCase()} ({count})
              </button>
            );
          })}
        </div>
      </EnterpriseCard>

      {/* Data Table Card */}
      <EnterpriseCard className="overflow-hidden border border-slate-200 shadow-sm bg-white">
        <EnterpriseTable
          columns={columns}
          data={filteredParameters}
          emptyMessage="No laboratory parameters found."
        />
      </EnterpriseCard>

      {/* Edit Parameter Modal */}
      {editingParam && (
        <EnterpriseModal
          isOpen={Boolean(editingParam)}
          onClose={() => setEditingParam(null)}
          title={editingParam.id ? `Edit Parameter — ${editingParam.name}` : 'Create Laboratory Parameter'}
        >
          <form onSubmit={handleSaveParameter} className="space-y-4 pt-2">
            <EnterpriseInput
              label="Parameter Name *"
              placeholder="e.g. pH, TDS, E.coli"
              value={editingParam.name || ''}
              onChange={(e) => setEditingParam({ ...editingParam, name: e.target.value })}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <EnterpriseSelect
                label="Testing Schedule *"
                value={editingParam.frequency || 'DAILY'}
                onChange={(e) => setEditingParam({ ...editingParam, frequency: e.target.value })}
                options={[
                  { value: 'DAILY', label: 'Daily Parameter' },
                  { value: 'WEEKLY', label: 'Weekly Parameter' },
                  { value: 'MONTHLY', label: 'Monthly Parameter' }
                ]}
              />

              <EnterpriseSelect
                label="Category"
                value={editingParam.category || 'PHYSICAL'}
                onChange={(e) => {
                  const cat = e.target.value;
                  let defHours = editingParam.requiredDurationHours;
                  if (cat === 'MICROBIOLOGY' && (!defHours || defHours === 0)) {
                    defHours = 24;
                  } else if (cat !== 'MICROBIOLOGY') {
                    defHours = 0;
                  }
                  setEditingParam({ ...editingParam, category: cat, requiredDurationHours: defHours });
                }}
                options={[
                  { value: 'PHYSICAL', label: 'Physical' },
                  { value: 'CHEMICAL', label: 'Chemical' },
                  { value: 'MICROBIOLOGY', label: 'Microbiology' }
                ]}
              />

              <EnterpriseInput
                label="Unit of Measurement"
                placeholder="e.g. mg/L, NTU, CFU/ml"
                value={editingParam.unit || ''}
                onChange={(e) => setEditingParam({ ...editingParam, unit: e.target.value })}
              />

              <EnterpriseInput
                label="Incubation Duration (Hours)"
                type="number"
                min="0"
                step="1"
                placeholder="0 = Immediate, 24, 48, 72"
                value={editingParam.requiredDurationHours ?? 0}
                onChange={(e) => setEditingParam({ ...editingParam, requiredDurationHours: Number(e.target.value) })}
              />
            </div>

            {/* 4-Field Limit Specification */}
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Limit Configuration (Standard & Warning Limits)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EnterpriseInput
                  label="Min Warning Limit (Optional)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 100"
                  value={editingParam.minWarning ?? ''}
                  onChange={(e) => setEditingParam({ ...editingParam, minWarning: e.target.value !== '' ? Number(e.target.value) : undefined })}
                />

                <EnterpriseInput
                  label="Min Acceptable Limit (Optional)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 150"
                  value={editingParam.minAcceptable ?? ''}
                  onChange={(e) => setEditingParam({ ...editingParam, minAcceptable: e.target.value !== '' ? Number(e.target.value) : undefined })}
                />

                <EnterpriseInput
                  label="Max Acceptable Limit (Optional)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 200"
                  value={editingParam.maxAcceptable ?? ''}
                  onChange={(e) => setEditingParam({ ...editingParam, maxAcceptable: e.target.value !== '' ? Number(e.target.value) : undefined })}
                />

                <EnterpriseInput
                  label="Max Warning Limit (Optional)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 250"
                  value={editingParam.maxWarning ?? ''}
                  onChange={(e) => setEditingParam({ ...editingParam, maxWarning: e.target.value !== '' ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <EnterpriseButton
                type="button"
                variant="secondary"
                onClick={() => setEditingParam(null)}
              >
                Cancel
              </EnterpriseButton>
              <EnterpriseButton
                type="submit"
                variant="primary"
                loading={isSubmitting}
              >
                Save Parameter
              </EnterpriseButton>
            </div>
          </form>
        </EnterpriseModal>
      )}

    </div>
  );
};

export default ParametersManagementPage;
