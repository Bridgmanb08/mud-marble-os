import { useEffect, useRef, useState } from 'react';
import { fmt } from '../../lib/format';

/** Click-to-edit money field: shows a properly formatted "$1,234" (via the
 * shared fmt() helper) at rest, and swaps to a raw, editable number input
 * on click -- HTML number inputs can't render "$1,234" while staying
 * editable, so this is the standard pattern finance UIs use instead of
 * fighting cursor position with a live-formatting text input. */
export function MoneyField({
  value,
  onCommit,
  placeholder = '—',
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="fi"
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
      />
    );
  }

  const parsed = value.trim() === '' ? null : parseFloat(value);
  return (
    <button
      type="button"
      className="btn-reset"
      style={{ width: '100%', textAlign: 'left', padding: '8px 10px', cursor: 'text', border: '1px solid var(--border-md)', borderRadius: 'var(--r)', fontSize: 13 }}
      onClick={() => setEditing(true)}
    >
      {parsed !== null ? fmt(parsed) : <span style={{ color: 'var(--t3)' }}>{placeholder}</span>}
    </button>
  );
}
