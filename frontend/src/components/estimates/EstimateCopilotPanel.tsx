import { useEffect, useRef, useState } from 'react';
import { IconSparkles, IconChevronsRight, IconChevronsLeft, IconSend, IconPencil, IconSearch } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useIsMobile } from '../../hooks/useMediaQuery';
import type { ChatMessage, EstimateCopilotChatResponse, ToolCallLog } from '../../types';

interface DisplayMessage extends ChatMessage {
  toolCalls?: ToolCallLog[];
  isError?: boolean;
}

const SUGGESTIONS = [
  'Check this estimate for gaps',
  'Add gutters and downspouts to the exterior scope',
  'What has tile work run on other jobs?',
];

const WRITE_TOOLS = new Set(['add_line_item', 'update_line_item', 'remove_line_item']);

function toolLabel(name: string): string {
  return name.replace(/_/g, ' ');
}

function toolRowLabel(calls: ToolCallLog[]): { icon: 'search' | 'write'; text: string } {
  const wrote = calls.some((t) => WRITE_TOOLS.has(t.name));
  const names = [...new Set(calls.map((t) => toolLabel(t.name)))].join(', ');
  return wrote ? { icon: 'write', text: `Updated the estimate (${names})` } : { icon: 'search', text: `Checked ${names}` };
}

export function EstimateCopilotPanel({
  estimateId,
  onItemAdded,
}: {
  estimateId: string;
  onItemAdded: () => void;
}) {
  // Fixed 340px-wide sidebar sitting next to a flex:1 main column has no
  // room to share with the worksheet on a phone -- default it to its
  // collapsed icon-button form on mobile so the page is usable without the
  // user having to know to tap the collapse chevron themselves first. They
  // can still expand it if they want the copilot on a phone; it just isn't
  // forced open.
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, collapsed]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history: ChatMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);
    try {
      const res = await api.post<EstimateCopilotChatResponse>(`/estimates/${estimateId}/copilot/chat`, {
        message: trimmed,
        history,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, toolCalls: res.tool_calls }]);
      if (res.items_changed) onItemAdded();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong reaching the estimating copilot.';
      setMessages((prev) => [...prev, { role: 'assistant', content: message, isError: true }]);
    } finally {
      setSending(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setCollapsed(false)}
        style={{ height: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}
        title="Open estimating copilot"
      >
        <IconSparkles size={14} />
        <IconChevronsLeft size={14} />
      </button>
    );
  }

  return (
    <div
      className="card"
      style={{
        width: 'min(340px, 100%)',
        flexShrink: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? 480 : 600,
        position: isMobile ? undefined : 'sticky',
        top: 76,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <IconSparkles size={16} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Estimating copilot</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCollapsed(true)} title="Collapse">
          <IconChevronsRight size={14} />
        </button>
      </div>

      <div className="ai-body" ref={bodyRef} style={{ flex: 1 }}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>
              Talk through this estimate with me like you would with Shannon — I can check it for commonly-missed
              complementary scope, add/update/remove line items directly, or look up what similar work has cost on
              other jobs.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai-suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const row = m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 ? toolRowLabel(m.toolCalls) : null;
          return (
            <div key={i} className={`ai-msg ai-msg-${m.role}${m.isError ? ' ai-msg-error' : ''}`}>
              {row && (
                <div className="ai-tool-row">
                  {row.icon === 'write' ? <IconPencil size={11} /> : <IconSearch size={11} />}
                  {row.text}
                </div>
              )}
              <div className="ai-bubble">{m.content}</div>
            </div>
          );
        })}

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
          placeholder="Ask, or tell me what to add…"
        />
        <button type="submit" className="btn btn-p btn-sm" disabled={sending || !input.trim()}>
          <IconSend size={14} />
        </button>
      </form>
    </div>
  );
}
