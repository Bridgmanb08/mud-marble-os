import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import type { UserDirectoryEntry } from '../../types';

interface MultiAssigneeInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  directory: UserDirectoryEntry[];
  listId: string;
}

export function MultiAssigneeInput({ value, onChange, directory, listId }: MultiAssigneeInputProps) {
  const [draft, setDraft] = useState('');

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed || value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {value.map((name) => (
            <span
              key={name}
              className="badge bg-blue"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, paddingRight: 4 }}
            >
              {name}
              <button
                type="button"
                className="btn-reset"
                onClick={() => remove(name)}
                style={{ display: 'flex', cursor: 'pointer', opacity: 0.7 }}
                title={`Remove ${name}`}
              >
                <IconX size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="fi"
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a person…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={() => {
          if (draft.trim()) add(draft);
        }}
      />
      <datalist id={listId}>
        {directory.filter((u) => !value.includes(u.name)).map((u) => (
          <option key={u.id} value={u.name} />
        ))}
      </datalist>
    </div>
  );
}
