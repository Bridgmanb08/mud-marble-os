import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { MentionTextarea } from '../ui/MentionTextarea';
import { useToast } from '../ui/Toast';
import { fmtD } from '../../lib/format';
import { assertMediaSize, readWeblocUrl, uploadWorkOrderMedia } from '../../lib/fileUpload';
import { LinkText } from './LinkText';
import { UploadProgress } from './UploadProgress';
import type { RentalWorkOrder, WorkOrderMedia, WorkOrderUpdate } from '../../types';

export function WorkOrderDetailModal({ workOrder, onClose }: { workOrder: RentalWorkOrder; onClose: () => void }) {
  const toast = useToast();
  const [updates, setUpdates] = useState<WorkOrderUpdate[] | null>(null);
  const [media, setMedia] = useState<WorkOrderMedia[]>([]);
  const [body, setBody] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<WorkOrderUpdate[]>(`/rental-work-orders/${workOrder.id}/updates`),
      api.get<WorkOrderMedia[]>(`/rental-work-orders/${workOrder.id}/media`),
    ])
      .then(([u, m]) => {
        if (cancelled) return;
        setUpdates(u);
        setMedia(m);
      })
      .catch(() => {
        if (!cancelled) toast('Failed to load this work order', true);
      });
    return () => {
      cancelled = true;
    };
  }, [workOrder.id, reloadKey, toast]);

  function showError(message: string) {
    setError(message);
    toast(message, true);
  }

  function addLink(raw: string) {
    const url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      showError('Paste a full link starting with https:// — a Google Photos link works.');
      return;
    }
    setLinks((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setLinkDraft('');
    setError('');
  }

  async function addFiles(list: FileList | null) {
    const next: File[] = [];
    for (const file of Array.from(list || [])) {
      const webloc = await readWeblocUrl(file);
      if (webloc) {
        addLink(webloc);
        continue;
      }
      try {
        assertMediaSize(file);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'That file is too large.');
        continue;
      }
      const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/') || /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|webm|m4v)$/i.test(file.name);
      if (!isMedia) {
        showError(`${file.name} isn’t a photo or video. Paste a link for anything else.`);
        continue;
      }
      next.push(file);
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }

  async function postUpdate() {
    const text = body.trim();
    if (!text && links.length === 0 && files.length === 0) {
      showError('Write an update, paste a link, or attach a photo.');
      return;
    }
    setPosting(true);
    setError('');
    try {
      const created = await api.post<WorkOrderUpdate>(`/rental-work-orders/${workOrder.id}/updates`, {
        body: text,
        links,
      });
      const failed: string[] = [];
      for (const file of files) {
        try {
          setProgress({ name: file.name, pct: 0 });
          await uploadWorkOrderMedia(workOrder.id, file, {
            updateId: created.id,
            updateText: text,
            onProgress: (pct) => setProgress({ name: file.name, pct }),
          });
        } catch (err) {
          failed.push(err instanceof Error ? err.message : file.name);
        }
      }
      setBody('');
      setLinks([]);
      setFiles([]);
      setProgress(null);
      setReloadKey((k) => k + 1);
      if (failed.length) showError(`Update saved, but ${failed[0]}`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to post update');
    } finally {
      setPosting(false);
      setProgress(null);
    }
  }

  const orderMedia = media.filter((m) => !m.update_id);

  return (
    <Modal title={workOrder.title} onClose={onClose} wide>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>
        {workOrder.property_address}
        {workOrder.unit_label ? ` · ${workOrder.unit_label}` : ''} · {workOrder.priority} · {fmtD(workOrder.created_at)}
      </div>
      {workOrder.description && (
        <div style={{ fontSize: 13, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          <LinkText text={workOrder.description} />
        </div>
      )}
      <MediaGrid items={orderMedia} />

      <div className="ibt" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 0, border: 'none', padding: 0, margin: '16px 0 8px' }}>
        Updates
      </div>
      {updates === null ? (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>
      ) : updates.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>No updates yet.</div>
      ) : (
        updates.map((u) => (
          <div key={u.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>
              {u.author_name || 'Someone'} · {fmtD(u.created_at)}
            </div>
            {u.body && (
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                <LinkText text={u.body} />
              </div>
            )}
            <MediaGrid items={media.filter((m) => m.update_id === u.id)} />
          </div>
        ))
      )}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        {error && (
          <div className="merr" role="alert">
            {error}
          </div>
        )}
        <label className="fl">Update — type @ to mention someone</label>
        <MentionTextarea value={body} onChange={setBody} placeholder="What changed? @Brent" />
        <div className="fg" style={{ marginTop: 8 }}>
          <label className="fl">Photos and videos</label>
          <input
            className="fi"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} style={{ fontSize: 12, marginTop: 4 }}>
              {file.name}
            </div>
          ))}
          {progress && <UploadProgress name={progress.name} pct={progress.pct} />}
        </div>
        <div className="fg">
          <label className="fl">Link</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="fi"
              value={linkDraft}
              placeholder="https://photos.google.com/..."
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLink(linkDraft);
                }
              }}
            />
            <button type="button" className="btn btn-sm" onClick={() => addLink(linkDraft)}>
              Add
            </button>
          </div>
          {links.map((url) => (
            <div key={url} style={{ fontSize: 12, marginTop: 4 }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
                {url}
              </a>
            </div>
          ))}
        </div>
        <div className="ma">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-p" disabled={posting} onClick={() => void postUpdate()}>
            {posting ? 'Posting…' : 'Post update'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MediaGrid({ items }: { items: WorkOrderMedia[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
      {items.map((item) => {
        if (item.kind === 'link' || item.link_url) {
          const href = item.link_url || item.file_url || '#';
          return (
            <a key={item.id} href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--blue)', wordBreak: 'break-all' }}>
              {item.link_url || item.file_name || 'Link'}
            </a>
          );
        }
        if (item.kind === 'video' && item.download_url) {
          return <video key={item.id} src={item.download_url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />;
        }
        if (item.download_url) {
          return <img key={item.id} src={item.download_url} alt={item.file_name || 'Work order photo'} style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 160 }} />;
        }
        return (
          <div key={item.id} style={{ fontSize: 12, color: 'var(--t2)' }}>
            {item.file_name}
          </div>
        );
      })}
    </div>
  );
}
