import { useEffect, useState } from 'react';
import type { Client } from '../../types';

interface ReferralPickerProps {
  clients: Client[];
  referredByClientId: string | null;
  referralName: string | null;
  onChange: (next: { referredByClientId: string | null; referralName: string | null }) => void;
  /** When provided, typed text that doesn't match an existing client is handed here
   *  instead of falling back to a free-text referral_name -- used to create a real
   *  client record on the fly (see ClientDetail's createReferrer). */
  onCreateNew?: (name: string) => void;
  excludeId?: string;
  listId: string;
}

function fullName(c: Client | { first_name: string; last_name: string | null }) {
  return `${c.first_name} ${c.last_name || ''}`.trim();
}

export function ReferralPicker({ clients, referredByClientId, referralName, onChange, onCreateNew, excludeId, listId }: ReferralPickerProps) {
  const linked = referredByClientId ? clients.find((c) => c.id === referredByClientId) : undefined;
  const [text, setText] = useState(linked ? fullName(linked) : referralName || '');

  useEffect(() => {
    setText(linked ? fullName(linked) : referralName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referredByClientId, referralName]);

  function commit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      onChange({ referredByClientId: null, referralName: null });
      return;
    }
    const match = clients.find((c) => c.id !== excludeId && fullName(c).toLowerCase() === trimmed.toLowerCase());
    if (match) {
      onChange({ referredByClientId: match.id, referralName: null });
    } else if (onCreateNew) {
      onCreateNew(trimmed);
    } else {
      onChange({ referredByClientId: null, referralName: trimmed });
    }
  }

  return (
    <div>
      <input
        className="fi"
        list={listId}
        value={text}
        placeholder="Search existing clients or type a name…"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          }
        }}
      />
      <datalist id={listId}>
        {clients
          .filter((c) => c.id !== excludeId)
          .map((c) => (
            <option key={c.id} value={fullName(c)} />
          ))}
      </datalist>
    </div>
  );
}
