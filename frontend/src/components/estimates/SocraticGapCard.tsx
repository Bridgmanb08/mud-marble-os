import { useState } from 'react';
import { SuggestionCard } from './SuggestionCard';
import type { CostCode, EstimateSuggestion, GapQuestion, GapResolution } from '../../types';

type Answer = 'yes' | 'no';

function YesNoButtons({ value, onChange }: { value: Answer | null; onChange: (a: Answer) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button type="button" className={`btn btn-sm${value === 'yes' ? ' btn-p' : ''}`} onClick={() => onChange('yes')}>
        Yes
      </button>
      <button type="button" className={`btn btn-sm${value === 'no' ? ' btn-p' : ''}`} onClick={() => onChange('no')}>
        No
      </button>
    </div>
  );
}

function ResolutionView({
  resolution,
  costCodes,
  isAdded,
  onAdd,
}: {
  resolution: GapResolution;
  costCodes: CostCode[];
  isAdded: (s: EstimateSuggestion) => boolean;
  onAdd: (s: EstimateSuggestion) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--t2)' }}>{resolution.advice}</div>
      {resolution.suggestion && !dismissed && (
        <SuggestionCard
          suggestion={resolution.suggestion}
          costCodes={costCodes}
          added={isAdded(resolution.suggestion)}
          onAdd={() => onAdd(resolution.suggestion!)}
          onDismiss={() => setDismissed(true)}
        />
      )}
    </div>
  );
}

export function SocraticGapCard({
  question,
  costCodes,
  isAdded,
  onAdd,
}: {
  question: GapQuestion;
  costCodes: CostCode[];
  isAdded: (s: EstimateSuggestion) => boolean;
  onAdd: (s: EstimateSuggestion) => void;
}) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState<Answer | null>(null);
  const [topDismissed, setTopDismissed] = useState(false);

  const branch = answer ? question[answer] : null;

  function chooseAnswer(a: Answer) {
    setAnswer(a);
    setFollowUpAnswer(null);
    setTopDismissed(false);
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      {question.context && <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{question.context}</div>}
      <div style={{ fontSize: 13, fontWeight: 500 }}>{question.question}</div>
      <YesNoButtons value={answer} onChange={chooseAnswer} />

      {branch && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>{branch.advice}</div>
          {branch.suggestion && !topDismissed && (
            <SuggestionCard
              suggestion={branch.suggestion}
              costCodes={costCodes}
              added={isAdded(branch.suggestion)}
              onAdd={() => onAdd(branch.suggestion!)}
              onDismiss={() => setTopDismissed(true)}
            />
          )}
          {branch.follow_up && (
            <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{branch.follow_up.question}</div>
              <YesNoButtons value={followUpAnswer} onChange={setFollowUpAnswer} />
              {followUpAnswer && (
                <ResolutionView
                  resolution={branch.follow_up[followUpAnswer]}
                  costCodes={costCodes}
                  isAdded={isAdded}
                  onAdd={onAdd}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
