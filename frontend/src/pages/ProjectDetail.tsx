import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtD } from '../lib/format';
import type { Project, ProjectNote } from '../types';
import { NewNoteModal } from '../components/projects/NewNoteModal';

const TABS = ['Overview', 'Notes', 'Estimate', 'Change Orders', 'Invoices', 'Schedule'];

const NOTE_COLORS: Record<string, string> = {
  site_visit: 'var(--blue)',
  client_communication: 'var(--purple-tx)',
  internal: 'var(--t3)',
  daily_log: 'var(--green)',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [tab, setTab] = useState('Overview');
  const [showNewNote, setShowNewNote] = useState(false);

  async function loadNotes() {
    if (!id) return;
    try {
      const data = await api.get<ProjectNote[]>(`/projects/${id}/notes`);
      setNotes(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load notes', true);
    }
  }

  useEffect(() => {
    if (!id) return;
    api
      .get<Project>(`/projects/${id}`)
      .then(setProject)
      .catch(() => toast('Failed to load project', true));
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!project) {
    return (
      <div className="empty">
        <div className="empty-t">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-sm" style={{ marginBottom: 12 }} onClick={() => navigate('/projects')}>
        <IconArrowLeft size={14} /> Back to Projects
      </button>
      <div className="ph">
        <div>
          <h1>{project.name.replace(/\|.*/, '').trim()}</h1>
          <p>
            {project.clients ? `${project.clients.first_name || ''} ${project.clients.last_name || ''}`.trim() : 'No client'}
            {project.address ? ` · ${project.address}` : ''}
          </p>
        </div>
        <span className="badge bg-gray">{project.status.replace('_', ' ')}</span>
      </div>

      <div className="tabs" style={{ margin: '0 -24px 0', borderRadius: 0 }}>
        {TABS.map((t) => {
          const enabled = t === 'Overview' || t === 'Notes';
          return (
            <button
              key={t}
              type="button"
              className={`tab${tab === t ? ' on' : ''}${enabled ? '' : ' disabled'}`}
              onClick={() => enabled && setTab(t)}
              disabled={!enabled}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div className="tb" style={{ borderRadius: '0 0 12px 12px' }}>
        {tab === 'Overview' && (
          <div className="ig">
            <div>
              <div className="ibt">Project details</div>
              <div className="ir">
                <span className="ik">Address</span>
                <span className="iv">{project.address || '—'}{project.city ? `, ${project.city}` : ''} {project.state}</span>
              </div>
              <div className="ir">
                <span className="ik">Type</span>
                <span className="iv">{project.project_type || '—'}</span>
              </div>
              <div className="ir">
                <span className="ik">Start date</span>
                <span className="iv">{fmtD(project.start_date)}</span>
              </div>
              <div className="ir">
                <span className="ik">Est. completion</span>
                <span className="iv">{fmtD(project.estimated_completion)}</span>
              </div>
              <div className="ir">
                <span className="ik">Contract value</span>
                <span className="iv">{fmt(project.contract_value)}</span>
              </div>
            </div>
            <div>
              <div className="ibt">Internal notes</div>
              <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{project.internal_notes || 'No notes yet.'}</p>
            </div>
          </div>
        )}

        {tab === 'Notes' && (
          <>
            <div className="sh">
              <div className="st">Activity log</div>
              <button className="btn btn-p btn-sm" onClick={() => setShowNewNote(true)}>
                <IconPlus size={14} /> Log a note
              </button>
            </div>
            {notes.length ? (
              notes.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="af-dot" style={{ background: NOTE_COLORS[n.note_type] || 'var(--t3)', width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{n.author}</strong> logged a {n.note_type.replace('_', ' ')}
                      {n.is_client_visible && <span className="badge bg-blue" style={{ marginLeft: 6 }}>Client visible</span>}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{n.content}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{fmtD(n.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-s">No notes logged yet.</div>
            )}
          </>
        )}
      </div>

      {showNewNote && id && (
        <NewNoteModal
          projectId={id}
          onClose={() => setShowNewNote(false)}
          onCreated={() => {
            setShowNewNote(false);
            toast('Note saved');
            loadNotes();
          }}
        />
      )}
    </>
  );
}
