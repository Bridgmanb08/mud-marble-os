import { useEffect, useRef, useState } from 'react';
import { IconSparkles, IconX, IconSend, IconSearch, IconMicrophone, IconPencil } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import type { AskResponse, ChatMessage, ToolCallLog } from '../../types';

interface DisplayMessage extends ChatMessage {
  toolCalls?: ToolCallLog[];
  isError?: boolean;
}

const SUGGESTIONS = [
  'How are we doing financially this month?',
  'What tasks are overdue?',
  'Add a note that Abby Kuhns referred Kathleen',
];

const WRITE_TOOLS = new Set(['create_task', 'create_client', 'add_client_note']);

function toolLabel(name: string): string {
  return name
    .replace(/^search_/, '')
    .replace(/_/g, ' ')
    .replace(/^get /, '');
}

function toolRowLabel(calls: ToolCallLog[]): { icon: 'search' | 'write'; text: string } {
  const wrote = calls.some((t) => WRITE_TOOLS.has(t.name));
  const names = calls.map((t) => toolLabel(t.name)).join(', ');
  return wrote ? { icon: 'write', text: `Updated ${names}` } : { icon: 'search', text: `Searched ${names}` };
}

// Not in TS's lib.dom yet -- Web Speech API is implemented (prefixed on some
// browsers) but still an editor's draft, so no official type declarations exist.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function AskAIWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef('');
  const speechCtorRef = useRef(getSpeechRecognitionCtor());
  const speechSupported = !!speechCtorRef.current;

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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

  function toggleListening() {
    const Ctor = speechCtorRef.current;
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    baseTextRef.current = input.trim() ? `${input.trim()} ` : '';

    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += chunk;
        } else {
          interim += chunk;
        }
      }
      if (final) baseTextRef.current += `${final} `;
      setInput(`${baseTextRef.current}${interim}`.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
                <p>
                  Ask about projects, finances, tasks, clients, or subs — or ask me to create a task, schedule
                  something, add a client, or log a note.
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
              placeholder={listening ? 'Listening…' : 'Ask a question…'}
              autoFocus
            />
            {speechSupported && (
              <button
                type="button"
                className={`btn btn-ghost btn-sm ai-mic-btn${listening ? ' on' : ''}`}
                onClick={toggleListening}
                aria-label={listening ? 'Stop dictation' : 'Start dictation'}
                title={listening ? 'Stop dictation' : 'Dictate a message'}
              >
                <IconMicrophone size={14} />
              </button>
            )}
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
