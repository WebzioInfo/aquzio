import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { authService } from '../services/auth'
import { getFriendlyError } from '../utils/getFriendlyError'
import { isOwnerUser } from '../utils/permissions'
import AuthLayout from '../layouts/AuthLayout'
import PlatformLayout from '../layouts/PlatformLayout'
import CompanyLayout from '../layouts/CompanyLayout'
import OperatorLayout from '../layouts/OperatorLayout'
import { QCLayout } from '../layouts/QCLayout'
import FinanceDashboardPage from '../pages/company/finance/FinanceDashboardPage'
import ChartOfAccountsPage from '../pages/company/finance/ChartOfAccountsPage'
import JournalEntriesPage from '../pages/company/finance/JournalEntriesPage'
import BusinessFinanceDashboard from '../pages/company/business-finance/BusinessFinanceDashboard'
const LoginPage = React.lazy(() => import('../pages/LoginPage'))
const ForgotPasswordPage = React.lazy(() => import('../pages/ForgotPasswordPage'))
const RegisterPage = React.lazy(() => import('../pages/RegisterPage'))
const OtpVerificationPage = React.lazy(() => import('../pages/OtpVerificationPage'))
const CompanyOnboardingPage = React.lazy(() => import('../pages/CompanyOnboardingPage'))
const PlatformDashboardPage = React.lazy(() => import('../pages/platform/PlatformDashboardPage'))
const PlatformManagementPage = React.lazy(() => import('../pages/platform/PlatformManagementPage'))
const SettingsPage = React.lazy(() => import('../pages/company/SettingsPage').then(module => ({ default: module.SettingsPage })))
const CompanyProfilePage = React.lazy(() => import('../pages/company/CompanyProfilePage'))
const CompanyGalleryPage = React.lazy(() => import('../pages/company/CompanyGalleryPage'))
const CompanyDashboardPage = React.lazy(() => import('../pages/company/CompanyDashboardPage'))
const OwnerDashboardPage = React.lazy(() => import('../pages/company/OwnerDashboardPage'))
const ProductionSetupPage = React.lazy(() => import('../pages/company/ProductionSetupPage'))
const BatchDetailsPage = React.lazy(() => import('../pages/company/BatchDetailsPage'))
const OperatorDashboardPage = React.lazy(() => import('../pages/operator/OperatorDashboardPage'))
const ProductSelectionPage = React.lazy(() => import('../pages/operator/ProductSelectionPage'))
const JarDashboardPage = React.lazy(() => import('../pages/operator/JarDashboardPage'))
const InviteTeamPage = React.lazy(() => import('../pages/InviteTeamPage'))
const AccessDeniedPage = React.lazy(() => import('../pages/AccessDeniedPage'))
const OperationsPage = React.lazy(() => import('../pages/company/OperationsPage'))
const ProvisioningPage = React.lazy(() => import('../pages/ProvisioningPage'))
const NotFoundPage = React.lazy(() => import('../pages/NotFoundPage'))

// Simple Accounts V1 Pages
const AccountsDashboardPage = React.lazy(() => import('../pages/company/accounts/AccountsDashboardPage'))
const ExpenseManagementPage = React.lazy(() => import('../pages/company/accounts/ExpenseManagementPage'))
const PayrollPage = React.lazy(() => import('../pages/company/accounts/PayrollPage'))
const BankAccountsPage = React.lazy(() => import('../pages/company/accounts/BankAccountsPage'))
const BankAccountDetailsPage = React.lazy(() => import('../pages/company/accounts/BankAccountDetailsPage'))
const LedgerPage = React.lazy(() => import('../pages/company/accounts/LedgerPage'))
const UnifiedTransactionsPage = React.lazy(() => import('../pages/company/accounts/UnifiedTransactionsPage'))
const CashBooksPage = React.lazy(() => import('../pages/company/accounts/CashBooksPage'))
const CashBookDetailsPage = React.lazy(() => import('../pages/company/accounts/CashBookDetailsPage'))
const OwnerListPage = React.lazy(() => import('../pages/company/accounts/OwnerListPage'))
const OwnerDetailsPage = React.lazy(() => import('../pages/company/accounts/OwnerDetailsPage'))
const AssetSummaryPage = React.lazy(() => import('../pages/company/accounts/AssetSummaryPage'))
const PurchasesPage = React.lazy(() => import('../pages/company/accounts/PurchasesPage'))
const CreatePurchasePage = React.lazy(() => import('../pages/company/accounts/CreatePurchasePage'))
const PurchaseDetailsPage = React.lazy(() => import('../pages/company/accounts/PurchaseDetailsPage'))
const VendorsPage = React.lazy(() => import('../pages/company/accounts/VendorsPage'))
const VendorDetailsPage = React.lazy(() => import('../pages/company/accounts/VendorDetailsPage'))
const QualityDashboardPage = React.lazy(() => import('../pages/company/qc/QualityDashboardPage').then(module => ({ default: module.QualityDashboardPage })))
const WaterTestReportsListPage = React.lazy(() => import('../pages/company/qc/WaterTestReportsListPage').then(m => ({ default: m.WaterTestReportsListPage })))
const WaterTestReportFormPage = React.lazy(() => import('../pages/company/qc/WaterTestReportFormPage').then(m => ({ default: m.WaterTestReportFormPage })))
const WaterTestReportDetailPage = React.lazy(() => import('../pages/company/qc/WaterTestReportDetailPage').then(m => ({ default: m.WaterTestReportDetailPage })))
const CompliancePage = React.lazy(() => import('../pages/company/qc/CompliancePage').then(m => ({ default: m.CompliancePage })))
const ParametersManagementPage = React.lazy(() => import('../pages/company/qc/ParametersManagementPage').then(m => ({ default: m.ParametersManagementPage })))
const QCSettingsPage = React.lazy(() => import('../pages/company/qc/QCSettingsPage').then(m => ({ default: m.QCSettingsPage })))
const BackupRestorePage = React.lazy(() => import('../pages/admin/BackupRestorePage'))
const PlatformBackupCenterPage = React.lazy(() => import('../pages/platform/PlatformBackupCenterPage'))

// Operations Issues Pages
const OperationsIssuesListPage = React.lazy(() => import('../pages/company/operations/OperationsIssuesListPage'))
const OperationsIssueDetailPage = React.lazy(() => import('../pages/company/operations/OperationsIssueDetailPage'))
const OperatorQuickReportPage = React.lazy(() => import('../pages/company/operations/OperatorQuickReportPage'))
const OperationsIssueFormPage = React.lazy(() => import('../pages/company/operations/OperationsIssueFormPage'))
const ReportsPage = React.lazy(() => import('../pages/company/ReportsPage'))
const UserProfilePage = React.lazy(() => import('../pages/profile/UserProfilePage'))

export const getDefaultRouteForUser = (user: any): string => {
  const getRoute = () => {
    if (!user) return '/login'
    if (!user.emailVerified) {
      return '/verify-otp'
    }

    if (user.tenantId && !user.isTenantInitialized) {
      return '/account-setup'
    }

    const roles = user.roles || []

    if (roles.some((r: string) => ['SuperAdmin', 'PlatformAdmin', 'SupportEngineer', 'PlatformOwner'].includes(r))) {
      return '/platform/dashboard'
    }

    if (!user.tenantId) {
      return '/onboarding'
    }

    if (roles.includes('Operator')) return '/operator/product-selection'
    if (roles.includes('Worker')) return '/worker/dashboard'
    if (roles.some((r: string) => ['Store Keeper', 'StoreKeeper', 'STORE_KEEPER'].includes(r))) return '/store/dashboard'
    if (roles.includes('Sales')) return '/sales/dashboard'

    if (roles.includes('Owner')) return '/company/dashboard'
    if (roles.includes('CompanyAdmin') || roles.includes('Accountant')) return '/company/dashboard'
    if (roles.includes('Manager')) return '/manager/dashboard'
    if (roles.includes('Supervisor')) return '/supervisor/dashboard'
    if (roles.includes('QC')) return '/qc/dashboard'

    return '/company/dashboard'
  }
  const targetRoute = getRoute();
  console.log(`[REDIRECT DECISION]: Target route resolved to '${targetRoute}' for user ${user?.email} with roles: ${JSON.stringify(user?.roles)}`);
  return targetRoute;
}

// Guest Guard (Login, Register, OTP checks)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (isAuthenticated && user) {
    if (!user.emailVerified) {
      if (window.location.pathname === '/verify-otp') {
        return <>{children}</>
      }
      return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
    }
    return <Navigate to={getDefaultRouteForUser(user)} replace />
  }

  return <>{children}</>
}

// Onboarding Guard
const OnboardingRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
  }

  if (user.isTenantInitialized) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />
  }

  const path = window.location.pathname
  if (user.tenantId && !user.isTenantInitialized && path !== '/account-setup') {
    return <Navigate to="/account-setup" replace />
  }

  if (!user.tenantId && path === '/account-setup') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

// Platform Portal Guard (SuperAdmin / PlatformAdmin / SupportEngineer)
const PlatformRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  const roles = user.roles || []
  const hasAccess = roles.some(role =>
    ['SuperAdmin', 'PlatformAdmin', 'SupportEngineer', 'PlatformOwner'].includes(role)
  )

  if (!hasAccess) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}

// Company Portal Guard (CompanyAdmin, managers, corporate roles)
const CompanyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
  }

  if (user.tenantId && !user.isTenantInitialized) {
    return <Navigate to="/account-setup" replace />
  }

  if (!user.tenantId || !user.isTenantInitialized) {
    return <Navigate to="/onboarding" replace />
  }

  const roles = user.roles || []
  const hasAccess = roles.some(role =>
    ['Owner', 'CompanyAdmin', 'Accountant', 'GeneralManager', 'ProductionManager', 'InventoryManager', 'HRManager', 'Supervisor', 'Employee', 'Manager'].includes(role)
  )

  if (!hasAccess && (roles.includes('Operator') || roles.some((r: string) => ['Store Keeper', 'StoreKeeper', 'STORE_KEEPER'].includes(r)) || roles.includes('Sales') || roles.includes('HR'))) {
    return <Navigate to={getDefaultRouteForUser(user)} replace />
  }

  if (!hasAccess) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}

// Guard to deny access to Owner role for restricted operational modules (Production Setup, Brands)
const OwnerRestrictedRoute: React.FC<{ children: React.ReactNode; restrictedTab?: string }> = ({ children, restrictedTab }) => {
  const { user } = useAuthStore()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)

  if (isOwnerUser(user)) {
    if (restrictedTab) {
      if (searchParams.get('tab') === restrictedTab) {
        return <Navigate to="/company/dashboard" replace />
      }
    } else {
      return <Navigate to="/company/dashboard" replace />
    }
  }

  return <>{children}</>
}

// Role-aware Dashboard Dispatcher for Company Dashboard
const CompanyDashboardDispatcher: React.FC = () => {
  const { user } = useAuthStore()
  const isOwner = isOwnerUser(user)

  if (isOwner) {
    return <OwnerDashboardPage />
  }
  return <CompanyDashboardPage />
}

// Universal Authenticated Guard
const AuthenticatedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
  }

  return <>{children}</>
}

// Universal Profile Layout Dispatcher
const UniversalProfileDispatcher: React.FC = () => {
  const { user } = useAuthStore()
  const roles = user?.roles || []

  if (roles.some((r: string) => ['SuperAdmin', 'PlatformAdmin', 'SupportEngineer', 'PlatformOwner'].includes(r))) {
    return <PlatformLayout />
  }

  if (roles.includes('QC')) {
    return <QCLayout />
  }

  if (roles.includes('Operator')) {
    return <OperatorLayout />
  }

  return <CompanyLayout />
}

// Operator Terminal Guard
const OperatorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
  }

  if (user.tenantId && !user.isTenantInitialized) {
    return <Navigate to="/account-setup" replace />
  }

  if (!user.tenantId || !user.isTenantInitialized) {
    return <Navigate to="/onboarding" replace />
  }

  const roles = user.roles || []
  const hasAccess = roles.some(role =>
    ['Operator', 'Store Keeper', 'StoreKeeper', 'STORE_KEEPER', 'Sales', 'HR'].includes(role)
  )

  if (!hasAccess) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}

// QC Guard
const QCRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-otp" replace state={{ email: user.email }} />
  }

  if (user.tenantId && !user.isTenantInitialized) {
    return <Navigate to="/account-setup" replace />
  }

  if (!user.tenantId || !user.isTenantInitialized) {
    return <Navigate to="/onboarding" replace />
  }

  const roles = user.roles || []
  const hasAccess = roles.some(role =>
    ['QC', 'CompanyAdmin', 'Accountant', 'Admin'].includes(role)
  )

  if (!hasAccess) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}

export const AppRoutes: React.FC = () => {
  const { user, token, updateUser, clearAuth } = useAuthStore()
  const [syncing, setSyncing] = React.useState(!!token && !user)
  const [syncError, setSyncError] = React.useState<string | null>(null)
  const syncExecutedRef = React.useRef(false)

  React.useEffect(() => {
    if (!token) {
      setSyncing(false)
      return
    }

    if (syncExecutedRef.current) return
    syncExecutedRef.current = true

    let isSubscribed = true
    const timer = setTimeout(() => {
      if (isSubscribed && syncing) {
        setSyncError('Session synchronization timed out. Please retry or sign in.')
      }
    }, 8000)

    const performSync = async () => {
      try {
        const response = await authService.getSession()
        if (isSubscribed) {
          const sessionData = response.data || (response as any)
          if (response.success !== false && sessionData) {
            updateUser({
              tenantId: sessionData.tenantId,
              roles: sessionData.roles || [],
              permissions: sessionData.permissions || [],
              ownsCompany: sessionData.ownsCompany,
              isTenantInitialized: sessionData.isTenantInitialized,
              tenantStatus: sessionData.tenantStatus,
              emailVerified: sessionData.emailVerified,
              assignedProductionLineId: sessionData.assignedProductionLineId
            })
            setSyncError(null)
          } else {
            setSyncError(response.message || 'Session synchronization failed.')
          }
        }
      } catch (err: any) {
        console.error('[SESSION SYNC ERROR]:', err)
        if (isSubscribed) {
          if (err.response?.status === 401) {
            clearAuth()
          } else {
            const friendly = getFriendlyError(err, 'generic')
            setSyncError(friendly.message)
          }
        }
      } finally {
        clearTimeout(timer)
        if (isSubscribed) {
          setSyncing(false)
        }
      }
    }

    performSync()

    return () => {
      isSubscribed = false
      clearTimeout(timer)
    }
  }, [token, user, updateUser, clearAuth])

  if (syncing) {
    return (
      <div className="relative min-h-screen h-screen w-full flex items-center justify-center font-sans text-slate-900 select-none px-4">
        {/* Background Texture & Brand Ink Overlay */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src="/assets/images/aquzio-login-water-bottling-4k.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(5, 48, 59, 0.83)' }}
            aria-hidden="true"
          />
        </div>

        {/* Centered Auth Card */}
        <div className="relative z-10 auth-card text-center flex flex-col items-center">
          <img
            src="/brand/aquzio-icon-light.png"
            alt="Aquzio"
            className="w-11 h-11 object-contain mb-3"
          />
          {syncError ? (
            <>
              <h1 className="text-[20px] font-semibold text-[#05303B] tracking-tight mb-1">
                Session synchronization failed
              </h1>
              <p className="text-[13px] text-[#5B6B75] mb-5">{syncError}</p>
              <div className="flex items-center gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setSyncError(null)
                    setSyncing(true)
                    syncExecutedRef.current = false
                  }}
                  className="auth-button-primary flex-1"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAuth()
                    setSyncing(false)
                  }}
                  className="auth-button-secondary flex-1"
                >
                  Sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-6 h-6 border-2 border-[#12A89A] border-t-transparent rounded-full animate-spin mb-3 mt-1" />
              <h1 className="text-[18px] font-semibold text-[#05303B] tracking-tight">
                Preparing your workspace...
              </h1>
              <p className="text-[13px] text-[#5B6B75] mt-1">
                Synchronizing your account permissions and plant profile
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <React.Suspense fallback={
      <div className="relative min-h-screen h-screen w-full flex items-center justify-center font-sans text-slate-900 select-none px-4">
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            src="/assets/images/aquzio-login-water-bottling-4k.png"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(5, 48, 59, 0.83)' }}
            aria-hidden="true"
          />
        </div>
        <div className="relative z-10 auth-card text-center flex flex-col items-center">
          <img
            src="/brand/aquzio-icon-light.png"
            alt="Aquzio"
            className="w-11 h-11 object-contain mb-3"
          />
          <div className="w-6 h-6 border-2 border-[#12A89A] border-t-transparent rounded-full animate-spin mb-3 mt-1" />
          <p className="text-[13px] text-[#5B6B75]">
            Loading workspace module...
          </p>
        </div>
      </div>
    }>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to={user ? getDefaultRouteForUser(user) : '/login'} replace />} />

        {/* Guest Auth & Onboarding */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/verify-otp"
            element={
              <PublicRoute>
                <OtpVerificationPage />
              </PublicRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <OnboardingRoute>
                <CompanyOnboardingPage />
              </OnboardingRoute>
            }
          />
          <Route
            path="/invite-team"
            element={
              <OnboardingRoute>
                <InviteTeamPage />
              </OnboardingRoute>
            }
          />
          <Route
            path="/account-setup"
            element={
              <OnboardingRoute>
                <ProvisioningPage />
              </OnboardingRoute>
            }
          />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route path="/404" element={<NotFoundPage />} />
        </Route>

        {/* Operator/Worker Portals */}
        <Route
          path="/operator"
          element={
            <OperatorRoute>
              <OperatorLayout />
            </OperatorRoute>
          }
        >
          <Route index element={<Navigate to="/operator/product-selection" replace />} />
          <Route path="product-selection" element={<ProductSelectionPage />} />
          <Route path="production-allocation" element={<OperatorDashboardPage />} />
          <Route path="dashboard" element={<OperatorDashboardPage />} />
          <Route path="jar" element={<JarDashboardPage />} />
        </Route>

        <Route
          path="/worker"
          element={
            <OperatorRoute>
              <OperatorLayout />
            </OperatorRoute>
          }
        >
          <Route index element={<Navigate to="/worker/dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboardPage />} />
        </Route>



        <Route
          path="/store"
          element={
            <OperatorRoute>
              <OperatorLayout />
            </OperatorRoute>
          }
        >
          <Route index element={<Navigate to="/store/dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboardPage />} />
        </Route>

        <Route
          path="/sales"
          element={
            <OperatorRoute>
              <OperatorLayout />
            </OperatorRoute>
          }
        >
          <Route index element={<Navigate to="/sales/dashboard" replace />} />
          <Route path="dashboard" element={<OperatorDashboardPage />} />
        </Route>




        <Route
          path="/manager"
          element={
            <CompanyRoute>
              <CompanyLayout />
            </CompanyRoute>
          }
        >
          <Route index element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="dashboard" element={<CompanyDashboardPage />} />
          <Route path="*" element={<CompanyDashboardPage />} />
        </Route>

        <Route
          path="/supervisor"
          element={
            <CompanyRoute>
              <CompanyLayout />
            </CompanyRoute>
          }
        >
          <Route index element={<Navigate to="/supervisor/dashboard" replace />} />
          <Route path="dashboard" element={<CompanyDashboardPage />} />
          <Route path="*" element={<CompanyDashboardPage />} />
        </Route>



        {/* Platform Administration Portal */}
        <Route
          path="/platform"
          element={
            <PlatformRoute>
              <PlatformLayout />
            </PlatformRoute>
          }
        >
          <Route index element={<Navigate to="/platform/dashboard" replace />} />
          <Route path="dashboard" element={<PlatformDashboardPage />} />
          <Route path="tenants" element={<PlatformManagementPage />} />
          <Route path="users" element={<PlatformManagementPage />} />
          <Route path="subscriptions" element={<PlatformManagementPage />} />
          <Route path="system-health" element={<PlatformManagementPage />} />
          <Route path="database" element={<PlatformManagementPage />} />
          <Route path="backups" element={<PlatformBackupCenterPage />} />
          <Route path="audit" element={<PlatformManagementPage />} />
          <Route path="settings" element={<PlatformManagementPage />} />
          <Route path="profile" element={<UserProfilePage />} />
        </Route>

        <Route
          path="/company"
          element={
            <CompanyRoute>
              <CompanyLayout />
            </CompanyRoute>
          }
        >
          <Route index element={<Navigate to="/company/dashboard" replace />} />
          <Route path="dashboard" element={<CompanyDashboardDispatcher />} />
          <Route path="dashboard/owner" element={<OwnerDashboardPage />} />
          <Route path="production" element={<CompanyDashboardPage />} />
          <Route path="production-setup" element={<OwnerRestrictedRoute><ProductionSetupPage /></OwnerRestrictedRoute>} />
          <Route path="brands" element={<Navigate to="/company/production-setup?tab=brands" replace />} />
          <Route path="production/batches/:batchId" element={<BatchDetailsPage />} />
          <Route path="production/batches/:id" element={<BatchDetailsPage />} />
          <Route path="inventory" element={<OwnerRestrictedRoute restrictedTab="brands"><CompanyDashboardPage /></OwnerRestrictedRoute>} />
          <Route path="sales" element={<CompanyDashboardPage />} />
          {/* Simple Accounts V1 Routes */}
          <Route path="accounts/dashboard" element={<AccountsDashboardPage />} />
          <Route path="accounts/expenses" element={<ExpenseManagementPage />} />
          <Route path="accounts/purchases" element={<PurchasesPage />} />
          <Route path="accounts/purchases/new" element={<CreatePurchasePage />} />
          <Route path="accounts/purchases/edit/:id" element={<CreatePurchasePage />} />
          <Route path="accounts/purchases/:id" element={<PurchaseDetailsPage />} />
          <Route path="accounts/vendors" element={<VendorsPage />} />
          <Route path="accounts/vendors/:id" element={<VendorDetailsPage />} />
          <Route path="accounts/payroll" element={<PayrollPage />} />
          <Route path="accounts/ledger" element={<UnifiedTransactionsPage />} />
          <Route path="accounts/ledger/bank-accounts" element={<Navigate to="/company/accounts/ledger?type=bank" replace />} />
          <Route path="accounts/ledger/cash-books" element={<Navigate to="/company/accounts/ledger?type=cash" replace />} />
          <Route path="accounts/bank-accounts" element={<Navigate to="/company/accounts/ledger?type=bank" replace />} />
          <Route path="accounts/cash-books" element={<Navigate to="/company/accounts/ledger?type=cash" replace />} />
          <Route path="accounts/bank-accounts/:id" element={<BankAccountDetailsPage />} />
          <Route path="accounts/cash-books/:id" element={<CashBookDetailsPage />} />
          <Route path="accounts/owners" element={<OwnerListPage />} />
          <Route path="accounts/owners/:id" element={<OwnerDetailsPage />} />
          <Route path="accounts/assets" element={<AssetSummaryPage />} />
          <Route path="business-finance" element={<BusinessFinanceDashboard />} />
          <Route path="finance" element={<FinanceDashboardPage />} />
          <Route path="finance/accounts" element={<ChartOfAccountsPage />} />
          <Route path="finance/journals" element={<JournalEntriesPage />} />
          <Route path="customers" element={<CompanyDashboardPage />} />
          <Route path="customers/profile/:customerId" element={<CompanyDashboardPage />} />
          <Route path="suppliers" element={<CompanyDashboardPage />} />
          <Route path="employees" element={<CompanyDashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="company-profile" element={<CompanyProfilePage />} />
          <Route path="gallery" element={<CompanyGalleryPage />} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route path="backups" element={<BackupRestorePage />} />
          <Route path="operations" element={<OperationsPage />} />
          {/* Operations Issues Module */}
          <Route path="operations-issues" element={<OperationsIssuesListPage />} />
          <Route path="operations-issues/quick-report" element={<OperatorQuickReportPage />} />
          <Route path="operations-issues/new" element={<OperationsIssueFormPage />} />
          <Route path="operations-issues/:id" element={<OperationsIssueDetailPage />} />
          <Route path="operations-issues/:id/edit" element={<OperationsIssueFormPage />} />
          {/* Reports Module */}
          <Route path="reports" element={<ReportsPage />} />
          {/* Water Test Reports */}
          <Route path="qc/water-test" element={<WaterTestReportsListPage />} />
          <Route path="qc/water-test/new" element={<OwnerRestrictedRoute><WaterTestReportFormPage /></OwnerRestrictedRoute>} />
          <Route path="qc/water-test/:id" element={<WaterTestReportDetailPage />} />
          <Route path="qc/water-test/:id/edit" element={<OwnerRestrictedRoute><WaterTestReportFormPage /></OwnerRestrictedRoute>} />
        </Route>

        {/* QC Portal */}
        <Route
          path="/qc"
          element={
            <QCRoute>
              <QCLayout />
            </QCRoute>
          }
        >
          <Route index element={<Navigate to="/qc/dashboard" replace />} />
          <Route path="dashboard" element={<QualityDashboardPage />} />
          <Route path="water-tests" element={<WaterTestReportsListPage />} />
          <Route path="water-tests/new" element={<OwnerRestrictedRoute><WaterTestReportFormPage /></OwnerRestrictedRoute>} />
          <Route path="water-tests/:id" element={<WaterTestReportDetailPage />} />
          <Route path="water-tests/:id/edit" element={<OwnerRestrictedRoute><WaterTestReportFormPage /></OwnerRestrictedRoute>} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="parameters" element={<ParametersManagementPage />} />
          <Route path="settings" element={<QCSettingsPage />} />
          <Route path="profile" element={<UserProfilePage />} />
        </Route>

        {/* Universal Profile Routes (Accessible to ALL authenticated roles) */}
        <Route
          path="/profile"
          element={
            <AuthenticatedRoute>
              <UniversalProfileDispatcher />
            </AuthenticatedRoute>
          }
        >
          <Route index element={<UserProfilePage />} />
        </Route>

        <Route
          path="/me"
          element={
            <AuthenticatedRoute>
              <UniversalProfileDispatcher />
            </AuthenticatedRoute>
          }
        >
          <Route index element={<UserProfilePage />} />
        </Route>

        <Route
          path="/account"
          element={
            <AuthenticatedRoute>
              <UniversalProfileDispatcher />
            </AuthenticatedRoute>
          }
        >
          <Route index element={<UserProfilePage />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to={user ? getDefaultRouteForUser(user) : '/login'} replace />} />
      </Routes>
    </React.Suspense>
  )
}

export default AppRoutes
