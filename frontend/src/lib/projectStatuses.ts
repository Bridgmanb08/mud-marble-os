// Single source of truth for the project pipeline's status list/order/labels.
// Previously duplicated independently in four places (Projects.tsx,
// ProjectDetail.tsx, Estimates.tsx, NewProjectModal.tsx) -- two of those
// copies had silently drifted to a different tail ordering than the other
// two (punch_list/warranty/on_hold/closed/lost vs.
// closed/warranty/on_hold/punch_list/lost), so the Estimates page's section
// order and a new project's status dropdown disagreed with the Projects
// page's own status dropdown. This file is now the one place that ordering
// lives; every consumer imports it instead of retyping it.
export const PROJECT_STATUS_OPTIONS = [
  'lead',
  'vetting',
  'estimating',
  'proposed',
  'pre_construction',
  'active',
  'closed',
  'warranty',
  'on_hold',
  'punch_list',
  'lost',
] as const;

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  lead: 'Lead',
  vetting: 'Vetting',
  estimating: 'Estimating',
  proposed: 'Proposed',
  pre_construction: 'Pre Construction',
  active: 'Active',
  closed: 'Closed',
  warranty: 'Warranty',
  on_hold: 'On Hold',
  punch_list: 'Punch List',
  lost: 'Lost',
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABEL[status] || status.replace(/_/g, ' ');
}

// A status dropdown must never silently drop the project's CURRENT status
// from its option list just because it's not in the canonical set (a status
// value could in principle predate this list or come from data entered a
// different way) -- this is the same defensive pattern every consumer of
// the list already used ad hoc; centralized here so it isn't retyped too.
export function statusOptionsIncluding(current: string): string[] {
  return (PROJECT_STATUS_OPTIONS as readonly string[]).includes(current)
    ? [...PROJECT_STATUS_OPTIONS]
    : [current, ...PROJECT_STATUS_OPTIONS];
}
