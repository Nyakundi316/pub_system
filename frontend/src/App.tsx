import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Gate, RequireAuth } from './components/layout/guards';
import { useAuth } from './store/auth';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pos from './pages/Pos';
import Tables from './pages/Tables';
import Inventory from './pages/Inventory';
import Purchasing from './pages/Purchasing';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Shifts from './pages/Shifts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

/** Send freshly-logged-in users to their role's home screen. */
function HomeRedirect() {
  const role = useAuth((s) => s.user?.roleName);
  const home =
    role === 'Bartender' || role === 'Cashier' ? '/pos'
    : role === 'Waiter' ? '/tables'
    : role === 'Storekeeper' ? '/inventory'
    : role === 'Accountant' ? '/reports'
    : role === 'System Admin' ? '/settings'
    : '/dashboard';
  return <Navigate to={home} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/dashboard" element={<Gate anyOf={['reports.view', 'shifts.view']}><Dashboard /></Gate>} />
                <Route path="/pos" element={<Gate anyOf={['sales.create']}><Pos /></Gate>} />
                <Route path="/tables" element={<Gate anyOf={['tables.manage', 'sales.create']}><Tables /></Gate>} />
                <Route path="/inventory" element={<Gate anyOf={['inventory.view']}><Inventory /></Gate>} />
                <Route path="/purchasing" element={<Gate anyOf={['purchasing.view']}><Purchasing /></Gate>} />
                <Route path="/products" element={<Gate anyOf={['products.view']}><Products /></Gate>} />
                <Route path="/customers" element={<Gate anyOf={['customers.view']}><Customers /></Gate>} />
                <Route path="/shifts" element={<Gate anyOf={['shifts.view']}><Shifts /></Gate>} />
                <Route path="/reports" element={<Gate anyOf={['reports.view']}><Reports /></Gate>} />
                <Route path="/settings" element={<Gate anyOf={['users.manage', 'roles.manage', 'settings.manage']}><Settings /></Gate>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
