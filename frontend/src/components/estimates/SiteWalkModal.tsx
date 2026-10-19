import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconVideo, IconX } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import {
  MAX_VIDEO_BYTES,
  extractAudioPieces,
  sampleFrames,
  segmentsToText,
  videoDuration,
  type SampledFrame,
  type TranscriptSegment,
} from '../../lib/siteWalkMedia';

interface DraftItem {
  title: string;
  group_name: string | null;
  cost_code_id: string | null;
  quantity: number;
  unit: string | null;
  description: string | null;
  internal_notes: string | null;
  basis: 'stated' | 'inferred' | 'visual';
  is_allowance: boolean;
  source: string | null;
}
interface DraftResponse {
  summary: string;
  items: DraftItem[];
  questions: string[];
  model: string | null;
}

interface Clip {
  id: number;
  label: string;
  file: File | null; // null = typed/pasted notes
  status: 'queued' | 'reading' | 'transcribing' | 'done' | 'error';
  message?: string;
  transcript: string;
}

const MAX_FRAMES = 36;
const MIN_FRAME_GAP_SECONDS = 4;
const MAX_REQUEST_CHARS = 4_000_000; // the host rejects request bodies over ~4.5 MB

const BASIS_LABEL: Record<DraftItem['basis'], { text: string; cls: string; hint: string }> = {
  stated: { text: 'Said', cls: 'bg-green', hint: 'Said out loud in the video' },
  inferred: { text: 'Worked out', cls: 'bg-amber', hint: 'Worked out from what was said' },
  visual: { text: 'Seen only', cls: 'bg-gray', hint: 'Seen in the footage but never mentioned -- check it' },
};

let nextClipId = 1;

export function SiteWalkModal({
  estimateId,
  onClose,
  onApplied,
}: {
  estimateId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [clips, setClips] = useState<Clip[]>([]);
  const [pasted, setPasted] = useState('');
  const [phase, setPhase] = useState<'pick' | 'working' | 'review'>('pick');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [transcriptionAvailable, setTranscriptionAvailable] = useState<boolean | null>(null);
  const [frames, setFrames] = useState<SampledFrame[]>([]);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [rows, setRows] = useState<(DraftItem & { keep: boolean })[]>([]);
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const cancelled = useRef(false);
  const labelCount = useRef(0); // numbers videos 1, 2, 3... even when several are added at once

  useEffect(() => {
    api
      .get<{ transcription_available: boolean }>(`/estimates/${estimateId}/site-walk/status`)
      .then((s) => setTranscriptionAvailable(s.transcription_available))
      .catch(() => setTranscriptionAvailable(null));
    return () => {
      cancelled.current = true;
    };
  }, [estimateId]);

  function updateClip(id: number, patch: Partial<Clip>) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addFiles(list: FileList | File[]) {
    const videos = Array.from(list).filter((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(f.name));
    if (videos.length === 0) {
      setError('Add video files (.mov or .mp4).');
      return;
    }
    const tooBig = videos.find((f) => f.size > MAX_VIDEO_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is over 800 MB -- trim it or split it into shorter clips.`);
      return;
    }
    setError('');
    const added = videos.map((file) => ({
      id: nextClipId++,
      label: `Video ${++labelCount.current}`,
      file,
      status: 'queued' as const,
      transcript: '',
    }));
    setClips((prev) => [...prev, ...added]);
  }

  async function transcribeClip(clip: Clip): Promise<string> {
    const pieces = await extractAudioPieces(clip.file!);
    if (pieces.length === 0) return '';
    const segments: TranscriptSegment[] = [];
    for (let i = 0; i < pieces.length; i++) {
      if (cancelled.current) throw new Error('cancelled');
      updateClip(clip.id, { status: 'transcribing', message: `Transcribing ${i + 1} of ${pieces.length}…` });
      const form = new FormData();
      form.append('audio', pieces[i].blob, `piece-${i}.wav`);
      form.append('offset_seconds', String(pieces[i].offset));
      const res = await api.postForm<{ segments: TranscriptSegment[] }>(`/estimates/${estimateId}/site-walk/transcribe`, form);
      segments.push(...res.segments);
    }
    return segmentsToText(segments);
  }

  async function runDraft(currentClips: Clip[], currentFrames: SampledFrame[]) {
    const withText = currentClips.map((c) => ({ label: c.label, transcript: c.transcript }));
    if (pasted.trim()) withText.push({ label: 'Typed notes', transcript: pasted.trim() });
    let sendFrames = currentFrames;
    const body = () => JSON.stringify({ clips: withText, frames: sendFrames });
    while (body().length > MAX_REQUEST_CHARS && sendFrames.length > 4) {
      sendFrames = sendFrames.filter((_, i) => i % 2 === 0); // too big for one request -- thin the frames out
    }
    setStage('Drafting the estimate…');
    const res = await api.post<DraftResponse>(`/estimates/${estimateId}/site-walk/draft`, { clips: withText, frames: sendFrames });
    setDraft(res);
    setRows(res.items.map((i) => ({ ...i, keep: true })));
  }

  async function start() {
    setError('');
    cancelled.current = false;
    setPhase('working');
    const work = clips.map((c) => ({ ...c }));
    try {
      // Work out the frame spacing from the total length first, so a long walk
      // still lands at about MAX_FRAMES frames overall.
      const durations = await Promise.all(work.map((c) => (c.file ? videoDuration(c.file).catch(() => 0) : Promise.resolve(0))));
      const total = durations.reduce((a, b) => a + b, 0);
      const everySec = Math.max(MIN_FRAME_GAP_SECONDS, Math.ceil(total / MAX_FRAMES));
      const allFrames: SampledFrame[] = [];
      for (const clip of work) {
        if (!clip.file) continue;
        if (cancelled.current) return;
        setStage(`${clip.label}: reading the video…`);
        updateClip(clip.id, { status: 'reading', message: 'Reading frames…' });
        try {
          allFrames.push(...(await sampleFrames(clip.file, clip.label, { everySec })));
        } catch (e) {
          updateClip(clip.id, { message: e instanceof Error ? e.message : 'Could not read frames.' });
        }
        if (transcriptionAvailable === false) {
          updateClip(clip.id, { status: 'error', message: 'Speech-to-text is not set up -- paste what was said below.' });
          continue;
        }
        setStage(`${clip.label}: transcribing…`);
        try {
          clip.transcript = await transcribeClip(clip);
          updateClip(clip.id, { status: 'done', transcript: clip.transcript, message: clip.transcript ? undefined : 'No speech found.' });
        } catch (e) {
          if (e instanceof Error && e.message === 'cancelled') return;
          updateClip(clip.id, { status: 'error', message: (e instanceof ApiError || e instanceof Error ? e.message : 'Could not transcribe.') });
        }
      }
      if (cancelled.current) return;
      setFrames(allFrames);
      setClips((prev) => prev.map((c) => ({ ...c, transcript: work.find((w) => w.id === c.id)?.transcript ?? c.transcript })));
      await runDraft(work, allFrames);
      setPhase('review');
    } catch (e) {
      if (cancelled.current) return;
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('pick');
    }
  }

  async function redraft() {
    setError('');
    setPhase('working');
    try {
      await runDraft(clips, frames);
      setPhase('review');
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('review');
    }
  }

  async function apply() {
    const chosen = rows.filter((r) => r.keep);
    if (chosen.length === 0) return;
    setApplying(true);
    try {
      const res = await api.post<{ added_count: number; errors: string[] }>(`/estimates/${estimateId}/site-walk/apply`, {
        items: chosen.map(({ keep: _keep, ...item }) => item),
      });
      toast(`Added ${res.added_count} line${res.added_count === 1 ? '' : 's'} to the estimate -- no prices yet`);
      onApplied();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add the lines', true);
    } finally {
      setApplying(false);
    }
  }

  const canStart = clips.length > 0 || pasted.trim().length > 0;
  const keptCount = rows.filter((r) => r.keep).length;

  return (
    <Modal title="Draft an estimate from a site walk" xl onClose={onClose}>
      {phase === 'pick' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 12 }}>
            Drop one or more narrated walk-through videos. Say what you see and what the scope is (room, sizes, what comes out, what
            goes in) -- the more you say, the better the draft. You'll review every line before anything is added, and no prices are set.
          </p>
          {transcriptionAvailable === false && (
            <div className="merr" style={{ marginBottom: 12 }}>
              Speech-to-text isn't set up yet, so videos can't be transcribed. You can still paste what was said below and the
              footage will be read alongside it.
            </div>
          )}
          {error && <div className="merr">{error}</div>}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-md)'}`,
              borderRadius: 'var(--r)',
              padding: 24,
              textAlign: 'center',
              background: dragOver ? 'var(--brand-cream)' : 'transparent',
            }}
          >
            <IconVideo size={28} style={{ color: 'var(--t3)' }} />
            <div style={{ margin: '6px 0 10px', fontSize: 13 }}>Drop videos here</div>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
              Choose videos
              <input type="file" accept="video/*,.mov,.mp4,.m4v" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </label>
          </div>
          {clips.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {clips.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  <strong>{c.label}</strong>
                  <span style={{ color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.file?.name}</span>
                  <span style={{ color: 'var(--t3)' }}>{c.file ? `${(c.file.size / 1048576).toFixed(0)} MB` : ''}</span>
                  <button type="button" className="btn-reset" title="Remove" onClick={() => setClips((prev) => prev.filter((x) => x.id !== c.id))}>
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="fg" style={{ marginTop: 14 }}>
            <label className="fl">Or paste / type what was said (optional)</label>
            <textarea className="fi" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="e.g. 40 by 40 floor needs new flooring, drop the ceiling tiles, new lights…" />
          </div>
          <div className="ma">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-p" disabled={!canStart} onClick={start}>
              Draft the estimate
            </button>
          </div>
        </>
      )}

      {phase === 'working' && (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{stage || 'Working…'}</div>
          {clips.map((c) => (
            <div key={c.id} style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 8 }}>
              <strong style={{ minWidth: 70 }}>{c.label}</strong>
              <span style={{ color: c.status === 'error' ? 'var(--rtx)' : 'var(--t2)' }}>
                {c.status === 'done' ? 'Transcribed' : c.status === 'queued' ? 'Waiting' : c.message || (c.status === 'reading' ? 'Reading frames…' : 'Transcribing…')}
              </span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 12 }}>This usually takes a minute or two. Keep this window open.</p>
          <div className="ma">
            <button
              className="btn"
              onClick={() => {
                cancelled.current = true;
                setPhase('pick');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'review' && draft && (
        <>
          {error && <div className="merr">{error}</div>}
          {draft.summary && <p style={{ fontSize: 13, marginBottom: 10 }}>{draft.summary}</p>}
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 8 }}>
            A first pass for you to check. Untick anything you don't want; edit the name, group, quantity or unit. Quantities of 1 LS mean
            a size wasn't stated. Lines marked “Seen only” came from the footage, not the narration.
          </p>
          <div className="tbl-scroll" style={{ maxHeight: '42vh', overflowY: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th style={{ minWidth: 230 }}>Line</th>
                  <th style={{ minWidth: 130 }}>Group</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 64 }}>Unit</th>
                  <th>Basis</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const patch = (p: Partial<DraftItem & { keep: boolean }>) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  const b = BASIS_LABEL[r.basis];
                  return (
                    <tr key={i} style={{ opacity: r.keep ? 1 : 0.45 }}>
                      <td>
                        <input type="checkbox" checked={r.keep} onChange={(e) => patch({ keep: e.target.checked })} />
                      </td>
                      <td>
                        <input className="fi" value={r.title} onChange={(e) => patch({ title: e.target.value })} />
                      </td>
                      <td>
                        <input className="fi" value={r.group_name || ''} onChange={(e) => patch({ group_name: e.target.value || null })} />
                      </td>
                      <td>
                        <input className="fi" type="number" value={r.quantity} onChange={(e) => patch({ quantity: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td>
                        <input className="fi" value={r.unit || ''} onChange={(e) => patch({ unit: e.target.value || null })} />
                      </td>
                      <td>
                        <span className={`badge ${b.cls}`} title={b.hint}>
                          {b.text}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--t2)', maxWidth: 260 }} title={r.internal_notes || ''}>
                        {r.internal_notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {draft.questions.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconAlertTriangle size={14} /> To confirm before pricing
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--t2)' }}>
                {draft.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowTranscripts((v) => !v)}>
              {showTranscripts ? 'Hide' : 'Show / fix'} what was heard
            </button>
            {showTranscripts && (
              <div style={{ marginTop: 8 }}>
                {clips.map((c) => (
                  <div className="fg" key={c.id}>
                    <label className="fl">{c.label} transcript</label>
                    <textarea className="fi" rows={5} value={c.transcript} onChange={(e) => updateClip(c.id, { transcript: e.target.value })} />
                    {c.message && <div className="m-sub">{c.message}</div>}
                  </div>
                ))}
                <button type="button" className="btn btn-sm" onClick={redraft}>
                  Redraft with these edits
                </button>
                <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 8 }}>Replaces the lines above.</span>
              </div>
            )}
          </div>
          <div className="ma">
            <button className="btn" onClick={onClose}>
              Close without adding
            </button>
            <button className="btn btn-p" disabled={keptCount === 0 || applying} onClick={apply}>
              {applying ? 'Adding…' : `Add ${keptCount} line${keptCount === 1 ? '' : 's'} to the estimate`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
