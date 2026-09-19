import { useEffect, useRef, useState } from 'react';
import { IconPencil } from '@tabler/icons-react';

// A page/modal heading that turns into a text input when clicked -- Enter or
// clicking away saves, Escape cancels. Used as the <h1> of the change order,
// invoice, and estimate editors so their titles can be renamed right where
// you're working instead of hunting for a separate field.
//
// `value` is the real stored title (may be empty); `fallback` is what's shown
// when there isn't one yet (e.g. the invoice number). With allowEmpty, saving
// a blank title clears it back to the fallback; without it, a blank edit is
// ignored so a required title can never be wiped out.
export function EditableTitle({
  value,
  fallback,
  prefix,
  allowEmpty = false,
  onSave,
}: {
  value: string | null;
  fallback: string;
  prefix?: string;
  allowEmpty?: boolean;
  onSave: (next: string | null) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    cancelled.current = false;
    setDraft(value || '');
    setEditing(true);
  }

  async function commit() {
    if (cancelled.current) return;
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value || '')) return;
    if (!trimmed && !allowEmpty) return;
    await onSave(trimmed || null);
  }

  const shown = value || fallback;

  if (editing) {
    return (
      <h1 style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {prefix && <span>{prefix}:</span>}
        <input
          ref={inputRef}
          className="fi"
          style={{ fontSize: 18, fontWeight: 600, padding: '2px 8px', minWidth: 240 }}
          value={draft}
          placeholder={fallback}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </h1>
    );
  }

  return (
    <h1>
      {prefix && <span>{prefix}: </span>}
      <button
        type="button"
        className="btn-reset"
        onClick={startEditing}
        title="Click to rename"
        style={{ font: 'inherit', color: 'inherit', cursor: 'text', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {shown}
        <IconPencil size={13} style={{ opacity: 0.4 }} />
      </button>
    </h1>
  );
}
