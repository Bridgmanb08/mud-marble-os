import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { ReferenceDataProvider } from './reference-data/ReferenceDataContext';
import { AdminRoute } from './components/layout/AdminRoute';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leads = lazy(() => import('./pages/Leads'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Estimates = lazy(() => import('./pages/Estimates'));
const EstimateWorksheet = lazy(() => import('./pages/EstimateWorksheet'));
const EstimateTemplates = lazy(() => import('./pages/EstimateTemplates'));
const EstimateTemplateWorksheet = lazy(() => import('./pages/EstimateTemplateWorksheet'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceWorksheet = lazy(() => import('./pages/InvoiceWorksheet'));
const ChangeOrders = lazy(() => import('./pages/ChangeOrders'));
const InHouse = lazy(() => import('./pages/InHouse'));
const InHouseWorkshop = lazy(() => import('./pages/InHouseWorkshop'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Subcontractors = lazy(() => import('./pages/Subcontractors'));
const SubIntelligence = lazy(() => import('./pages/SubIntelligence'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const Review = lazy(() => import('./pages/Review'));
const Messages = lazy(() => import('./pages/Messages'));
const JobImportWizard = lazy(() => import('./pages/JobImportWizard'));
const RentalProperties = lazy(() => import('./pages/RentalProperties'));
const RentalPropertyDetail = lazy(() => import('./pages/RentalPropertyDetail'));
const RentalWorkOrders = lazy(() => import('./pages/RentalWorkOrders'));

function PageLoader() {
  return (
    <div className="empty" style={{ margin: '60px auto' }}>
      <div className="empty-t">Loading…</div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ReferenceDataProvider>
                    <AppLayout />
                  </ReferenceDataProvider>
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="leads" element={<Leads />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="estimates" element={<Estimates />} />
              <Route path="estimates/templates" element={<EstimateTemplates />} />
              <Route path="estimates/templates/:id" element={<EstimateTemplateWorksheet />} />
              <Route path="estimates/:id" element={<EstimateWorksheet />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/:id" element={<InvoiceWorksheet />} />
              <Route path="change-orders" element={<ChangeOrders />} />
              <Route path="inhouse" element={<InHouse />} />
              <Route path="inhouse/:id" element={<InHouseWorkshop />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="subcontractors" element={<Subcontractors />} />
              <Route path="sub-intelligence" element={<SubIntelligence />} />
              <Route path="settings" element={<Settings />} />
              <Route path="reports" element={<Reports />} />
              <Route path="job-import/:projectId" element={<JobImportWizard />} />
              <Route path="rentals" element={<RentalProperties />} />
              <Route path="rentals/work-orders" element={<RentalWorkOrders />} />
              <Route path="rentals/:id" element={<RentalPropertyDetail />} />
              <Route
                path="users"
                element={
                  <AdminRoute>
                    <Users />
                  </AdminRoute>
                }
              />
              <Route
                path="review"
                element={
                  <AdminRoute>
                    <Review />
                  </AdminRoute>
                }
              />
              <Route
                path="messages"
                element={
                  <AdminRoute>
                    <Messages />
                  </AdminRoute>
                }
              />
            </Route>
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  );
}
