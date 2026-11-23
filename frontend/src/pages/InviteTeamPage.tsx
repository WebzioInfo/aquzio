import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { onboardingService } from '../services/onboarding'
import { useNotificationStore } from '../store/useNotificationStore'
import { useAuthStore } from '../store/useAuthStore'
import { getFriendlyError } from '../utils/getFriendlyError'
import { Mail, Trash2, ArrowRight, Loader2, Plus, Users, AlertCircle } from 'lucide-react'

const inviteSchema = z.object({
  email: z.string().min(1, 'Enter an email address').email('Enter a valid work email'),
  role: z.string().min(1, 'Select a role'),
})

type InviteFormInputs = z.infer<typeof inviteSchema>

interface Invitee {
  email: string
  role: string
}

export const InviteTeamPage: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useNotificationStore()
  const { updateUser } = useAuthStore()
  const [invitees, setInvitees] = useState<Invitee[]>([])
  const [sending, setSending] = useState(false)
  const [errorBanner, setErrorBanner] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    document.title = 'Invite team · Aquzio'
  }, [])

  const roles = [
    { label: 'QC (Quality Control)', value: 'QC' },
    { label: 'Operator', value: 'Operator' },
    { label: 'Manager', value: 'Manager' },
    { label: 'Admin', value: 'Admin' },
    { label: 'Inventory', value: 'Inventory' },
    { label: 'Owner', value: 'Owner' },
  ]

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormInputs>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'Operator',
    },
  })

  const onAddInvitee = (data: InviteFormInputs) => {
    setErrorBanner(null)
    if (invitees.some((i) => i.email.toLowerCase() === data.email.toLowerCase())) {
      setErrorBanner({
        title: 'Email already added',
        message: 'This email is already in your invite list.'
      })
      return
    }
    setInvitees([...invitees, { email: data.email, role: data.role }])
    reset({ email: '', role: 'Operator' })
  }

  const onRemoveInvitee = (index: number) => {
    setInvitees(invitees.filter((_, idx) => idx !== index))
  }

  const handleSendInvites = async () => {
    if (invitees.length === 0) {
      updateUser({ isTenantInitialized: true })
      navigate('/company/dashboard')
      return
    }

    setSending(true)
    setErrorBanner(null)
    try {
      for (const invitee of invitees) {
        await onboardingService.inviteMember(invitee)
      }
      showToast(`Invited ${invitees.length} team member(s) successfully`, 'success')
      updateUser({ isTenantInitialized: true })
      navigate('/company/dashboard')
    } catch (error: any) {
      const friendly = getFriendlyError(error, 'generic')
      setErrorBanner({
        title: friendly.title,
        message: friendly.message
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="auth-card-wide"
    >
      {/* Top circle mark, title, and subtitle */}
      <div className="flex flex-col items-center text-center select-none mb-6">
        <img
          src="/brand/aquzio-icon-light.png"
          alt="Aquzio"
          className="w-11 h-11 object-contain mb-3"
        />
        <h1 className="text-[22px] font-semibold text-[#05303B] tracking-tight leading-tight">
          Invite your team
        </h1>
        <p className="text-[14px] text-[#5B6B75] mt-1 leading-normal">
          Add operators, plant managers, and administrators to your workspace.
        </p>
      </div>

      {/* Friendly Error Banner */}
      <AnimatePresence>
        {errorBanner && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="auth-error-banner mb-5"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block text-[13px] text-red-900 leading-snug">
                {errorBanner.title}
              </span>
              <span className="text-[13px] text-red-800 leading-snug mt-0.5 block">
                {errorBanner.message}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Invitee Row */}
      <form onSubmit={handleSubmit(onAddInvitee)} className="space-y-3" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-7">
            <label htmlFor="invite-email" className="auth-label">
              Team Member Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5B6B75]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'invite-email-error' : undefined}
                {...register('email')}
                className={`auth-input pl-10 pr-3.5 ${errors.email ? 'auth-input-error' : ''}`}
              />
            </div>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="invite-role" className="auth-label">
              Role
            </label>
            <select
              id="invite-role"
              {...register('role')}
              className="auth-input px-3"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="auth-button-secondary w-full"
              title="Add member"
            >
              <Plus className="w-4 h-4" />
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {errors.email?.message && (
          <div id="invite-email-error" className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errors.email.message}</span>
          </div>
        )}
      </form>

      {/* Invitee List */}
      <div className="mt-5 space-y-2">
        <span className="auth-label">Pending Invitations ({invitees.length})</span>
        {invitees.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-[#E3E8EC] rounded-xl text-center text-xs text-[#5B6B75] select-none">
            No team members added yet. You can invite members now or skip and add them later from Settings.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {invitees.map((invitee, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-white border border-[#E3E8EC] rounded-lg text-xs"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-6 h-6 rounded-full bg-[#12A89A]/10 text-[#0B7A70] flex items-center justify-center font-bold shrink-0">
                    {invitee.email.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-[#05303B] truncate">{invitee.email}</span>
                  <span className="text-[11px] font-semibold text-[#5B6B75] px-2 py-0.5 rounded bg-slate-100">
                    {invitee.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveInvitee(idx)}
                  className="text-[#94A3AD] hover:text-red-600 transition-colors p-1"
                  aria-label="Remove invitee"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Footer Row */}
      <div className="flex items-center justify-between border-t border-[#E8EDF0] pt-5 mt-6">
        <button
          type="button"
          onClick={() => {
            updateUser({ isTenantInitialized: true })
            navigate('/company/dashboard')
          }}
          disabled={sending}
          className="auth-button-text"
        >
          <span>Skip for now</span>
        </button>

        <button
          type="button"
          onClick={handleSendInvites}
          disabled={sending}
          className="auth-button-primary w-auto px-6 ml-auto"
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Sending invites...</span>
            </>
          ) : (
            <>
              <span>{invitees.length > 0 ? 'Send Invites & Continue' : 'Continue to Dashboard'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  )
}

export default InviteTeamPage
