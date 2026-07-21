import { CATEGORICAL_COLORS } from './reportPalette';
import type { Project } from '../types';

// Job colors are a user preference (picked per-project), not a generated
// chart encoding, so the swatches offer the app's own validated palette
// (consistent branding) plus a native color input as an escape hatch --
// unlike auto-assigned categorical chart colors, users may deliberately
// reuse a hue across jobs, so no distinctness validation is needed here.
export const JOB_COLOR_SWATCHES = [...CATEGORICAL_COLORS];
export const DEFAULT_JOB_COLOR = '#9E9C96';

export function colorForProject(project: Pick<Project, 'color'> | null | undefined): string {
  return project?.color || DEFAULT_JOB_COLOR;
}
