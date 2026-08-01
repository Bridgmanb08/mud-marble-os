import type { ComponentType } from 'react';
import type { DashboardSummary, WidgetId } from '../../types';
import {
  KeyMetricsWidget,
  ActiveProjectHealthWidget,
  UpcomingTasksWidget,
  RecentActivityWidget,
} from './widgets/OverviewWidgets';
import { TaskManagementWidget, ClientCommunicationsWidget, ChangeOrdersActionWidget } from './widgets/OpsWidgets';
import {
  ARAgingWidget,
  ProjectProfitabilityWidget,
  QBOSyncWidget,
  CashPositionWidget,
  AlexCostWidget,
} from './widgets/FinanceWidgets';
import { DesignProjectsWidget } from './widgets/DesignWidgets';
import {
  TeamWorkloadWidget,
  JobsOverdueToCloseWidget,
  LeadPipelineWidget,
  SubcontractorRiskWidget,
  ChangeOrderStatsWidget,
  EstimateWinRateWidget,
} from './widgets/CEOWidgets';
import { FathomImportCard } from './FathomImportCard';
import { TeamPulseWidget } from './widgets/TeamPulseWidget';
import { WeatherWidget } from './widgets/WeatherWidget';

interface WidgetDef {
  title: string;
  wide?: boolean;
  Component: ComponentType<{ data: DashboardSummary }>;
}

function FathomImportWidget() {
  return <FathomImportCard />;
}

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
};
