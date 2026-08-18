import { useState } from 'react';
import { IconFileImport } from '@tabler/icons-react';
import { api } from '../../api/client';
import { fmtD } from '../../lib/format';
import type { FathomImport } from '../../types';

// Topbar entry point for "what has Fathom import actually created" -- the
// three import surfaces (dashboard card, project-page widget, task-board
// modal) all write a history row on import (see /ai/import-tasks), this is
// just the read side. Follows the exact same icon-button + absolute-dropdown
// shape as NotificationBell.tsx, the closest existing precedent for a
// topbar history panel.
export function FathomImportHistoryPanel() {
  const [imports, setImports] = useState<FathomImport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setImports(await api.get<FathomImport[]>('/ai/fathom-imports'));
    } catch {
      // Silent -- this is a convenience history panel, not core functionality;
      // an empty/stale list on a failed fetch isn't worth a toast.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        title="Fathom import history"
      >
        <IconFileImport size={16} />
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '110%', right: 0, width: 340, maxHeight: 440, overflowY: 'auto', zIndex: 30 }}
          onMouseLeave={() => setOpen(false)}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Fathom import history</span>
          </div>
          {loading ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--t2)' }}>Loading…</div>
          ) : imports.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--t2)' }}>
              No transcripts imported yet -- use the Fathom import card on the Dashboard, a job page, or the
              Task Board.
            </div>
          ) : (
            imports.map((imp) => (
              <div key={imp.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{imp.meeting_title || 'Untitled meeting'}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>{fmtD(imp.imported_at)}</span>
                </div>
                {imp.summary && (
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3, lineHeight: 1.4 }}>{imp.summary}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span className="badge bg-blue">
                    {imp.task_count} task{imp.task_count === 1 ? '' : 's'}
                  </span>
                  {imp.project_name && <span className="badge bg-gray">{imp.project_name}</span>}
                  {imp.meeting_date && <span className="badge bg-gray">{imp.meeting_date}</span>}
                </div>
                {imp.imported_by && (
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>Imported by {imp.imported_by}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
