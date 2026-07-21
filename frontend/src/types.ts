export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'disqualified';

export interface ProjectBrief {
  name: string;
}

export interface SubcontractorBrief {
  company_name: string;
  trade: string | null;
}

export interface Task {
  id: string;
  project_id: string | null;
  title: string;
  assigned_to: string | null;
  subcontractor_id: string | null;
  phase: string | null;
  status: string;
  priority: string;
  position: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  notes: string | null;
  is_milestone: boolean;
  is_punch_list: boolean;
  version: number;
  created_at: string;
  projects: ProjectBrief | null;
  subcontractors: SubcontractorBrief | null;
  subtask_total: number;
  subtask_complete: number;
  comment_count: number;
  blocked: boolean;
  overdue: boolean;
}

export interface TaskSubtask {
  id: string;
  task_id: string;
  title: string;
  is_complete: boolean;
  position: number;
  created_at: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface BoardView {
  id: string;
  user_id: string;
  name: string;
  view_type: string;
  group_by: string | null;
  filters: Record<string, unknown>;
  sort_by: string | null;
  position: number;
  created_at: string;
}

export interface QuickReminder {
  id: string;
  created_by: string;
  assigned_to: string | null;
  project_id: string | null;
  message: string;
  is_done: boolean;
  created_at: string;
  dismissed_at: string | null;
}

export interface Subcontractor {
  id: string;
  company_name: string;
  trade: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  insurance_expiry: string | null;
  license_number: string | null;
  rating: number | null;
  preferred: boolean;
  w9_on_file: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ChangeOrderTypeBreakdown {
  key: string;
  label: string;
  count: number;
  total: number;
  pct: number;
}

export interface SpendCategory {
  code: string;
  total: number;
  count: number;
}

export interface ProjectPerformance {
  project_id: string;
  project_name: string;
  contract_value: number;
  co_total: number;
  co_count: number;
  status: string;
}

export interface ScorecardItem {
  key: string;
  label: string;
  value: string;
  target: string;
  status: 'good' | 'warn' | 'bad';
}

export interface SubcontractorCompliance {
  id: string;
  company_name: string;
  trade: string | null;
  contact_name: string | null;
  phone: string | null;
  w9_on_file: boolean;
  insurance_expiry: string | null;
  insurance_status: 'none' | 'ok' | 'expiring' | 'expired';
  rating: number | null;
  preferred: boolean;
}

export interface SubIntelligenceSummary {
  avg_project_value: number;
  project_count: number;
  overall_margin: number;
  co_approval_rate: number;
  co_approved_count: number;
  co_total_count: number;
  co_total_value: number;
  co_breakdown: ChangeOrderTypeBreakdown[];
  spend_by_category: SpendCategory[];
  project_performance: ProjectPerformance[];
  scorecard: ScorecardItem[];
  subcontractors: SubcontractorCompliance[];
}

export interface Estimate {
  id: string;
  project_id: string;
  version: number;
  status: string;
  title: string | null;
  pm_fee_total: number | null;
  notes_internal: string | null;
  approval_deadline: string | null;
  introductory_text: string | null;
  closing_text: string | null;
  sent_at: string | null;
  last_viewed_at: string | null;
  grand_total_owner_price: number | null;
  construction_total_owner_price: number | null;
  allowance_total: number | null;
  created_at: string;
  projects?: ProjectBrief;
}

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  cost_code_id: string | null;
  group_name: string | null;
  bucket: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  cost_type: string;
  builder_cost: number;
  markup_type: string;
  markup_value: number;
  owner_price: number;
  estimated_days: number | null;
  notes_internal: string | null;
  notes_external: string | null;
  sort_order: number;
  cost_codes: { code: string; name: string } | null;
}

export interface LineItemReference {
  id: string;
  estimate_id: string;
  project_name: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  cost_type: string;
  builder_cost: number;
  markup_type: string;
  markup_value: number;
  owner_price: number;
  estimated_days: number | null;
  notes_internal: string | null;
  notes_external: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  invoice_number: string | null;
  invoice_type: string;
  amount_due: number;
  amount_paid: number | null;
  due_date: string | null;
  notes_external: string | null;
  status: string;
  issued_at: string | null;
  created_at: string;
  projects: ProjectBrief | null;
}

export interface ChangeOrder {
  id: string;
  project_id: string;
  co_number: number | null;
  title: string;
  co_type: string;
  owner_price: number;
  builder_cost: number | null;
  description: string | null;
  discovered_by: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  projects: ProjectBrief | null;
  sop_breach: boolean;
}

export interface Transaction {
  id: string;
  project_id: string;
  transaction_date: string;
  vendor: string | null;
  transaction_type: string;
  amount: number;
  payment_source: string | null;
  cost_code_id: string | null;
  description: string | null;
  is_allowance: boolean;
  is_change_order: boolean;
  quickbooks_synced: boolean;
  notes: string | null;
  created_at: string;
  projects: ProjectBrief | null;
  cost_codes: { code: string; name: string } | null;
}

export interface CostCode {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface ClientBrief {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Project {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  status: string;
  project_type: string | null;
  start_date: string | null;
  estimated_completion: string | null;
  internal_notes: string | null;
  city: string | null;
  state: string | null;
  client_id: string | null;
  contract_value: number | null;
  health_status: string | null;
  is_archived: boolean;
  color: string | null;
  created_at: string;
  clients: ClientBrief | null;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_type: 'photo' | 'video' | 'plan' | 'other' | string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
  task_ids: string[];
}

export interface UploadUrlResponse {
  upload_url: string;
  storage_path: string;
}

export interface DownloadUrlResponse {
  download_url: string;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  author: string;
  note_type: string;
  content: string;
  is_client_visible: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  referral_name: string | null;
  funding_type: string | null;
  preferred_contact_method: string | null;
  spouse_partner_name: string | null;
  notes: string | null;
  is_active: boolean;
  is_advocate: boolean;
  is_repeat_client: boolean;
  referral_gift_sent: boolean;
  lifetime_value: number | null;
  created_at: string | null;
}

export interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  project_address: string | null;
  project_type: string | null;
  phone: string | null;
  email: string | null;
  status: LeadStatus;
  confidence: number | null;
  estimated_revenue_min: number | null;
  estimated_revenue_max: number | null;
  budget_range_min: number | null;
  budget_range_max: number | null;
  referral_name: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

export interface DashboardSummary {
  active_project_count: number;
  total_contract_value: number;
  total_collected: number;
  total_outstanding: number;
  pct_collected: number;
  open_change_orders: number;
  overdue_invoices: number;
  active_projects: {
    id: string;
    name: string;
    client_name: string | null;
    health_status: string | null;
  }[];
  upcoming_tasks: {
    id: string;
    title: string;
    project_name: string | null;
    assigned_to: string | null;
    scheduled_end: string | null;
  }[];
  recent_activity: {
    id: string;
    author: string | null;
    note_type: string | null;
    project_name: string | null;
    content: string;
    created_at: string;
  }[];
  contractor_milestones: {
    id: string;
    title: string;
    project_name: string | null;
    assigned_to: string | null;
    scheduled_end: string | null;
    days_until_due: number | null;
    overdue: boolean;
  }[];
  client_communications: {
    project_id: string;
    project_name: string;
    last_contact_at: string | null;
    days_since_contact: number | null;
    overdue: boolean;
  }[];
  change_orders_action: {
    id: string;
    co_number: number | null;
    title: string;
    project_name: string | null;
    status: string;
    hours_since_sent: number | null;
    sop_breach: boolean;
  }[];
  ar_aging: { bucket: string; total: number; count: number }[];
  ar_aging_detail: {
    project_name: string;
    client_name: string | null;
    amount_outstanding: number;
    days_overdue: number;
  }[];
  project_profitability: {
    project_id: string;
    project_name: string;
    estimated: number;
    actual_spend: number;
    variance: number;
  }[];
  qbo_sync: { unsynced_count: number; total_count: number; most_recent_transaction_date: string | null };
  cash_position: { total_income: number; total_expense: number; net: number };
  alex_cost: { month_to_date_spend: number; monthly_target: number; pct_of_target: number };
  design_projects: {
    project_id: string;
    project_name: string;
    timeline_pct: number | null;
    task_completion_pct: number | null;
    at_risk: boolean;
  }[];
}

export type WidgetId =
  | 'key_metrics'
  | 'active_project_health'
  | 'upcoming_tasks'
  | 'recent_activity'
  | 'fathom_import'
  | 'contractor_milestones'
  | 'client_communications'
  | 'change_orders_action'
  | 'ar_aging'
  | 'project_profitability'
  | 'qbo_sync'
  | 'cash_position'
  | 'alex_cost'
  | 'design_projects';

export interface WidgetItem {
  id: WidgetId | string;
  visible: boolean;
}

export interface DashboardLayout {
  widgets: WidgetItem[];
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface UserDirectoryEntry {
  id: string;
  name: string;
}

export interface AppNotification {
  id: string;
  type: string;
  source_type: string;
  source_id: string | null;
  project_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  projects: ProjectBrief | null;
}

export type CustomWidgetSource =
  | 'active_projects'
  | 'upcoming_tasks'
  | 'recent_activity'
  | 'contractor_milestones'
  | 'client_communications'
  | 'change_orders_action'
  | 'ar_aging_detail'
  | 'project_profitability'
  | 'design_projects';

export interface CustomWidgetFilter {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

export interface CustomWidgetSpec {
  source: CustomWidgetSource;
  filters: CustomWidgetFilter[];
  aggregation: 'count' | 'sum' | 'avg' | 'list';
  aggregation_field?: string | null;
}

export interface CustomWidget {
  id: string;
  title: string;
  spec: CustomWidgetSpec;
}

export type ReportSource = 'transactions' | 'invoices' | 'change_orders' | 'projects';

export interface ReportFilter {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

export interface ReportSpec {
  source: ReportSource;
  filters: ReportFilter[];
  group_by: string;
  aggregation: 'sum' | 'avg' | 'count';
  aggregation_field?: string | null;
  chart_type: 'bar' | 'line' | 'pie' | 'table';
}

export interface SavedReport {
  id: string;
  user_id: string;
  name: string;
  spec: ReportSpec;
  created_at: string;
}

export interface ReportRunRow {
  group: string;
  value: number;
  count: number;
}

export interface ReportRunResult {
  rows: ReportRunRow[];
  total_rows: number;
}

export interface ExtractedTask {
  title: string;
  assigned_to: string | null;
  project: string | null;
  priority: string | null;
}

export interface ExtractedProjectUpdate {
  project: string | null;
  update: string;
}

export interface ParseTranscriptResponse {
  tasks: ExtractedTask[];
  project_updates: ExtractedProjectUpdate[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallLog {
  name: string;
  input: Record<string, unknown>;
}

export interface AskResponse {
  reply: string;
  tool_calls: ToolCallLog[];
}
