import { lazy, type ComponentType } from 'react';
import type { DashboardSummary, WidgetId } from '../../types';

interface WidgetDef {
  title: string;
  wide?: boolean;
  Component: ComponentType<{ data: DashboardSummary }>;
}

// Every widget below is React.lazy-loaded instead of eagerly imported --
// this file used to statically import all ~16 widget source files, meaning
// opening the dashboard for the first time forced a download/parse of
// every widget's code (CEO widgets, all 5 rental widgets, the project
// timeline, etc.) regardless of what a given user's saved layout actually
// shows. Dashboard.tsx wraps each widget's render in <Suspense>, so only
// the handful of widgets actually present in someone's layout get fetched.
const OverviewWidgets = () => import('./widgets/OverviewWidgets');
const OpsWidgets = () => import('./widgets/OpsWidgets');
const FinanceWidgets = () => import('./widgets/FinanceWidgets');
const CEOWidgets = () => import('./widgets/CEOWidgets');

const KeyMetricsWidget = lazy(() => OverviewWidgets().then((m) => ({ default: m.KeyMetricsWidget })));
const ActiveProjectHealthWidget = lazy(() => OverviewWidgets().then((m) => ({ default: m.ActiveProjectHealthWidget })));
const UpcomingTasksWidget = lazy(() => OverviewWidgets().then((m) => ({ default: m.UpcomingTasksWidget })));
const RecentActivityWidget = lazy(() => OverviewWidgets().then((m) => ({ default: m.RecentActivityWidget })));

const TaskManagementWidget = lazy(() => OpsWidgets().then((m) => ({ default: m.TaskManagementWidget })));
const ClientCommunicationsWidget = lazy(() => OpsWidgets().then((m) => ({ default: m.ClientCommunicationsWidget })));
const ChangeOrdersActionWidget = lazy(() => OpsWidgets().then((m) => ({ default: m.ChangeOrdersActionWidget })));

const ARAgingWidget = lazy(() => FinanceWidgets().then((m) => ({ default: m.ARAgingWidget })));
const ProjectProfitabilityWidget = lazy(() => FinanceWidgets().then((m) => ({ default: m.ProjectProfitabilityWidget })));
const QBOSyncWidget = lazy(() => FinanceWidgets().then((m) => ({ default: m.QBOSyncWidget })));
const CashPositionWidget = lazy(() => FinanceWidgets().then((m) => ({ default: m.CashPositionWidget })));
const AlexCostWidget = lazy(() => FinanceWidgets().then((m) => ({ default: m.AlexCostWidget })));

const DesignProjectsWidget = lazy(() => import('./widgets/DesignWidgets').then((m) => ({ default: m.DesignProjectsWidget })));

const TeamWorkloadWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.TeamWorkloadWidget })));
const JobsOverdueToCloseWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.JobsOverdueToCloseWidget })));
const LeadPipelineWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.LeadPipelineWidget })));
const SubcontractorRiskWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.SubcontractorRiskWidget })));
const ChangeOrderStatsWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.ChangeOrderStatsWidget })));
const EstimateWinRateWidget = lazy(() => CEOWidgets().then((m) => ({ default: m.EstimateWinRateWidget })));

const FathomImportWidget = lazy(() => import('./FathomImportCard').then((m) => ({ default: m.FathomImportCard })));
const TeamPulseWidget = lazy(() => import('./widgets/TeamPulseWidget').then((m) => ({ default: m.TeamPulseWidget })));
const WeatherWidget = lazy(() => import('./widgets/WeatherWidget').then((m) => ({ default: m.WeatherWidget })));
const ProjectTimelineWidget = lazy(() => import('./widgets/ProjectTimelineWidget').then((m) => ({ default: m.ProjectTimelineWidget })));
const JobImportWidget = lazy(() => import('./widgets/JobImportWidget').then((m) => ({ default: m.JobImportWidget })));

const RentalSnapshotWidget = lazy(() => import('./widgets/RentalSnapshotWidget').then((m) => ({ default: m.RentalSnapshotWidget })));
const RentalCollectionWidget = lazy(() => import('./widgets/RentalCollectionWidget').then((m) => ({ default: m.RentalCollectionWidget })));
const RentalLateWidget = lazy(() => import('./widgets/RentalLateWidget').then((m) => ({ default: m.RentalLateWidget })));
const RentalOccupancyWidget = lazy(() => import('./widgets/RentalOccupancyWidget').then((m) => ({ default: m.RentalOccupancyWidget })));
const RentalRenewalsWidget = lazy(() => import('./widgets/RentalRenewalsWidget').then((m) => ({ default: m.RentalRenewalsWidget })));
const RentalVisitsWidget = lazy(() => import('./widgets/RentalVisitsWidget').then((m) => ({ default: m.RentalVisitsWidget })));

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDef> = {
  key_metrics: { title: 'Key metrics', Component: KeyMetricsWidget },
  active_project_health: { title: 'Active project health', Component: ActiveProjectHealthWidget },
  upcoming_tasks: { title: 'Upcoming tasks', Component: UpcomingTasksWidget },
  recent_activity: { title: 'Recent activity', Component: RecentActivityWidget, wide: true },
  fathom_import: { title: 'Import Fathom transcript', Component: FathomImportWidget },
  contractor_milestones: { title: 'Task management', Component: TaskManagementWidget },
  client_communications: { title: 'Client communication log', Component: ClientCommunicationsWidget },
  change_orders_action: { title: 'Change orders — action needed', Component: ChangeOrdersActionWidget },
  ar_aging: { title: 'AR aging', Component: ARAgingWidget, wide: true },
  project_profitability: { title: 'Project profitability', Component: ProjectProfitabilityWidget, wide: true },
  qbo_sync: { title: 'QuickBooks sync status', Component: QBOSyncWidget },
  cash_position: { title: 'Cash position', Component: CashPositionWidget },
  alex_cost: { title: "Alex's cost tracker", Component: AlexCostWidget },
  design_projects: { title: 'Active projects', Component: DesignProjectsWidget, wide: true },
  team_workload: { title: 'Team workload', Component: TeamWorkloadWidget, wide: true },
  jobs_overdue_to_close: { title: 'Jobs overdue to close', Component: JobsOverdueToCloseWidget },
  lead_pipeline: { title: 'Lead pipeline', Component: LeadPipelineWidget },
  subcontractor_risk: { title: 'Subcontractor risk', Component: SubcontractorRiskWidget },
  change_order_stats: { title: 'Change order win rate', Component: ChangeOrderStatsWidget },
  estimate_win_rate: { title: 'Estimate win rate', Component: EstimateWinRateWidget },
  team_pulse: { title: 'Team pulse', Component: TeamPulseWidget, wide: true },
  weather: { title: 'Indianapolis weather', Component: WeatherWidget },
  project_timeline: { title: 'Project timeline', Component: ProjectTimelineWidget, wide: true },
  job_import: { title: 'Job import portal', Component: JobImportWidget, wide: true },
  rental_snapshot: { title: 'Rental portfolio snapshot', Component: RentalSnapshotWidget },
  rental_collection: { title: 'Rent collected this month', Component: RentalCollectionWidget },
  rental_late: { title: 'Late rent', Component: RentalLateWidget },
  rental_occupancy: { title: 'Occupancy', Component: RentalOccupancyWidget },
  rental_renewals: { title: 'Leases expiring soon', Component: RentalRenewalsWidget },
  rental_visits: { title: 'Property visits due', Component: RentalVisitsWidget },
};
