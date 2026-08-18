import { useState } from 'react';
import { IconWand } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { FathomDuplicateWarning } from '../fathom/FathomDuplicateWarning';
import type { ExtractedTask, ParseTranscriptResponse } from '../../types';

// The Task Board's cross-project version of the Fathom import flow. Unlike
// FathomImportWidget (mounted per-project, defaults every task to that job),
// this one has no single project to default to -- it relies entirely on the
// extraction step matching project names mentioned in the transcript itself
// (same as the original dashboard FathomImportCard), leaving anything
// unmatched as a project-less task the person can assign from the board.
export function FathomImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<ParseTranscriptResponse | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  async function handleExtract() {
    if (!transcript.trim()) {
      setError('Paste a transcript first.');
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
        meeting_title: result.meeting_title,
        summary: result.summary,
        transcript_hash: result.transcript_hash,
      });
      toast(`${res.imported} task${res.imported !== 1 ? 's' : ''} imported to the Task Board`);
      onImported();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to import tasks', true);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Import Fathom transcript" onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 0, marginBottom: 12 }}>
        Paste a Fathom meeting transcript or summary and Claude will pull out tasks, guessing the right
        project from anything the transcript names (unmatched tasks land project-less for you to assign).
      </p>
      <textarea
        className="fi"
        style={{ minHeight: 140, fontSize: 12.5 }}
        placeholder="Paste Fathom transcript here…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        autoFocus
      />
      {error && <div className="merr" style={{ marginTop: 10 }}>{error}</div>}
      <button
        type="button"
        className="btn btn-p"
        style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        onClick={handleExtract}
        disabled={extracting}
      >
        <IconWand size={14} /> {extracting ? 'Reading transcript…' : 'Extract tasks from transcript'}
      </button>

      {result?.duplicate_of && <FathomDuplicateWarning duplicate={result.duplicate_of} />}

      {result && (
        <div style={{ background: 'var(--gbg)', borderRadius: 8, padding: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gtx)', marginBottom: 4 }}>
            Found {result.tasks.length} task{result.tasks.length !== 1 ? 's' : ''}
          </div>
          {(result.meeting_date || result.attendees.length > 0) && (
            <div style={{ fontSize: 11, color: 'var(--gtx)', opacity: 0.85, marginBottom: 10 }}>
              {result.meeting_date && <div>Meeting: {result.meeting_date}</div>}
              {result.attendees.length > 0 && <div>Attendees: {result.attendees.join(', ')}</div>}
            </div>
          )}
          {result.tasks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--gtx)', opacity: 0.85 }}>
              No action items found in that transcript.
            </div>
          ) : (
            <>
              {result.tasks.map((t, i) => (
                <label
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 0',
                    borderBottom: '1px solid rgba(0,0,0,.06)',
                    fontSize: 12.5,
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
                    {t.project || 'no project'}
                  </span>
                  <span className="badge bg-gray" style={{ fontSize: 10 }}>
                    {t.assigned_to || 'Shannon'}
                  </span>
                </label>
              ))}
              <button
                type="button"
                className="btn btn-p"
                style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing…' : 'Import checked tasks'}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
