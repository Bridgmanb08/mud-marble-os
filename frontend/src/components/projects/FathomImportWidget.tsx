import { useState } from 'react';
import { IconFileImport, IconX, IconWand } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { ExtractedTask, ParseTranscriptResponse } from '../../types';

function importedAtLabel(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function FathomImportWidget({
  projectId,
  projectName,
  onImported,
  onNoteAdded,
}: {
  projectId: string;
  projectName: string;
  onImported: () => void;
  onNoteAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<ParseTranscriptResponse | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  async function handleExtract() {
    if (!transcript.trim()) {
      toast('Paste a transcript first', true);
      return;
    }
    setExtracting(true);
    setError('');
    setResult(null);
    try {
      const data = await api.post<ParseTranscriptResponse>('/ai/parse-transcript', { transcript });
      setResult(data);
      setChecked(data.tasks.map(() => true));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to parse transcript');
    } finally {
      setExtracting(false);
    }
  }

  async function handleImport() {
    if (!result) return;
    const tasksToImport: ExtractedTask[] = result.tasks.filter((_, i) => checked[i]);
    if (!tasksToImport.length && !result.summary) {
      toast('Nothing to import', true);
      return;
    }
    setImporting(true);
    try {
      let importedCount = 0;
      if (tasksToImport.length) {
        const res = await api.post<{ imported: number }>('/ai/import-tasks', {
          tasks: tasksToImport,
          meeting_date: result.meeting_date,
          attendees: result.attendees,
          default_project_id: projectId,
        });
        importedCount = res.imported;
        onImported();
      }
      if (result.summary) {
        const title = result.meeting_title || 'Meeting summary';
        const when = result.meeting_date ? ` — ${result.meeting_date}` : '';
        const attendeesLine = result.attendees.length ? `\nAttendees: ${result.attendees.join(', ')}` : '';
        await api.post(`/projects/${projectId}/notes`, {
          author: 'brent',
          note_type: 'internal',
          content: `${title}${when}\n\n${result.summary}${attendeesLine}\n\nImported from Fathom transcript on ${importedAtLabel()}`,
          is_client_visible: false,
        });
        onNoteAdded();
      }
      const parts = [
        importedCount ? `${importedCount} task${importedCount !== 1 ? 's' : ''}` : null,
        result.summary ? 'a meeting summary note' : null,
      ].filter(Boolean);
      toast(`Imported ${parts.join(' and ')}`);
      setTranscript('');
      setResult(null);
      setChecked([]);
      setOpen(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to import', true);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="card"
          style={{
            position: 'fixed',
            bottom: 88,
            right: 92,
            width: 360,
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: 16,
            boxShadow: '0 8px 30px rgba(0,0,0,.18)',
            zIndex: 300,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <IconFileImport size={16} color="var(--blue)" />
            <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Import Fathom transcript</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              <IconX size={14} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10, lineHeight: 1.5 }}>
            Paste Fathom's summary, the full transcript, or both (pasting both is fine — it won't
            double-count tasks). Tasks default to <strong>{projectName}</strong> unless the transcript
            names a different job, and a meeting summary gets logged as a project note.
          </p>
          <textarea
            className="fi"
            style={{ minHeight: 100, fontSize: 12, marginBottom: 8 }}
            placeholder="Paste Fathom summary and/or transcript here…"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          {error && <div className="merr" style={{ marginBottom: 10 }}>{error}</div>}
          <button
            type="button"
            className="btn btn-p btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleExtract}
            disabled={extracting}
          >
            <IconWand size={14} /> {extracting ? 'Reading transcript…' : 'Extract from transcript'}
          </button>

          {result && (
            <div style={{ background: 'var(--gbg)', borderRadius: 8, padding: 12, marginTop: 10 }}>
              {result.summary && (
                <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,.08)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gtx)' }}>
                    {result.meeting_title || 'Meeting summary'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gtx)', opacity: 0.9, marginTop: 4 }}>{result.summary}</div>
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gtx)', marginBottom: 4 }}>
                {result.tasks.length} task{result.tasks.length !== 1 ? 's' : ''} found
              </div>
              {(result.meeting_date || result.attendees.length > 0) && (
                <div style={{ fontSize: 11, color: 'var(--gtx)', opacity: 0.85, marginBottom: 10 }}>
                  {result.meeting_date && <div>Meeting: {result.meeting_date}</div>}
                  {result.attendees.length > 0 && <div>Attendees: {result.attendees.join(', ')}</div>}
                </div>
              )}
              {result.tasks.map((t, i) => (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(0,0,0,.06)',
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked[i] ?? true}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = [...prev];
                        next[i] = e.target.checked;
                        return next;
                      })
                    }
                  />
                  <span style={{ flex: 1 }}>{t.title}</span>
                  <span className="badge bg-gray" style={{ fontSize: 10 }}>
                    {t.project || `${projectName} (default)`}
                  </span>
                </label>
              ))}
              {(result.tasks.length > 0 || result.summary) && (
                <button
                  type="button"
                  className="btn btn-p"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? 'Importing…' : 'Import to this job'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        className="ai-fab"
        style={{ right: 92 }}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Fathom import' : 'Import Fathom transcript'}
        title={open ? 'Close Fathom import' : 'Import Fathom transcript'}
      >
        {open ? <IconX size={22} /> : <IconFileImport size={22} />}
      </button>
    </>
  );
}
