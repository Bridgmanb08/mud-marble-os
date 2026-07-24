import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconSend, IconPhoto, IconVideo, IconFileTypePdf, IconFile, IconMessages, IconAlertCircle } from '@tabler/icons-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import type { Message, MessageThread, InboundMedia, Project } from '../types';

function FileIcon({ type }: { type: string | null }) {
  if (type === 'photo') return <IconPhoto size={20} />;
  if (type === 'video') return <IconVideo size={20} />;
  if (type === 'plan') return <IconFileTypePdf size={20} />;
  return <IconFile size={20} />;
}

function fmtTime(d: string): string {
  const date = new Date(d);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function threadLabel(t: MessageThread): string {
  return t.contact_name || t.phone_number;
}

function MessageMedia({ message }: { message: Message }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!message.storage_path) return;
    api
      .get<{ download_url: string }>(`/messages/${message.id}/download`)
      .then((r) => setUrl(r.download_url))
      .catch(() => {});
  }, [message.id, message.storage_path]);

  if (!message.storage_path) return null;
  if (message.file_type === 'photo' && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block', marginTop: 6 }} />
      </a>
    );
  }
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'inherit' }}
    >
      <FileIcon type={message.file_type} /> attachment
    </a>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === 'outbound';
  return (
    <div style={{ display: 'flex', justifyContent: outbound ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '70%',
          padding: '8px 12px',
          borderRadius: 12,
          background: outbound ? 'var(--accent)' : 'var(--surface)',
          color: outbound ? '#fff' : 'var(--text)',
          border: outbound ? 'none' : '1px solid var(--border)',
        }}
      >
        {message.body && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{message.body}</div>}
        <MessageMedia message={message} />
        {message.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 6, color: outbound ? '#fff' : 'var(--red)' }}>
            <IconAlertCircle size={12} /> {message.error}
          </div>
        )}
        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>
          {fmtTime(message.created_at)}
          {message.project_name ? ` · ${message.project_name}` : ''}
          {outbound && message.sent_by_name ? ` · ${message.sent_by_name}` : ''}
        </div>
      </div>
    </div>
  );
}

function PendingMedia({ phone, projects, onAssigned }: { phone: string; projects: Project[]; onAssigned: () => void }) {
  const [items, setItems] = useState<InboundMedia[]>([]);
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const toast = useToast();

  async function load() {
    try {
      setItems(await api.get<InboundMedia[]>(`/inbound-media?from_phone=${encodeURIComponent(phone)}`));
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  async function handleAssign(item: InboundMedia) {
    const projectId = assigning[item.id];
    if (!projectId) return;
    try {
      await api.post(`/inbound-media/${item.id}/assign`, { project_id: projectId });
      toast('Assigned to project');
      load();
      onAssigned();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to assign', true);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, background: 'var(--bg)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
        {items.length} upload{items.length !== 1 ? 's' : ''} waiting to be filed to a project
      </div>
      {items.map((item) => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
          <FileIcon type={item.file_type} />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)' }}>{item.body ? `"${item.body}"` : 'No caption'}</div>
          <select
            className="fi"
            style={{ fontSize: 12, padding: '4px 6px', width: 'auto' }}
            value={assigning[item.id] || ''}
            onChange={(e) => setAssigning({ ...assigning, [item.id]: e.target.value })}
          >
            <option value="">Assign to…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" onClick={() => handleAssign(item)} disabled={!assigning[item.id]}>
            Assign
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Messages() {
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThreads() {
    try {
      setThreads(await api.get<MessageThread[]>('/messages/threads'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load messages', true);
      setThreads([]);
    }
  }

  async function loadThread(phone: string) {
    try {
      setThread(await api.get<Message[]>(`/messages/threads/${encodeURIComponent(phone)}`));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to load conversation', true);
    }
  }

  useEffect(() => {
    loadThreads();
    api.get<Project[]>('/projects').then(setProjects).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPhone) loadThread(selectedPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedPhone || !draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/messages/threads/${encodeURIComponent(selectedPhone)}/send`, { body: draft.trim() });
      setDraft('');
      loadThread(selectedPhone);
      loadThreads();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to send message', true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Messages</h1>
          <p>Text conversations with your crew and subs, synced with Twilio</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 180px)' }}>
        <div className="card" style={{ width: 280, flexShrink: 0, padding: 0, overflowY: 'auto' }}>
          {threads === null ? (
            <div className="empty-s" style={{ padding: 16 }}>
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              <IconMessages size={28} color="var(--t3)" style={{ display: 'block', margin: '0 auto 10px' }} />
              <div className="empty-t">No messages yet</div>
            </div>
          ) : (
            threads.map((t) => (
              <div
                key={t.phone_number}
                onClick={() => setSelectedPhone(t.phone_number)}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selectedPhone === t.phone_number ? 'var(--bg)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{threadLabel(t)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>{fmtTime(t.last_created_at)}</div>
                </div>
                {t.contact_trade && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{t.contact_trade}</div>}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--t2)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.last_direction === 'outbound' ? 'You: ' : ''}
                  {t.last_body || '—'}
                </div>
                {t.pending_media_count > 0 && (
                  <span className="badge bg-amber" style={{ marginTop: 6, display: 'inline-block' }}>
                    {t.pending_media_count} to file
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0 }}>
          {!selectedPhone ? (
            <div className="empty" style={{ margin: 'auto' }}>
              <div className="empty-t">Select a conversation</div>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                {threads?.find((t) => t.phone_number === selectedPhone)?.contact_name || selectedPhone}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                <PendingMedia phone={selectedPhone} projects={projects} onAssigned={loadThreads} />
                {thread === null ? (
                  <div className="empty-s">Loading…</div>
                ) : (
                  thread.map((m) => <MessageBubble key={m.id} message={m} />)
                )}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <input
                  className="fi"
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="btn btn-p btn-sm" disabled={sending || !draft.trim()}>
                  <IconSend size={14} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
