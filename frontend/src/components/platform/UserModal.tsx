import React, { useState, useEffect } from 'react'
import { User, Mail, Lock, ShieldCheck, Building, Phone, X } from 'lucide-react'

interface UserModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
  initialData?: any
  isEditing?: boolean
  tenantsList?: any[]
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
  tenantsList = []
}) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    phone: '',
    password: '',
    roleName: 'Operator',
    department: 'Administration',
    status: 'Active',
    tenantId: ''

  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) {
      setFormData({
        firstName: initialData.firstName || (initialData.name ? initialData.name.split(' ')[0] : ''),
        lastName: initialData.lastName || (initialData.name ? initialData.name.split(' ').slice(1).join(' ') : ''),
        email: initialData.email || '',
        username: initialData.username || '',
        phone: initialData.phone || '',
        password: '',
        roleName: initialData.roleName || 'Operator',
        department: initialData.department || 'Administration',
        status: initialData.status || (initialData.isActive ? 'Active' : 'Inactive'),
        tenantId: initialData.tenantId || ''
      })
    } else {
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        phone: '',
        password: '',
        roleName: 'Operator',
        department: 'Administration',
        status: 'Active',
        tenantId: ''
      })
    }
    setError(null)
  }, [initialData, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email.trim()) {
      setError('Email is required.')
      return
    }
    if (!isEditing && !formData.password) {
      setError('Password is required for new accounts.')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await onSubmit({
        ...formData,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        tenantId: formData.tenantId || null
      })
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Operation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity" />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-10 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit User Account Profile' : 'Create User Account'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-semibold">
              {error}
            </div>
          )}

          {/* User Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">First Name *</label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="Jane"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Smith"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Email & Username */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Corporate Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="jane.smith@company.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="jsmith"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Password & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                {isEditing ? 'Password (Leave blank to keep unchanged)' : 'Password *'}
              </label>
              <input
                type="password"
                required={!isEditing}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Phone Number</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 019-2831"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Role, Department & Tenant */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Privilege Role</label>
              <select
                value={formData.roleName}
                onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="SuperAdmin">SuperAdmin</option>
                <option value="CompanyAdmin">CompanyAdmin</option>
                <option value="QC">QC (Quality Control Chemist)</option>
                <option value="Owner">Owner</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="Operator">Operator</option>
                <option value="Standard">Standard</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Department</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="Administration">Administration</option>
                <option value="Operations">Operations</option>
                <option value="Production">Production</option>
                <option value="Sales">Sales</option>
                <option value="Finance">Finance</option>
                <option value="HR">HR</option>
                <option value="IT">IT Support</option>
                <option value="Quality">Quality</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Assigned Tenant */}
          {tenantsList.length > 0 && (
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Assigned Tenant Scope</label>
              <select
                value={formData.tenantId}
                onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="">Global Platform (No Specific Tenant)</option>
                {tenantsList.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.schemaName})</option>
                ))}
              </select>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create User'}
            </button>
          </div>

        </form>

      </div>
    </div>
  )
}

export default UserModal
