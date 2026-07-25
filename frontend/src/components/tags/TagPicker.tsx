import type { PersonTag } from '../../types';

export function TagPicker({ tags, onAdd }: { tags: PersonTag[]; onAdd: (tagId: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <select
      className="fi"
      style={{ fontSize: 12, padding: '3px 6px', width: 'auto', display: 'inline-block' }}
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
      }}
    >
      <option value="">+ Add tag…</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
