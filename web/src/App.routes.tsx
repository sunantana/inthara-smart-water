import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import { useAuthSession } from './lib/auth';
import { getDefaultPathForRole } from './lib/modules';

// lazy ต่อโมดูล → Vite แยก chunk ตาม route (code-split) ตาม 02 §2
const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const CustomerPortalPage = lazy(() => import('./modules/portal/CustomerPortalPage'));
const DashboardPage = lazy(() => import('./modules/reports/DashboardPage'));
const CustomersPage = lazy(() => import('./modules/crm/CustomersPage'));
const PriceTiersPage = lazy(() => import('./modules/pricing/PriceTiersPage'));
const OrdersPage = lazy(() => import('./modules/orders/OrdersPage'));
const CheckinsPage = lazy(() => import('./modules/delivery/CheckinsPage'));
const BillingPage = lazy(() => import('./modules/billing/BillingPage'));
const TmsPage = lazy(() => import('./modules/tms/TmsPage'));
const ProductionPage = lazy(() => import('./modules/production/ProductionPage'));
const InventoryPage = lazy(() => import('./modules/inventory/InventoryPage'));
const MaintenancePage = lazy(() => import('./modules/cmms/MaintenancePage'));
const AssetsPage = lazy(() => import('./modules/assets/AssetsPage'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage'));
const ExpensesPage = lazy(() => import('./modules/expenses/ExpensesPage'));
const PortalAdminPage = lazy(() => import('./modules/portal/PortalAdminPage'));
const UsersPage = lazy(() => import('./modules/auth/UsersPage'));
const BackupPage = lazy(() => import('./modules/backup/BackupPage'));

function RouteLoading() {
  return <p className="p-6 text-sm text-slate-500">กำลังโหลดโมดูล…</p>;
}

function RequireAuth() {
  const { accessToken, user } = useAuthSession();
  if (!accessToken || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function DefaultRedirect() {
  const { user } = useAuthSession();
  return <Navigate to={getDefaultPathForRole(user?.role)} replace />;
}

function NotFound() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold text-slate-800">ไม่พบหน้าที่ต้องการ</h1>
      <p className="text-slate-600">ตรวจสอบ URL แล้วลองใหม่ หรือเลือกเมนูจากแถบด้านซ้าย</p>
    </section>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="portal" element={<CustomerPortalPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DefaultRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomersPage />} />
            <Route path="price-tiers" element={<PriceTiersPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="checkins" element={<CheckinsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="tms" element={<TmsPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="portal-admin" element={<PortalAdminPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
