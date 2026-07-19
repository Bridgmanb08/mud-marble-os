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
import Invoices from './pages/Invoices';
import ChangeOrders from './pages/ChangeOrders';
import InHouse from './pages/InHouse';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import Subcontractors from './pages/Subcontractors';
import SubIntelligence from './pages/SubIntelligence';

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
            <Route path="invoices" element={<Invoices />} />
            <Route path="change-orders" element={<ChangeOrders />} />
            <Route path="inhouse" element={<InHouse />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="subcontractors" element={<Subcontractors />} />
            <Route path="sub-intelligence" element={<SubIntelligence />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
