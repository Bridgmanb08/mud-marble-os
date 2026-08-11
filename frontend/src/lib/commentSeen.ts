// Tracks, per task, the timestamp of the last comment this browser has
// "seen" (i.e. the task's detail drawer was opened while that comment
// existed) -- powers the "new activity" glow on a Kanban card's comment
// bubble without a real backend read-receipts model. Same
// versioned-localStorage-key convention as reminderHistory.ts /
// TeamReminders.tsx's own dedupe set; deliberately lightweight per Brent's
// "don't make it too complicated."

const STORAGE_KEY = 'mm_comment_seen_v1';

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(map: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage unavailable (private mode etc.) -- the glow just never
    // clears this session, not worth failing over.
  }
}

export function markCommentsSeen(taskId: string, lastCommentAt: string | null | undefined) {
  if (!lastCommentAt) return;
  const map = load();
  if (map[taskId] && map[taskId] >= lastCommentAt) return;
  map[taskId] = lastCommentAt;
  save(map);
}

// True when there's a comment on this task newer than what this browser has
// seen -- callers should also check the comment wasn't authored by the
// current user (their own comment isn't "new activity" to them).
export function hasUnseenComment(taskId: string, lastCommentAt: string | null | undefined): boolean {
  if (!lastCommentAt) return false;
  const seen = load()[taskId];
  return !seen || seen < lastCommentAt;
}
