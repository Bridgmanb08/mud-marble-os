/** A bot badge only when the row is explicitly stamped `bot`. Null is legacy, not a bot. */
export function botTouchName(row: {
  updated_by_type?: string | null;
  updated_by_name?: string | null;
  created_by_type?: string | null;
  created_by_name?: string | null;
} | null | undefined): string | null {
  if (!row) return null;
  if (row.updated_by_type === 'bot') return row.updated_by_name || 'AI bot';
  // Created by a bot and never edited since (no later actor stamp).
  if (!row.updated_by_type && row.created_by_type === 'bot') return row.created_by_name || 'AI bot';
  return null;
}

const BOT_SUFFIX = ' (AI bot)';

/** Comment authors written by the bot path end with this suffix on purpose. */
export function commentAuthor(author: string): { name: string; bot: boolean } {
  if (author.endsWith(BOT_SUFFIX)) {
    const name = author.slice(0, -BOT_SUFFIX.length).trim();
    return { name: name || author, bot: true };
  }
  return { name: author, bot: false };
}
