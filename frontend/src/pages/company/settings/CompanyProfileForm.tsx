import React, { useState, useEffect } from 'react'
import { api } from '../../../services/api'
import { useNotificationStore } from '../../../store/useNotificationStore'
import {
  Building2, Mail, Phone, MapPin, Globe2, Calendar, ShieldCheck, Database, Layers,
  Upload, Trash2, Camera, RefreshCw, CheckCircle2
} from 'lucide-react'
import { setCompanyPrefs } from '../../../utils/dateFormatter'

export const CompanyProfileForm: React.FC = () => {
  const { showToast } = useNotificationStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  // Editable fields state
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [badgeLetters, setBadgeLetters] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [language, setLanguage] = useState('en')
  const [currency, setCurrency] = useState('INR')
  const [dateFormat, setDateFormat] = useState('dd MMM yyyy')
  const [timeFormat, setTimeFormat] = useState('12h')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/v1/company/settings')
      if (res.data?.success && res.data?.data) {
        const data = res.data.data
        setProfile(data)
        setName(data.name || '')
        setDisplayName(data.displayName || '')
        setBadgeLetters(data.badgeLetters || '')
        setEmail(data.email || '')
        setPhone(data.phone || '')
        setGstNumber(data.gstNumber || '')
        setAddress(data.address || '')
        setTimezone(data.timeZone || 'Asia/Kolkata')
        setLanguage(data.language || 'en')
        setCurrency(data.currency || 'INR')
        setDateFormat(data.dateFormat || 'dd MMM yyyy')
        setTimeFormat(data.timeFormat || '12h')
        setLogoUrl(data.logoUrl || '')

        // Cache globally for UI formatting
        setCompanyPrefs({
          timeZone: data.timeZone || 'Asia/Kolkata',
          dateFormat: data.dateFormat || 'dd MMM yyyy',
          timeFormat: data.timeFormat || '12h'
        })

        // Cache globally for PDF generators
        try {
          localStorage.setItem('aquzio_company_profile', JSON.stringify({
            name: data.name,
            displayName: data.displayName || data.name,
            badgeLetters: data.badgeLetters,
            email: data.email,
            phone: data.phone,
            gstNumber: data.gstNumber,
            address: data.address,
            city: data.city,
            state: data.state,
            country: data.country,
            pincode: data.pincode || data.postalCode,
            logoUrl: data.logoUrl,
            currency: data.currency
          }))
        } catch {}
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load company profile.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  const handleLogoUpload = async (file: File) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast('Logo file size must be less than 5 MB.', 'error')
      return
    }

    try {
      setUploadingLogo(true)
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/api/v1/company/logo/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      if (res.data?.success && res.data?.data) {
        showToast('Company logo uploaded to Cloudinary successfully.', 'success')
        fetchProfile()
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to upload company logo.', 'error')
    } finally {
      setUploadingLogo(false)
      setLogoFile(null)
    }
  }

  const handleLogoRemove = async () => {
    try {
      setUploadingLogo(true)
      const res = await api.delete('/api/v1/company/logo')
      if (res.data?.success) {
        setLogoUrl('')
        showToast('Company logo removed successfully.', 'success')
        fetchProfile()
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to remove company logo.', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await api.put('/api/v1/company/settings', {
        name,
        displayName,
        badgeLetters: badgeLetters.trim().toUpperCase(),
        email,
        phone,
        gstNumber,
        address,
        timezone,
        language,
        currency,
        dateFormat,
        timeFormat,
        logoUrl
      })
      if (res.data?.success) {
        showToast('Company profile updated successfully.', 'success')
        fetchProfile()
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT COLUMN: COMPANY PROFILE CARD */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden sticky top-6">
          <div className="p-6 text-center border-b border-slate-100 bg-slate-50/50">
            <div className="relative w-24 h-24 mx-auto mb-4 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center overflow-hidden group shadow-2xs">
              {logoUrl ? (
                <img src={logoUrl} alt="Company Logo" className="w-full h-full object-contain p-1" />
              ) : badgeLetters ? (
                <div className="w-full h-full flex items-center justify-center bg-teal-50 text-teal-700 font-bold text-2xl tracking-wider">
                  {badgeLetters.trim().slice(0, 3).toUpperCase()}
                </div>
              ) : (
                <Building2 className="w-12 h-12 text-slate-400" />
              )}

              <label
                htmlFor="sidebar-logo-file-input"
                className="absolute inset-0 bg-slate-900/60 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                title="Change Logo"
              >
                <Camera className="w-5 h-5 mb-0.5" />
                <span className="text-[9px] font-bold">Change</span>
              </label>
              <input
                type="file"
                id="sidebar-logo-file-input"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(file)
                }}
              />
            </div>
            <h3 className="text-base font-bold text-slate-800">{displayName || name || 'Aquzio Company'}</h3>
            <p className="text-xs text-slate-500 font-mono mt-1">Code: {profile?.tenantCode || 'N/A'}</p>
            {logoUrl && (
              <button
                type="button"
                onClick={handleLogoRemove}
                disabled={uploadingLogo}
                className="mt-2 text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove Logo</span>
              </button>
            )}
          </div>

          <div className="p-4 space-y-3.5 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] text-slate-400 font-medium">EMAIL</span>
                <span className="block truncate font-medium text-slate-700">{email || 'Not configured'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">PHONE</span>
                <span className="block font-medium text-slate-700">{phone || 'Not configured'}</span>
              </div>
            </div>

            {/* <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">TENANT ID</span>
                <span className="block font-mono text-slate-700 select-all">{profile?.tenantId || 'N/A'}</span>
              </div>
            </div> */}

            {/* <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">SCHEMA NAME</span>
                <span className="block font-mono text-slate-700">{profile?.schemaName || 'public'}</span>
              </div>
            </div> */}

            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">SUBSCRIPTION</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  {profile?.subscriptionPlan || 'Starter'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">CREATED DATE</span>
                <span className="block font-medium text-slate-700">
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: EDITABLE PROFILE FORM */}
      <div className="lg:col-span-2">
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-800">Edit Company Profile</h3>
            <p className="text-xs text-slate-500 mt-1">Configure identity and business metadata for your workspace.</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                  placeholder="e.g. Aquzio Industries Ltd"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                  placeholder="e.g. Aquzio"
                />
              </div>

              {/* Brand Badge Initials / Acronym */}
              <div className="md:col-span-2 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-800 mb-0.5">
                      Brand Badge Initials / Acronym
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      2-3 character initials displayed on your public verified partner badge (e.g., BioDrops partner cards and profiles).
                    </p>
                    <input
                      type="text"
                      maxLength={4}
                      value={badgeLetters}
                      onChange={(e) => setBadgeLetters(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      className="w-full sm:w-48 text-sm font-bold tracking-wider uppercase border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border bg-white"
                      placeholder="e.g. AM"
                    />
                  </div>
                  <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-center">
                    <div className="text-right">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Partner Badge</span>
                      <span className="text-[11px] text-slate-600 font-medium">Live Preview</span>
                    </div>
                    <div className="w-11 h-11 rounded-full bg-teal-50 text-teal-700 border-2 border-teal-200/80 flex items-center justify-center font-bold text-sm tracking-wider shadow-inner">
                      {badgeLetters ? badgeLetters.slice(0, 3).toUpperCase() : (displayName || name || 'CO').slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Company Logo (Cloudinary Storage)</span>
                  {logoUrl && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Logo Configured
                    </span>
                  )}
                </label>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="file"
                    id="form-logo-file-input"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={uploadingLogo}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(file)
                    }}
                  />
                  <label
                    htmlFor="form-logo-file-input"
                    className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer flex items-center gap-2"
                  >
                    {uploadingLogo ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>Upload New Logo (PNG / JPG / WebP)</span>
                      </>
                    )}
                  </label>

                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      disabled={uploadingLogo}
                      className="px-3 py-2 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <input
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full text-xs border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2 border bg-white text-slate-500 truncate"
                      placeholder="Or enter direct image URL"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">GST Number</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                  placeholder="GST Number (optional)"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                  placeholder="e.g. info@aquzio.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                  placeholder="e.g. +1 555-123-4567"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border resize-none"
                placeholder="Full corporate headquarters address..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Time Zone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="UTC">UTC (GMT)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                >
                  <option value="en">English (US)</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date Format</label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                >
                  <option value="dd MMM yyyy">dd MMM yyyy (e.g. 04 Aug 2026)</option>
                  <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                  <option value="dd-MM-yyyy">dd-MM-yyyy</option>
                  <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Time Format</label>
                <select
                  value={timeFormat}
                  onChange={(e) => setTimeFormat(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border"
                >
                  <option value="12h">12-Hour (AM/PM)</option>
                  <option value="24h">24-Hour</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full text-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg p-2.5 border bg-white"
                >
                  <option value="INR">INR — Indian Rupee (₹)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — Pound Sterling (£)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center gap-2"
            >
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
