import type { Task } from '../types';

// `assigned_to` is the legacy single-assignee field; `assignees` is the
// current multi-assignee array. Nothing keeps them in sync -- the task edit
// form (MultiAssigneeInput in TaskDetailDrawer.tsx) only ever writes
// `assignees`, so any task assigned through the current UI has a stale/empty
// `assigned_to`. Every assignee-based filter/group/match needs this same
// fallback, not just `assigned_to` directly, or a task assigned via the
// normal flow silently fails to match even though it's clearly assigned to
// that person on the card itself.
export function taskAssignees(t: Task): string[] {
  return t.assignees && t.assignees.length > 0 ? t.assignees : t.assigned_to ? [t.assigned_to] : [];
}
