import { useEffect, useState } from 'react';
import { IconInbox, IconPhoto, IconVideo, IconFileTypePdf, IconFile } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import type { InboundMedia, Project } from '../types';

function FileIcon({ type }: { type: string }) {
  if (type === 'photo') return <IconPhoto size={28} />;
  if (type === 'video') return <IconVideo size={28} />;
  if (type === 'plan') return <IconFileTypePdf size={28} />;
  return <IconFile size={28} />;
}

function MediaThumb({ item }: { item: InboundMedia }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    api
      .get<{ download_url: string }>(`/inbound-media/${item.id}/download`)
      .then((r) => setUrl(r.download_url))
      .catch(() => {});
  }, [item.id]);
  if (item.file_type === 'photo' && url) return <img src={url} alt="" loading="lazy" />;
  return <FileIcon type={item.file_type} />;
}

export default function Review() {
  const [items, setItems] = useState<InboundMedia[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const toast = useToast();

  async function load() {
    try {
      const [inbound, projectList] = await Promise.all([
        api.get<InboundMedia[]>('/inbound-media'),
        api.get<Project[]>('/projects'),
      ]);
      setItems(inbound);
      setProjects(projectList);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load review queue', true);
      setItems([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAssign(item: InboundMedia) {
    const projectId = assigning[item.id];
    if (!projectId) return;
    try {
      await api.post(`/inbound-media/${item.id}/assign`, { project_id: projectId });
      toast('Assigned to project');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to assign', true);
    }
  }

  async function handleDismiss(item: InboundMedia) {
    if (!confirm('Dismiss this item without assigning it to a project?')) return;
    try {
      await api.delete(`/inbound-media/${item.id}`);
      toast('Dismissed');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to dismiss', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Review</h1>
          <p>Photos, videos, and plans texted in that couldn't be automatically matched to a project</p>
        </div>
      </div>

      {items === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <IconInbox size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">Nothing to review</div>
        </div>
      ) : (
        <div className="file-grid">
          {items.map((item) => (
            <div key={item.id} className="file-card" style={{ cursor: 'default' }}>
              <div className="file-thumb">
                <MediaThumb item={item} />
              </div>
              <div className="file-info">
                <div className="file-name">{item.from_phone}</div>
                <div className="file-meta">
                  <span
                    className={`badge ${item.status === 'needs_review' ? 'bg-amber' : 'bg-blue'}`}
                    style={{ marginRight: 6 }}
                  >
                    {item.status === 'needs_review' ? 'Needs review' : 'Awaiting reply'}
                  </span>
                </div>
                {item.body && <div style={{ fontSize: 12, color: 'var(--t2)', margin: '6px 0' }}>"{item.body}"</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <select
                    className="fi"
                    style={{ fontSize: 12, padding: '4px 6px' }}
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
                  <button className="btn btn-sm" onClick={() => handleDismiss(item)}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
