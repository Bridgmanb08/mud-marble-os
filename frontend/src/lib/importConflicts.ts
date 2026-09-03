import type { FieldDiff } from '../types';

// A conflicting row (Job Import Portal -- Estimate/In-House/Invoice/Change
// Order scan sections) defaults to "skip" so a re-import never silently
// overwrites real, already-entered data with a stale or different imported
// value -- EXCEPT when every differing field is currently blank on the
// existing record. In that case nothing would be overwritten, only filled
// in (the exact bug report that prompted this: internal notes that were
// never entered the first time a line item got imported stayed blank on a
// re-import, because the row was flagged "conflict" and defaulted to
// "skip" -- Shannon would have had to notice and manually click "Update"
// on every single affected row). Those rows now default to "update" so a
// plain re-import actually backfills them.
export function defaultConflictAction(diff: FieldDiff[]): 'skip' | 'update' {
  if (diff.length === 0) return 'skip';
  return diff.every((d) => !d.existing) ? 'update' : 'skip';
}
