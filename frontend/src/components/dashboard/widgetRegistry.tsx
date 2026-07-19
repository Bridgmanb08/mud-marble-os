import type { ComponentType } from 'react';
import type { DashboardSummary, WidgetId } from '../../types';
import {
  KeyMetricsWidget,
  ActiveProjectHealthWidget,
  UpcomingTasksWidget,
  RecentActivityWidget,
} from './widgets/OverviewWidgets';
import { ContractorMilestonesWidget, ClientCommunicationsWidget, ChangeOrdersActionWidget } from './widgets/OpsWidgets';
import {
  ARAgingWidget,
  ProjectProfitabilityWidget,
  QBOSyncWidget,
  CashPositionWidget,
  AlexCostWidget,
} from './widgets/FinanceWidgets';
import { DesignProjectsWidget } from './widgets/DesignWidgets';
import { FathomImportCard } from './FathomImportCard';

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
  contractor_milestones: { title: 'Contractor milestones', Component: ContractorMilestonesWidget },
  client_communications: { title: 'Client communication log', Component: ClientCommunicationsWidget },
  change_orders_action: { title: 'Change orders — action needed', Component: ChangeOrdersActionWidget },
  ar_aging: { title: 'AR aging', Component: ARAgingWidget, wide: true },
  project_profitability: { title: 'Project profitability', Component: ProjectProfitabilityWidget, wide: true },
  qbo_sync: { title: 'QuickBooks sync status', Component: QBOSyncWidget },
  cash_position: { title: 'Cash position', Component: CashPositionWidget },
  alex_cost: { title: "Alex's cost tracker", Component: AlexCostWidget },
  design_projects: { title: 'Active projects', Component: DesignProjectsWidget, wide: true },
};
