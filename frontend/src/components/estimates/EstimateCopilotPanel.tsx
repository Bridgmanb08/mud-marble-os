import { useState } from 'react';
import { IconSparkles, IconChevronsRight, IconChevronsLeft } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { useReferenceData } from '../../reference-data/ReferenceDataContext';
import { SuggestionCard } from './SuggestionCard';
import { SocraticGapCard } from './SocraticGapCard';
import { LineItemModal } from './LineItemModal';
import type { EstimateSuggestion, GapCheckResponse, GapQuestion, TranscriptExtractResponse } from '../../types';

type Mode = 'gap' | 'transcript';

export function EstimateCopilotPanel({
  estimateId,
  existingGroups,
  onItemAdded,
}: {
  estimateId: string;
  existingGroups: string[];
  onItemAdded: () => void;
}) {
  const { costCodes: costCodesData } = useReferenceData();
  const costCodes = costCodesData ?? [];
  const toast = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<Mode>('gap');
  const [checking, setChecking] = useState(false);
  const [questions, setQuestions] = useState<GapQuestion[]>([]);
  const [suggestions, setSuggestions] = useState<EstimateSuggestion[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [hasCheckedGap, setHasCheckedGap] = useState(false);
  const [hasCheckedTranscript, setHasCheckedTranscript] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [addingSuggestion, setAddingSuggestion] = useState<EstimateSuggestion | undefined>(undefined);
  const [addedSuggestions, setAddedSuggestions] = useState<EstimateSuggestion[]>([]);

  async function runGapCheck() {
    setChecking(true);
    try {
      const result = await api.post<GapCheckResponse>(`/estimates/${estimateId}/copilot/gap-check`);
      setQuestions(result.questions);
      setDropped(result.dropped);
      setAddedSuggestions([]);
      setHasCheckedGap(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to check for gaps', true);
    } finally {
      setChecking(false);
    }
  }

  async function runTranscriptExtract() {
    if (!transcript.trim()) return;
    setChecking(true);
    try {
      const result = await api.post<TranscriptExtractResponse>(`/estimates/${estimateId}/copilot/transcript-extract`, {
        transcript: transcript.trim(),
      });
      setSuggestions(result.suggestions);
      setDropped(result.dropped);
      setHasCheckedTranscript(true);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to extract items from that transcript', true);
    } finally {
      setChecking(false);
    }
  }

  function dismiss(suggestion: EstimateSuggestion) {
    setSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  function handleAdded() {
    setAddingSuggestion(undefined);
    if (mode === 'gap') {
      setAddedSuggestions((prev) => [...prev, addingSuggestion!]);
    } else {
      setSuggestions((prev) => prev.filter((s) => s !== addingSuggestion));
    }
    onItemAdded();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setCollapsed(false)}
        style={{ height: 'fit-content', display: 'flex', alignItems: 'center', gap: 6 }}
        title="Open estimating copilot"
      >
        <IconSparkles size={14} />
        <IconChevronsLeft size={14} />
      </button>
    );
  }

  return (
    <div className="card" style={{ width: 340, flexShrink: 0, padding: 16, height: 'fit-content', position: 'sticky', top: 76 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <IconSparkles size={16} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>Estimating copilot</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCollapsed(true)} title="Collapse">
          <IconChevronsRight size={14} />
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button
          className={`tab${mode === 'gap' ? ' on' : ''}`}
          onClick={() => {
            setMode('gap');
            setDropped([]);
          }}
        >
          Gap check
        </button>
        <button
          className={`tab${mode === 'transcript' ? ' on' : ''}`}
          onClick={() => {
            setMode('transcript');
            setDropped([]);
          }}
        >
          Import transcript
        </button>
      </div>

      {mode === 'gap' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>
            Asks a few yes/no questions about your current line items to walk through commonly-missed
            complementary scope (e.g. drywall usually needs paint), with follow-up questions where it helps.
          </p>
          <button type="button" className="btn btn-p btn-sm" onClick={runGapCheck} disabled={checking} style={{ marginBottom: 12 }}>
            {checking ? 'Checking…' : 'Check for gaps'}
          </button>
        </>
      )}

      {mode === 'transcript' && (
        <>
          <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>
            Paste a walkthrough transcript to suggest line items and flag likely-missing scope.
          </p>
          <textarea
            className="fi"
            style={{ minHeight: 100, marginBottom: 8 }}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste transcript here…"
          />
          <button
            type="button"
            className="btn btn-p btn-sm"
            onClick={runTranscriptExtract}
            disabled={checking || !transcript.trim()}
            style={{ marginBottom: 12 }}
          >
            {checking ? 'Extracting…' : 'Extract items'}
          </button>
        </>
      )}

      {dropped.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
          {dropped.length} suggestion{dropped.length !== 1 ? 's' : ''} needed a manual cost-code check.
        </div>
      )}

      {mode === 'gap' && (
        <>
          {questions.length === 0 && hasCheckedGap && !checking && (
            <div className="empty-s">Nothing looks missing right now.</div>
          )}
          {questions.map((q, i) => (
            <SocraticGapCard
              key={`${q.question}-${i}`}
              question={q}
              costCodes={costCodes}
              isAdded={(s) => addedSuggestions.includes(s)}
              onAdd={(s) => setAddingSuggestion(s)}
            />
          ))}
        </>
      )}

      {mode === 'transcript' && (
        <>
          {suggestions.length === 0 && hasCheckedTranscript && !checking && (
            <div className="empty-s">Nothing to extract from that transcript.</div>
          )}
          {suggestions.map((s, i) => (
            <SuggestionCard
              key={`${s.title}-${i}`}
              suggestion={s}
              costCodes={costCodes}
              onAdd={() => setAddingSuggestion(s)}
              onDismiss={() => dismiss(s)}
            />
          ))}
        </>
      )}

      {addingSuggestion && (
        <LineItemModal
          estimateId={estimateId}
          defaultTitle={addingSuggestion.title}
          defaultCostCodeId={addingSuggestion.cost_code_id || undefined}
          defaultGroupName={addingSuggestion.suggested_group_name || undefined}
          defaultNotesExternal={addingSuggestion.rationale}
          existingGroups={existingGroups}
          onClose={() => setAddingSuggestion(undefined)}
          onSaved={handleAdded}
        />
      )}
    </div>
  );
}
