import type { CustomPhase } from '../types';

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

// Mirrors api/app/project_phases.py's merge_custom_phases exactly -- same
// per-anchor chaining logic, so a project's phase order renders identically
// whether it's the tracker UI or the "Build phase" task-form dropdown asking.
export function mergeCustomPhases(customPhases: CustomPhase[] | null | undefined): { keys: string[]; labels: Record<string, string> } {
  const keys: string[] = [...PROJECT_PHASES];
  const labels: Record<string, string> = { ...PROJECT_PHASE_LABEL };
  const lastInserted: Record<string, string> = {};
  for (const cp of customPhases || []) {
    if (!cp.key || keys.includes(cp.key)) continue;
    labels[cp.key] = cp.label || cp.key;
    const anchor = keys.includes(cp.after) ? cp.after : keys[keys.length - 1];
    if (!anchor) {
      keys.push(cp.key);
      continue;
    }
    const insertAfter = lastInserted[anchor] || anchor;
    keys.splice(keys.indexOf(insertAfter) + 1, 0, cp.key);
    lastInserted[anchor] = cp.key;
  }
  return { keys, labels };
}
