// Single source of truth for the construction phase list (distinct from a
// project's `status` -- the sales/pipeline stage: lead, active, closed,
// etc. A project's status stays "active" for basically this entire phase
// list; this is what's happening ON SITE during that time). Mirrored on
// the backend in api/app/project_phases.py -- kept in sync by hand since
// this is a short, stable, app-wide list, not data a user edits.
export const PROJECT_PHASES = [
  'pre_construction',
  'demo',
  'foundation',
  'framing',
  'rough_in',
  'insulation',
  'drywall',
  'interior_finishes',
  'exterior',
  'final_punch_list',
  'complete',
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const PROJECT_PHASE_LABEL: Record<string, string> = {
  pre_construction: 'Pre-Construction',
  demo: 'Demo',
  foundation: 'Foundation',
  framing: 'Framing',
  rough_in: 'Rough-In',
  insulation: 'Insulation',
  drywall: 'Drywall',
  interior_finishes: 'Interior Finishes',
  exterior: 'Exterior',
  final_punch_list: 'Final / Punch List',
  complete: 'Complete',
};

export function projectPhaseLabel(phase: string): string {
  return PROJECT_PHASE_LABEL[phase] || phase.replace(/_/g, ' ');
}
