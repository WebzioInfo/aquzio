import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Phone,
  MapPin,
  Factory,
  Save,
  Loader2,
  Image as ImageIcon,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import PageContainer from '../../components/ui/layout/PageContainer'
import PageHeader from '../../components/ui/layout/PageHeader'
import { useNotificationStore } from '../../store/useNotificationStore'
import {
  companyProfileApi,
  type CompanyProfileData,
  type UpdateCompanyProfilePayload,
} from '../../services/companyProfile'

export const CompanyProfilePage: React.FC = () => {
  const { showToast } = useNotificationStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<CompanyProfileData | null>(null)

  const [form, setForm] = useState<UpdateCompanyProfilePayload>({
    displayName: '',
    shortDescription: '',
    about: '',
    establishedYear: null,
    publicEmail: '',
    publicPhone: '',
    websiteUrl: '',
    contactPerson: '',
    fullAddress: '',
    city: '',
    district: '',
    state: '',
    pinCode: '',
    googleMapsUrl: '',
    latitude: null,
    longitude: null,
    factoryIntroduction: '',
    productionFacilityDescription: '',
    manufacturingInfrastructure: '',
    qualityControlFacilities: '',
    isPublic: true,
  })

  useEffect(() => {
    let mounted = true
    companyProfileApi
      .getProfile()
      .then((data) => {
        if (!mounted) return
        setProfile(data)
        setForm({
          displayName: data.displayName || data.tenantName || '',
          shortDescription: data.shortDescription || '',
          about: data.about || '',
          establishedYear: data.establishedYear ?? null,
          publicEmail: data.publicEmail || '',
          publicPhone: data.publicPhone || '',
          websiteUrl: data.websiteUrl || '',
          contactPerson: data.contactPerson || '',
          fullAddress: data.fullAddress || '',
          city: data.city || '',
          district: data.district || '',
          state: data.state || '',
          pinCode: data.pinCode || '',
          googleMapsUrl: data.googleMapsUrl || '',
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          factoryIntroduction: data.factoryIntroduction || '',
          productionFacilityDescription: data.productionFacilityDescription || '',
          manufacturingInfrastructure: data.manufacturingInfrastructure || '',
          qualityControlFacilities: data.qualityControlFacilities || '',
          isPublic: data.isPublic ?? true,
        })
      })
      .catch((err: any) => {
        if (mounted) showToast(err.message || 'Failed to load company profile.', 'error')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [showToast])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const updated = await companyProfileApi.updateProfile(form)
      setProfile(updated)
      showToast('Company public profile saved successfully.', 'success')
    } catch (err: any) {
      showToast(err.message || 'Failed to save company profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Loading company profile...</span>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Company Profile"
          description="Manage your public manufacturer profile displayed on BIODROPS."
        />
        <Link
          to="/company/gallery"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors self-start"
        >
          <ImageIcon className="w-4 h-4" />
          Manage Image Gallery
        </Link>
      </div>

      {/* Identity & Media Summary Banner */}
      <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          {profile?.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt={profile.tenantName}
              className="w-14 h-14 rounded-xl object-contain border border-slate-200 bg-white p-1"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-teal-50 text-teal-700 font-bold text-lg flex items-center justify-center border border-teal-200">
              {(profile?.badgeLetters || profile?.tenantName?.slice(0, 2) || 'AQ').toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-900">
                {profile?.tenantName}
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px] font-semibold">
                {profile?.tenantCode}
              </span>
              {profile?.isBiodropsProduction && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  BIODROPS Partner
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Logo and cover photo can be set directly from your Image Gallery.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, isPublic: !p.isPublic }))}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            form.isPublic
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}
        >
          {form.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {form.isPublic ? 'Public Profile Visible' : 'Public Profile Hidden'}
        </button>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        {/* Basic Information */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            <Building2 className="w-4 h-4 text-teal-600" />
            Basic Information
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Company Display Name
              </label>
              <input
                type="text"
                value={form.displayName || ''}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                placeholder="e.g. Faiha Water Solutions"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Established Year
              </label>
              <input
                type="number"
                min={1900}
                max={2100}
                value={form.establishedYear ?? ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    establishedYear: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                placeholder="e.g. 2018"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Short Introduction (shown on directory cards)
            </label>
            <input
              type="text"
              maxLength={500}
              value={form.shortDescription || ''}
              onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              placeholder="Brief 1-2 line summary of your bottling facility..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              About the Company
            </label>
            <textarea
              rows={4}
              value={form.about || ''}
              onChange={(e) => setForm((p) => ({ ...p, about: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              placeholder="Detailed company story, mission, and quality commitment..."
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            <Phone className="w-4 h-4 text-teal-600" />
            Contact Information
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Official Email
              </label>
              <input
                type="email"
                value={form.publicEmail || ''}
                onChange={(e) => setForm((p) => ({ ...p, publicEmail: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Phone Number
              </label>
              <input
                type="text"
                value={form.publicPhone || ''}
                onChange={(e) => setForm((p) => ({ ...p, publicPhone: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Website URL
              </label>
              <input
                type="text"
                value={form.websiteUrl || ''}
                onChange={(e) => setForm((p) => ({ ...p, websiteUrl: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Contact Person
              </label>
              <input
                type="text"
                value={form.contactPerson || ''}
                onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            <MapPin className="w-4 h-4 text-teal-600" />
            Location
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Full Address
            </label>
            <input
              type="text"
              value={form.fullAddress || ''}
              onChange={(e) => setForm((p) => ({ ...p, fullAddress: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
              <input
                type="text"
                value={form.city || ''}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">District</label>
              <input
                type="text"
                value={form.district || ''}
                onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
              <input
                type="text"
                value={form.state || ''}
                onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">PIN Code</label>
              <input
                type="text"
                value={form.pinCode || ''}
                onChange={(e) => setForm((p) => ({ ...p, pinCode: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Google Maps URL
            </label>
            <input
              type="text"
              value={form.googleMapsUrl || ''}
              onChange={(e) => setForm((p) => ({ ...p, googleMapsUrl: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              placeholder="https://maps.google.com/..."
            />
          </div>
        </div>

        {/* Manufacturing Information */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 pb-3 border-b border-slate-100">
            <Factory className="w-4 h-4 text-teal-600" />
            Manufacturing Information
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Factory Introduction
              </label>
              <textarea
                rows={3}
                value={form.factoryIntroduction || ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, factoryIntroduction: e.target.value }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Production Facility Description
              </label>
              <textarea
                rows={3}
                value={form.productionFacilityDescription || ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    productionFacilityDescription: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Manufacturing Infrastructure
              </label>
              <textarea
                rows={3}
                value={form.manufacturingInfrastructure || ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    manufacturingInfrastructure: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Quality Control Facilities
              </label>
              <textarea
                rows={3}
                value={form.qualityControlFacilities || ''}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    qualityControlFacilities: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving Changes...' : 'Save Company Profile'}
          </button>
        </div>
      </form>
    </PageContainer>
  )
}

export default CompanyProfilePage

