import { useState } from 'react';
import { IconFileImport, IconWand } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { ExtractedTask, ParseTranscriptResponse } from '../../types';

export function FathomImportCard() {
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
    const tasks: ExtractedTask[] = result.tasks.filter((_, i) => checked[i]);
    if (!tasks.length) {
      toast('No tasks selected', true);
      return;
    }
    setImporting(true);
    try {
      const res = await api.post<{ imported: number }>('/ai/import-tasks', {
        tasks,
        meeting_date: result.meeting_date,
        attendees: result.attendees,
      });
      toast(`${res.imported} task${res.imported !== 1 ? 's' : ''} imported to the Task Board`);
      setTranscript('');
      setResult(null);
      setChecked([]);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to import tasks', true);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, border: '2px dashed var(--border-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <IconFileImport size={20} color="var(--blue)" />
        <div className="st">Import Fathom transcript</div>
        <span className="badge bg-blue">New</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.5 }}>
        Paste a Fathom meeting transcript and Claude will extract tasks, project updates, and action
        items automatically.
      </p>
      <textarea
        className="fi"
        style={{ minHeight: 100, fontSize: 12 }}
        placeholder="Paste Fathom transcript here…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      {error && <div className="merr" style={{ marginTop: 10 }}>{error}</div>}
      <button
        className="btn btn-p"
        style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        onClick={handleExtract}
        disabled={extracting}
      >
        <IconWand size={14} /> {extracting ? 'Reading transcript…' : 'Extract tasks from transcript'}
      </button>

      {result && (
        <div style={{ background: 'var(--gbg)', borderRadius: 8, padding: 12, marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gtx)', marginBottom: 4 }}>
            Found {result.tasks.length} task{result.tasks.length !== 1 ? 's' : ''} + {result.project_updates.length}{' '}
            project update{result.project_updates.length !== 1 ? 's' : ''}
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
                {t.assigned_to || 'shannon'}
              </span>
            </label>
          ))}
          {result.tasks.length > 0 && (
            <button
              className="btn btn-p"
              style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing…' : 'Import checked tasks'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
