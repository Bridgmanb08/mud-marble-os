import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { api } from '../../api/client';
import type { UserDirectoryEntry } from '../../types';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  // Optional: called when Enter is pressed with no mention dropdown open
  // (Shift+Enter always inserts a newline instead, and is never treated as
  // submit). Consumers that want plain multi-line text with no submit
  // shortcut (e.g. a note body) simply don't pass this.
  onSubmit?: () => void;
}

export function MentionTextarea({ value, onChange, placeholder, style, onSubmit }: MentionTextareaProps) {
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [suggestions, setSuggestions] = useState<UserDirectoryEntry[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);
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
        setHighlighted(0);
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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      // While the @-mention dropdown is open, arrow keys move the
      // highlight and Tab/Enter accept whichever suggestion is
      // highlighted -- Tab is the explicit ask (fill in the rest of the
      // name), Enter also accepting matches every other mention UI
      // (Slack, GitHub, Discord) so Enter doesn't feel broken while a
      // dropdown is open.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectMention(suggestions[highlighted].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        setMentionStart(null);
        return;
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        className="fi"
        style={style}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <div
          className="card"
          style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 2, maxHeight: 160, overflowY: 'auto' }}
        >
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className="btn-reset"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                fontSize: 13,
                cursor: 'pointer',
                background: i === highlighted ? 'var(--bg)' : undefined,
              }}
              onMouseEnter={() => setHighlighted(i)}
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
