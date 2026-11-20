import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Save, 
  ChevronRight, 
  ShieldCheck, 
  Mail,
  Award,
  Plus,
  Trash2
} from 'lucide-react';
import { toast } from '../../../utils/toast';

import { EnterpriseHeader } from '../../../components/ui/EnterpriseHeader';
import { EnterpriseCard } from '../../../components/ui/EnterpriseCard';
import { EnterpriseInput } from '../../../components/ui/EnterpriseInput';
import { EnterpriseSelect } from '../../../components/ui/EnterpriseSelect';
import { EnterpriseButton } from '../../../components/ui/EnterpriseButton';
import { EnterpriseLoading } from '../../../components/ui/EnterpriseLoading';

import { waterTestApi } from '../../../services/api/waterTest';
import type { QCSettings, CustomLicenseItem } from '../../../services/api/waterTest';

export const QCSettingsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<QCSettings>({
    autoGenerateCAPAOnFailure: true,
    requireVerificationBeforeSubmit: false,
    standardComplianceType: 'BIS_IS_14543',
    digitalSignatureTitle: 'Quality Assurance Manager',
    labAddress: '',
    contactEmail: '',
    notificationRecipients: ''
  });

  const [fssaiNumber, setFssaiNumber] = useState('');
  const [hasBis, setHasBis] = useState(false);
  const [bisNumber, setBisNumber] = useState('');
  const [customLicenses, setCustomLicenses] = useState<CustomLicenseItem[]>([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await waterTestApi.getSettings();
      if (res.data) {
        setSettings(res.data);
        setFssaiNumber(res.data.fssaiNumber || '');
        if (res.data.bisNumber && res.data.bisNumber.trim()) {
          setHasBis(true);
          setBisNumber(res.data.bisNumber);
        } else {
          setHasBis(false);
          setBisNumber('');
        }

        if (res.data.additionalLicensesJson) {
          try {
            const parsed = JSON.parse(res.data.additionalLicensesJson);
            if (Array.isArray(parsed)) {
              setCustomLicenses(parsed);
            }
          } catch {
            setCustomLicenses([]);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to load QC module settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCustomLicense = () => {
    setCustomLicenses([...customLicenses, { name: '', number: '' }]);
  };

  const handleRemoveCustomLicense = (index: number) => {
    setCustomLicenses(customLicenses.filter((_, i) => i !== index));
  };

  const handleCustomLicenseChange = (index: number, field: 'name' | 'number', value: string) => {
    const updated = [...customLicenses];
    updated[index][field] = value;
    setCustomLicenses(updated);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const validCustomLicenses = customLicenses.filter(
        (lic) => lic.name.trim() !== '' && lic.number.trim() !== ''
      );

      const payload: QCSettings = {
        ...settings,
        fssaiNumber: fssaiNumber.trim() || undefined,
        bisNumber: hasBis && bisNumber.trim() ? bisNumber.trim() : undefined,
        additionalLicensesJson: validCustomLicenses.length > 0 ? JSON.stringify(validCustomLicenses) : undefined
      };

      await waterTestApi.updateSettings(payload);
      toast.success('Quality Control settings saved successfully.');
    } catch (error) {
      toast.error('Failed to save QC settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <EnterpriseLoading label="Loading Quality Control module settings..." />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 pb-32 max-w-[1200px] mx-auto text-left">
      
      {/* Breadcrumbs & Header */}
      <div className="space-y-2">
        <nav className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
          <Link to="/qc/dashboard" className="hover:text-slate-900 transition-colors">Quality Control</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-semibold">QC Settings</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <EnterpriseHeader
            title="Quality Control Module Settings"
            description="Configure automated CAPA rules, regulatory licenses (FSSAI/BIS), certificate digital signature header, and laboratory contacts."
          />
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        
        {/* 1. Regulatory & Plant Licenses (FSSAI, BIS, Custom) */}
        <EnterpriseCard className="p-6 space-y-6 bg-white border border-slate-200">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Plant Regulatory Licenses & Approvals
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              Syncs to public BioDrops verification and Water Report PDFs
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <EnterpriseInput
                label="FSSAI License Number (Mandatory)"
                placeholder="14-digit FSSAI Lic No (e.g. 11322000000000)"
                value={fssaiNumber}
                onChange={(e) => setFssaiNumber(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                Primary mandatory food safety license for water production.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  checked={hasBis}
                  onChange={(e) => {
                    setHasBis(e.target.checked);
                    if (!e.target.checked) setBisNumber('');
                  }}
                />
                <span className="text-sm font-semibold text-slate-900">Plant has BIS (ISI Mark) Certification</span>
              </label>

              {hasBis ? (
                <div className="pt-1">
                  <EnterpriseInput
                    label="BIS CM/L License Number"
                    placeholder="e.g. CM/L-7890123"
                    value={bisNumber}
                    onChange={(e) => setBisNumber(e.target.value)}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-100">
                  Optional. If unchecked, BIS will be hidden from BioDrops and the Water Report without displaying null.
                </p>
              )}
            </div>
          </div>

          {/* Custom / Additional Licenses */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Additional Regulatory Licenses</h4>
                <p className="text-xs text-slate-500">Add other plant certifications (e.g. ISO 9001:2015, Pollution Control Board NOC, Groundwater Authority NOC)</p>
              </div>
              <EnterpriseButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddCustomLicense}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add License
              </EnterpriseButton>
            </div>

            {customLicenses.length > 0 && (
              <div className="space-y-2.5 pt-2">
                {customLicenses.map((lic, index) => (
                  <div key={index} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="License Name (e.g. ISO 22000:2018)"
                        value={lic.name}
                        onChange={(e) => handleCustomLicenseChange(index, 'name', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="License / Certificate No."
                        value={lic.number}
                        onChange={(e) => handleCustomLicenseChange(index, 'number', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomLicense(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove license"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </EnterpriseCard>

        {/* 2. Compliance & Standard Regulations */}
        <EnterpriseCard className="p-6 space-y-6 bg-white border border-slate-200">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Compliance Regulations & Verification Rules</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EnterpriseSelect
              label="Standard Drinking Water Regulation"
              value={settings.standardComplianceType}
              onChange={(e) => setSettings({ ...settings, standardComplianceType: e.target.value })}
              options={[
                { value: 'BIS_IS_14543', label: 'BIS IS 14543 — Packaged Drinking Water' },
                { value: 'BIS_IS_10500', label: 'BIS IS 10500 — Drinking Water Standard' },
                { value: 'WHO_DRINKING', label: 'WHO Guidelines for Drinking Water' },
                { value: 'FSSAI_COMPLIANT', label: 'FSSAI Food Safety & Quality Manual' }
              ]}
            />

            <EnterpriseInput
              label="Digital Signature Officer Title"
              placeholder="e.g. Quality Assurance Manager"
              value={settings.digitalSignatureTitle}
              onChange={(e) => setSettings({ ...settings, digitalSignatureTitle: e.target.value })}
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                checked={settings.autoGenerateCAPAOnFailure}
                onChange={(e) => setSettings({ ...settings, autoGenerateCAPAOnFailure: e.target.checked })}
              />
              <div>
                <span className="text-sm font-semibold text-slate-900">Auto-Generate Non-Conformance Report (NCR / CAPA)</span>
                <p className="text-xs text-slate-500">Automatically logs an open NCR record whenever a parameter fails testing standard.</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none pt-2">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                checked={settings.requireVerificationBeforeSubmit}
                onChange={(e) => setSettings({ ...settings, requireVerificationBeforeSubmit: e.target.checked })}
              />
              <div>
                <span className="text-sm font-semibold text-slate-900">Require QC Manager Verification</span>
                <p className="text-xs text-slate-500">Water test reports require formal QC Manager sign-off before submission.</p>
              </div>
            </label>
          </div>
        </EnterpriseCard>

        {/* 3. Laboratory Notifications & Address */}
        <EnterpriseCard className="p-6 space-y-6 bg-white border border-slate-200">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Laboratory Notification Contacts & Facility Address</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EnterpriseInput
              label="Laboratory Contact Email"
              type="email"
              placeholder="qc-lab@enterprise.com"
              value={settings.contactEmail}
              onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
            />

            <EnterpriseInput
              label="Alert Notification Recipients (Comma separated emails)"
              placeholder="quality@enterprise.com, lab-manager@enterprise.com"
              value={settings.notificationRecipients}
              onChange={(e) => setSettings({ ...settings, notificationRecipients: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Laboratory Facility Address (Appears on Certificate PDF)</label>
            <textarea
              className="w-full min-h-[70px] p-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white"
              placeholder="Enter official testing lab location address..."
              value={settings.labAddress}
              onChange={(e) => setSettings({ ...settings, labAddress: e.target.value })}
            />
          </div>
        </EnterpriseCard>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <EnterpriseButton
            type="submit"
            variant="primary"
            loading={isSaving}
          >
            <Save className="w-4 h-4 mr-2" /> Save QC Module Settings
          </EnterpriseButton>
        </div>

      </form>
    </div>
  );
};

export default QCSettingsPage;
