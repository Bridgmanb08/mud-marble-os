export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'disqualified';

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
}
