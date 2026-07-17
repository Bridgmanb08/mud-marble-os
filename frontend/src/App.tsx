import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import ComingSoon from './pages/ComingSoon';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<ComingSoon title="Projects" />} />
            <Route path="leads" element={<Leads />} />
            <Route path="clients" element={<ComingSoon title="Clients" />} />
            <Route path="estimates" element={<ComingSoon title="Estimates" />} />
            <Route path="invoices" element={<ComingSoon title="Invoices" />} />
            <Route path="change-orders" element={<ComingSoon title="Change Orders" />} />
            <Route path="inhouse" element={<ComingSoon title="In-House Sheet" />} />
            <Route path="tasks" element={<ComingSoon title="Task Board" />} />
            <Route path="schedule" element={<ComingSoon title="Schedule" />} />
            <Route path="subcontractors" element={<ComingSoon title="Subcontractors" />} />
            <Route path="sub-intelligence" element={<ComingSoon title="Sub Intelligence" />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
