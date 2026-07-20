import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { UserDirectoryEntry } from '../../types';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
}

export function MentionTextarea({ value, onChange, placeholder, style }: MentionTextareaProps) {
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [suggestions, setSuggestions] = useState<UserDirectoryEntry[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<UserDirectoryEntry[]>('/users/directory').then(setDirectory).catch(() => {});
  }, []);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(text);

    const beforeCursor = text.slice(0, cursor);
    const match = beforeCursor.match(/@([\w ]*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const matches = directory.filter((u) => u.name.toLowerCase().includes(query));
      if (matches.length > 0) {
        setSuggestions(matches.slice(0, 6));
        setMentionStart(cursor - match[0].length);
        return;
      }
    }
    setSuggestions([]);
    setMentionStart(null);
  }

  function selectMention(name: string) {
    if (mentionStart === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const next = `${before}@${name} ${after}`;
    onChange(next);
    setSuggestions([]);
    setMentionStart(null);
    requestAnimationFrame(() => {
      const pos = before.length + name.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        className="fi"
        style={style}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <div
          className="card"
          style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 2, maxHeight: 160, overflowY: 'auto' }}
        >
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              className="btn-reset"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}
              onClick={() => selectMention(u.name)}
            >
              @{u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
