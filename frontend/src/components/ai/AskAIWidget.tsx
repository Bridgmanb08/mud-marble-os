import { useEffect, useRef, useState } from 'react';
import { IconSparkles, IconX, IconSend, IconSearch } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import type { AskResponse, ChatMessage, ToolCallLog } from '../../types';

interface DisplayMessage extends ChatMessage {
  toolCalls?: ToolCallLog[];
  isError?: boolean;
}

const SUGGESTIONS = [
  'How are we doing financially this month?',
  'What tasks are overdue?',
  'Which projects are at risk?',
];

function toolLabel(name: string): string {
  return name
    .replace(/^search_/, '')
    .replace(/_/g, ' ')
    .replace(/^get /, '');
}

export function AskAIWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);
    try {
      const res = await api.post<AskResponse>('/ai/chat', { message: trimmed, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, toolCalls: res.tool_calls }]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong reaching the AI service.';
      setMessages((prev) => [...prev, { role: 'assistant', content: message, isError: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="ai-panel">
          <div className="ai-header">
            <div className="ai-title">
              <IconSparkles size={16} />
              Ask AI
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              <IconX size={15} />
            </button>
          </div>

          <div className="ai-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <p>Ask about projects, finances, tasks, clients, or subs — I'll look it up for you.</p>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="ai-suggestion" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role}${m.isError ? ' ai-msg-error' : ''}`}>
                {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="ai-tool-row">
                    <IconSearch size={11} />
                    Searched {m.toolCalls.map((t) => toolLabel(t.name)).join(', ')}
                  </div>
                )}
                <div className="ai-bubble">{m.content}</div>
              </div>
            ))}

            {sending && (
              <div className="ai-msg ai-msg-assistant">
                <div className="ai-bubble ai-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <form
            className="ai-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              autoFocus
            />
            <button type="submit" className="btn btn-p btn-sm" disabled={sending || !input.trim()}>
              <IconSend size={14} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="ai-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Ask AI' : 'Open Ask AI'}
      >
        {open ? <IconX size={22} /> : <IconSparkles size={22} />}
      </button>
    </>
  );
}
