// Deterministic color per team member, for task-comment "sticky note" bubbles
// and chat-thread avatars -- Brent's request was literally "if I put it on
// there, make it a little red one, and she doesn't make it an orange one",
// i.e. each person always gets the same color everywhere it's shown.
//
// The 6-person roster is already canonicalized server-side in
// api/app/team_roster.py's CANONICAL_NAMES; mirrored here (not imported --
// this is a frontend-only file, the backend doesn't ship a JS/JSON export of
// it) so real teammates get a curated, distinct color instead of a hashed
// one. Anyone not on the roster (a subcontractor commenting via a shared
// login, or a future hire before this list is updated) still gets a stable
// color via a simple string hash into a fallback palette, so nothing ever
// renders uncolored.
const ROSTER_COLORS: Record<string, string> = {
  'Brent Bridgman': 'var(--red)',
  'Shannon Ingram': 'var(--amber)',
  'Megan Martens': 'var(--blue)',
  'Faith Wyatt': 'var(--green)',
  'Alex Peralta': 'var(--purple-tx)',
  'Manuel Alvarado': 'var(--accent)',
};

const FALLBACK_PALETTE = ['var(--red)', 'var(--amber)', 'var(--blue)', 'var(--green)', 'var(--purple-tx)', 'var(--accent)', 'var(--t3)'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function colorForPerson(name: string | null | undefined): string {
  if (!name) return 'var(--t3)';
  if (ROSTER_COLORS[name]) return ROSTER_COLORS[name];
  return FALLBACK_PALETTE[hashString(name) % FALLBACK_PALETTE.length];
}

export function initialsForPerson(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}
