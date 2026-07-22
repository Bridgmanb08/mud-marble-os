import type { Project } from '../types';

// Job colors are a user preference (picked per-project), not a generated
// chart encoding -- distinctness across all 20 isn't validated the way the
// chart palette is, since users may deliberately reuse a hue across jobs and
// there's no CVD-adjacency requirement for a decorative label swatch. The
// first five match reportPalette's CATEGORICAL_COLORS (kept as literals, not
// imported, so this list can grow independently of the chart palette) so
// jobs colored before this list was expanded keep the exact same swatch.
export const JOB_COLOR_SWATCHES = [
  '#378ADD', // blue
  '#1D9E75', // green
  '#EF9F27', // amber
  '#E24B4A', // red
  '#534AB7', // violet
  '#1BAF7A', // teal
  '#EB6834', // orange
  '#D6549C', // magenta
  '#5C6BC0', // indigo
  '#17A2B8', // cyan
  '#E85D75', // rose
  '#8BC34A', // lime
  '#8D6E52', // brown
  '#2E4C7A', // navy
  '#FF7043', // coral
  '#9C4F96', // plum
  '#D4A72C', // mustard
  '#2E7D5B', // forest
  '#607D8B', // slate
  '#A83246', // maroon
];
export const DEFAULT_JOB_COLOR = '#9E9C96';

export function colorForProject(project: Pick<Project, 'color'> | null | undefined): string {
  return project?.color || DEFAULT_JOB_COLOR;
}
