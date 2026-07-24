import { useEffect, useRef } from 'react';
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
  IconClearFormatting,
} from '@tabler/icons-react';

const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Helvetica'];
const SIZES: { value: string; label: string }[] = [
  { value: '2', label: 'Small' },
  { value: '3', label: 'Normal' },
  { value: '4', label: 'Medium' },
  { value: '5', label: 'Large' },
  { value: '6', label: 'X-Large' },
  { value: '7', label: 'XX-Large' },
];

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toHtml(value: string): string {
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  return value
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br>');
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, minHeight = 160, placeholder }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>(value);
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (value === lastEmitted.current) return;
    if (document.activeElement === ref.current) return;
    ref.current.innerHTML = toHtml(value);
    lastEmitted.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (ref.current && !ref.current.innerHTML) {
      ref.current.innerHTML = toHtml(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function preventMouseDown(e: React.MouseEvent) {
    e.preventDefault();
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!ref.current) return;
    const sel = window.getSelection();
    // If the live selection is already inside the editor (true for toolbar buttons,
    // since their mousedown is prevented and never steals focus), leave it alone --
    // overwriting it with an older saved range would clobber whatever the user just
    // selected. Only fall back to the saved range when focus genuinely moved away
    // (true for the Font/Size <select>s, which can't have their mousedown prevented).
    if (sel && sel.rangeCount > 0 && ref.current.contains(sel.anchorNode)) {
      ref.current.focus();
      return;
    }
    ref.current.focus();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function exec(command: string, arg?: string) {
    restoreSelection();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <select className="rte-select" defaultValue="" onChange={(e) => e.target.value && exec('fontName', e.target.value)}>
          <option value="" disabled>
            Font
          </option>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select className="rte-select" defaultValue="" onChange={(e) => e.target.value && exec('fontSize', e.target.value)}>
          <option value="" disabled>
            Size
          </option>
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="rte-sep" />
        <button type="button" className="rte-btn" title="Bold" onMouseDown={preventMouseDown} onClick={() => exec('bold')}>
          <IconBold size={15} />
        </button>
        <button type="button" className="rte-btn" title="Italic" onMouseDown={preventMouseDown} onClick={() => exec('italic')}>
          <IconItalic size={15} />
        </button>
        <button type="button" className="rte-btn" title="Underline" onMouseDown={preventMouseDown} onClick={() => exec('underline')}>
          <IconUnderline size={15} />
        </button>
        <button type="button" className="rte-btn" title="Strikethrough" onMouseDown={preventMouseDown} onClick={() => exec('strikeThrough')}>
          <IconStrikethrough size={15} />
        </button>
        <div className="rte-sep" />
        <button type="button" className="rte-btn" title="Align left" onMouseDown={preventMouseDown} onClick={() => exec('justifyLeft')}>
          <IconAlignLeft size={15} />
        </button>
        <button type="button" className="rte-btn" title="Align center" onMouseDown={preventMouseDown} onClick={() => exec('justifyCenter')}>
          <IconAlignCenter size={15} />
        </button>
        <button type="button" className="rte-btn" title="Align right" onMouseDown={preventMouseDown} onClick={() => exec('justifyRight')}>
          <IconAlignRight size={15} />
        </button>
        <button type="button" className="rte-btn" title="Justify" onMouseDown={preventMouseDown} onClick={() => exec('justifyFull')}>
          <IconAlignJustified size={15} />
        </button>
        <div className="rte-sep" />
        <button type="button" className="rte-btn" title="Clear formatting" onMouseDown={preventMouseDown} onClick={() => exec('removeFormat')}>
          <IconClearFormatting size={15} />
        </button>
      </div>
      <div
        ref={ref}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        style={{ minHeight }}
        data-placeholder={placeholder}
        onInput={handleInput}
        onBlur={handleInput}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
      />
    </div>
  );
}
