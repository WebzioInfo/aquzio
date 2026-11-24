import React, { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import { useNotificationStore } from '../store/useNotificationStore'
import ToastContainer from '../components/ui/ToastContainer'
import BRAND from '../config/brand'
import { api } from '../services/api'
import { setCompanyPrefs } from '../utils/dateFormatter'
import {
  LayoutDashboard, Factory, Package, TrendingUp, Users, Truck,
  Settings, ChevronRight, Play, Plus, X, Layers, Workflow, CalendarClock,
  Droplet, Droplets, Boxes, Tag, ShoppingCart, PieChart, IdCard, Beaker,
  Sliders, FlaskConical
} from 'lucide-react'
import EnterpriseSidebar from '../components/ui/EnterpriseSidebar'
import EnterpriseTopbar from '../components/ui/EnterpriseTopbar'
import EnterpriseModal from '../components/ui/EnterpriseModal'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'

export const QCLayout: React.FC = () => {
  const { user, clearAuth } = useAuthStore()
  const { theme, toggleTheme, initTheme } = useThemeStore()
  const { showToast } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    initTheme()
    const loadSettings = async () => {
      try {
        const res = await api.get('/api/v1/company/settings')
        if (res.data?.success && res.data?.data) {
          const data = res.data.data
          setCompanyPrefs({
            timeZone: data.timeZone || 'Asia/Kolkata',
            dateFormat: data.dateFormat || 'dd MMM yyyy',
            timeFormat: data.timeFormat || '12h'
          })
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
      } catch (err) {
        console.error('Failed to prefetch company settings:', err)
      }
    }
    loadSettings()
  }, [])

  const handleLogout = () => {
    clearAuth()
    showToast('Successfully logged out.', 'info')
    navigate('/login')
  }

  const sidebarItems = [
    { label: 'Quality Control', path: '/qc/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Water Test Reports', path: '/qc/water-tests', icon: <Droplets className="w-5 h-5" /> },
    { label: 'Laboratory Parameters', path: '/qc/parameters', icon: <Sliders className="w-5 h-5" /> },
    { label: 'QC Settings', path: '/qc/settings', icon: <Settings className="w-5 h-5" /> },
  ]

  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(x => x)
    return (
      <div className="flex items-center select-none text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
        <Link to="/qc/dashboard" className="hover:text-[#111827] transition-colors">
          {user?.companyName || user?.tenantName || BRAND.name}
        </Link>
        {paths.map((path, idx) => {
          const isLast = idx === paths.length - 1
          const url = `/${paths.slice(0, idx + 1).join('/')}`
          const formattedName = path.charAt(0).toUpperCase() + path.slice(1)

          return (
            <span key={url} className="flex items-center">
              <ChevronRight className="w-3.5 h-3.5 text-[#6B7280] mx-1 shrink-0" />
              {isLast ? (
                <span className="text-[#111827] font-bold">{formattedName}</span>
              ) : (
                <Link to={url} className="text-[#6B7280] hover:text-[#111827] transition-colors">
                  {formattedName}
                </Link>
              )}
            </span>
          )
        })}
      </div>
    )
  }

  const triggerQuickAction = (actionName: string) => {
    showToast(`Quick Action triggered: ${actionName}`, 'success')
    setShowQuickActions(false)
  }

  return (
    <div className="min-h-screen flex bg-[#F7F9FC] text-[#101828]">
      <GlobalSearchModal />

      {/* Reusable Enterprise Sidebar */}
      <EnterpriseSidebar
        collapsed={sidebarCollapsed}
        items={sidebarItems}
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* Main Panel Viewport */}
      <div
        className="flex-1 flex flex-col min-w-0 transition-all duration-300"
        style={{ paddingLeft: sidebarCollapsed ? '80px' : '256px' }}
      >
        {/* Reusable Enterprise Topbar */}
        <EnterpriseTopbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => setNotificationsOpen(!notificationsOpen)}
          profileMenuOpen={profileMenuOpen}
          onToggleProfileMenu={() => setProfileMenuOpen(!profileMenuOpen)}
          user={user}
          onLogout={handleLogout}
        />

        {/* Content Viewport */}
        <main className="flex-1 p-6 relative">
          {/* Quick Actions Portal Trigger Floating Button or Topbar Hook */}


          <Outlet />
        </main>
      </div>

      {/* Premium Light Theme Quick Actions Portal */}
      {showQuickActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setShowQuickActions(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-full max-w-[600px] bg-white border border-gray-200 p-6 sm:p-8 rounded-[16px] shadow-xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200 z-10"
            role="dialog" aria-modal="true" aria-labelledby="qa-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowQuickActions(false);
            }}>

            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 id="qa-modal-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-xl">⚡</span> Quick Actions Portal
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Access frequently used actions instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickActions(false)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => triggerQuickAction('Create Production Batch')} className="group flex flex-col gap-2 p-5 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-[12px] transition-all cursor-pointer text-left shadow-sm hover:shadow-md">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Create Batch</h4>
                <p className="text-xs text-gray-500">Initialize a water run in operations.</p>
              </button>

              <button onClick={() => triggerQuickAction('Create Sales Order')} className="group flex flex-col gap-2 p-5 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 rounded-[12px] transition-all cursor-pointer text-left shadow-sm hover:shadow-md">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Sales Order</h4>
                <p className="text-xs text-gray-500">Bill a wholesale buyer directly.</p>
              </button>

              <button onClick={() => triggerQuickAction('Receive Materials')} className="group flex flex-col gap-2 p-5 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-[12px] transition-all cursor-pointer text-left shadow-sm hover:shadow-md">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Receive Stock</h4>
                <p className="text-xs text-gray-500">Accept raw materials into inventory.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
export default QCLayout
