import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import Estimates from './pages/Estimates';
import EstimateWorksheet from './pages/EstimateWorksheet';
import Invoices from './pages/Invoices';
import ChangeOrders from './pages/ChangeOrders';
import InHouse from './pages/InHouse';
import InHouseWorkshop from './pages/InHouseWorkshop';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import Subcontractors from './pages/Subcontractors';
import SubIntelligence from './pages/SubIntelligence';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Users from './pages/Users';
import { AdminRoute } from './components/layout/AdminRoute';

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
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="leads" element={<Leads />} />
            <Route path="clients" element={<Clients />} />
            <Route path="estimates" element={<Estimates />} />
            <Route path="estimates/:id" element={<EstimateWorksheet />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="change-orders" element={<ChangeOrders />} />
            <Route path="inhouse" element={<InHouse />} />
            <Route path="inhouse/:id" element={<InHouseWorkshop />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="subcontractors" element={<Subcontractors />} />
            <Route path="sub-intelligence" element={<SubIntelligence />} />
            <Route path="settings" element={<Settings />} />
            <Route path="reports" element={<Reports />} />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <Users />
                </AdminRoute>
              }
            />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
