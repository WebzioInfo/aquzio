import React, { useState, useEffect } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useThemeStore } from '../store/useThemeStore'
import { useNotificationStore } from '../store/useNotificationStore'
import ToastContainer from '../components/ui/ToastContainer'
import BRAND from '../config/brand'
import { api, API_BASE_URL } from '../services/api'
import { setCompanyPrefs } from '../utils/dateFormatter'
import {
  LayoutDashboard, Factory, Package, TrendingUp, Users, Truck,
  Settings, ChevronRight, Play, Plus, X, Layers, Workflow, CalendarClock, Sliders,
  Droplet, Droplets, Boxes, ShoppingCart, PieChart, IdCard, Beaker, Database, AlertTriangle, BarChart3
} from 'lucide-react'
import EnterpriseSidebar from '../components/ui/EnterpriseSidebar'
import EnterpriseTopbar from '../components/ui/EnterpriseTopbar'
import EnterpriseModal from '../components/ui/EnterpriseModal'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HubConnectionBuilder, HttpTransportType } from '@microsoft/signalr'
import { operationsIssueApi } from '../services/api/operationsIssue'
import { filterSidebarItemsForUser } from '../utils/permissions'

export const CompanyLayout: React.FC = () => {
  const { user, clearAuth } = useAuthStore()
  const { theme, toggleTheme, initTheme } = useThemeStore()
  const { showToast } = useNotificationStore()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  // Initial sync unread count (real-time updates powered by SignalR)
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['operationsUnreadCount'],
    queryFn: async () => {
      try {
        const res = await operationsIssueApi.getUnreadCount()
        return res.data?.unreadCount || 0
      } catch {
        return 0
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })

  // Initial sync latest notifications (real-time updates powered by SignalR)
  const { data: notificationsList = [] } = useQuery<any[]>({
    queryKey: ['operationsLatestNotifications'],
    queryFn: async () => {
      try {
        const res = await operationsIssueApi.getLatestNotifications(5)
        return res.data || []
      } catch {
        return []
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false
  })

  // Real-time SignalR Connection to /hubs/dashboard
  useEffect(() => {
    let hubConn: any = null
    let isMounted = true

    const connectHub = async () => {
      try {
        hubConn = new HubConnectionBuilder()
          .withUrl(`${API_BASE_URL}/hubs/dashboard`, {
            skipNegotiation: true,
            transport: HttpTransportType.WebSockets
          })
          .withAutomaticReconnect([1000, 2000, 5000, 10000, 30000])
          .build()

        const handleIncomingEvent = (evt: any) => {
          if (!isMounted) return
          const eventType = evt?.event_type || ''
          if (eventType === 'operations-issue-created' || eventType.includes('operations-issue')) {
            queryClient.invalidateQueries({ queryKey: ['operationsUnreadCount'] })
            queryClient.invalidateQueries({ queryKey: ['operationsLatestNotifications'] })
            queryClient.invalidateQueries({ queryKey: ['operationsDashboard'] })

            if (evt?.issue) {
              window.dispatchEvent(new CustomEvent('operations-issue-created', { detail: evt.issue }))
            }
          }
          if (eventType.includes('updated') || eventType.includes('read') || eventType.includes('commented')) {
            queryClient.invalidateQueries({ queryKey: ['operationsUnreadCount'] })
            queryClient.invalidateQueries({ queryKey: ['operationsLatestNotifications'] })
            queryClient.invalidateQueries({ queryKey: ['operationsDashboard'] })

            if (evt?.issue) {
              window.dispatchEvent(new CustomEvent('operations-issue-updated', { detail: evt.issue }))
            }
          }
        }

        hubConn.on('OperationsIssueCreated', handleIncomingEvent)
        hubConn.on('OperationsIssueUpdated', handleIncomingEvent)
        hubConn.on('DashboardEvent', handleIncomingEvent)

        await hubConn.start()
        if (user?.tenantId) {
          await hubConn.invoke('SubscribeToTenant', user.tenantId)
        }
      } catch (err) {
        // Fallback polling handles updates if SignalR fails to connect
      }
    }

    connectHub()

    return () => {
      isMounted = false
      if (hubConn) {
        hubConn.stop()
      }
    }
  }, [user?.tenantId, queryClient])

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

  const handleMarkAllRead = async () => {
    try {
      await operationsIssueApi.markAllIssuesAsRead()
      queryClient.invalidateQueries({ queryKey: ['operationsUnreadCount'] })
      queryClient.invalidateQueries({ queryKey: ['operationsLatestNotifications'] })
      queryClient.invalidateQueries({ queryKey: ['operationsIssues'] })
      showToast('All notifications marked as read.', 'success')
    } catch {
      showToast('Failed to mark all read.', 'error')
    }
  }

  const handleNotificationClick = (id: string) => {
    setNotificationsOpen(false)
    navigate(`/company/operations-issues/${id}`)
  }

  const rawSidebarItems = [
    { label: 'Dashboard', path: '/company/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Production Batches', path: '/company/production', icon: <Layers className="w-5 h-5" /> },
    { label: 'Production Setup', path: '/company/production-setup', icon: <Sliders className="w-5 h-5" /> },
    { label: '20L Operations', path: '/company/operations', icon: <Droplet className="w-5 h-5" /> },
    { label: 'Products Inventory', path: '/company/inventory', icon: <Package className="w-5 h-5" /> },
    { label: 'Raw Materials', path: '/company/inventory?tab=raw_materials', icon: <Boxes className="w-5 h-5" /> },
    { label: 'Sales', path: '/company/sales', icon: <ShoppingCart className="w-5 h-5" /> },
    {
      label: 'Accounts',
      icon: <PieChart className="w-5 h-5" />,
      children: [
        { label: 'Dashboard', path: '/company/accounts/dashboard' },
        { label: 'Expenses', path: '/company/accounts/expenses' },
        { label: 'Purchases', path: '/company/accounts/purchases' },
        { label: 'Vendors', path: '/company/accounts/vendors' },
        { label: 'Payroll', path: '/company/accounts/payroll' },
        { label: 'Ledger', path: '/company/accounts/ledger' },
        { label: 'Owners', path: '/company/accounts/owners' },
        { label: 'Assets', path: '/company/accounts/assets' },
      ]
    },
    { label: 'Water Test Reports', path: '/company/qc/water-test', icon: <Droplets className="w-5 h-5" /> },
    { label: 'Reports', path: '/company/reports', icon: <BarChart3 className="w-5 h-5" /> },
    // { label: 'Business Intelligence', path: '/company/business-finance', icon: <TrendingUp className="w-5 h-5" /> },
    { label: 'Customers', path: '/company/customers', icon: <Users className="w-5 h-5" /> },
    { label: 'Employees', path: '/company/employees', icon: <IdCard className="w-5 h-5" /> },
    {
      label: 'Operations Issues',
      path: '/company/operations-issues',
      icon: <AlertTriangle className="w-5 h-5" />,
      badge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
      pulseBadge: unreadCount > 0
    },
    { label: 'Company Settings', path: '/company/settings', icon: <Settings className="w-5 h-5" /> },
    { label: 'Backup & Restore', path: '/company/backups', icon: <Database className="w-5 h-5" /> },
  ]

  const sidebarItems = filterSidebarItemsForUser(rawSidebarItems, user)

  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(x => x)
    const isBrandsTab = location.pathname === '/company/production-setup' && new URLSearchParams(location.search).get('tab') === 'brands'

    return (
      <div className="flex items-center select-none text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
        <Link to="/company" className="hover:text-[#111827] transition-colors">
          {user?.companyName || user?.tenantName || BRAND.name}
        </Link>
        {paths.map((path, idx) => {
          const isLast = idx === paths.length - 1
          const url = `/${paths.slice(0, idx + 1).join('/')}`
          const formattedName = path === 'production-setup'
            ? 'Production Setup'
            : path.charAt(0).toUpperCase() + path.slice(1)

          return (
            <span key={url} className="flex items-center">
              <ChevronRight className="w-3.5 h-3.5 text-[#6B7280] mx-1 shrink-0" />
              {isLast && !isBrandsTab ? (
                <span className="text-[#111827] font-bold">{formattedName}</span>
              ) : (
                <Link to={url} className="text-[#6B7280] hover:text-[#111827] transition-colors">
                  {formattedName}
                </Link>
              )}
            </span>
          )
        })}
        {isBrandsTab && (
          <span className="flex items-center">
            <ChevronRight className="w-3.5 h-3.5 text-[#6B7280] mx-1 shrink-0" />
            <span className="text-[#111827] font-bold">Brands</span>
          </span>
        )}
      </div>
    )
  }

  const triggerQuickAction = (actionName: string) => {
    showToast(`Quick Action triggered: ${actionName}`, 'success')
    setShowQuickActions(false)
  }

  const isFitScreenRoute =
    location.pathname === '/company/accounts/expenses' ||
    location.pathname === '/company/accounts/purchases' ||
    location.pathname === '/company/accounts/vendors' ||
    location.pathname === '/company/accounts/payroll'

  return (
    <div className={`flex bg-[#F7F9FC] text-[#101828] ${isFitScreenRoute ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
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
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isFitScreenRoute ? 'h-full overflow-hidden' : ''}`}
        style={{ paddingLeft: sidebarCollapsed ? '80px' : '256px' }}
      >
        <EnterpriseTopbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          breadcrumbs={getBreadcrumbs()}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => setNotificationsOpen(!notificationsOpen)}
          profileMenuOpen={profileMenuOpen}
          onToggleProfileMenu={() => setProfileMenuOpen(!profileMenuOpen)}
          user={user}
          onLogout={handleLogout}
          notificationsCount={unreadCount}
          notificationsList={notificationsList}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={handleMarkAllRead}
        />

        {/* Content Viewport */}
        <main className={`flex-1 relative ${isFitScreenRoute ? 'overflow-hidden min-h-0 p-3 sm:p-4 md:p-5 flex flex-col' : 'p-6'}`}>
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
export default CompanyLayout
