import { IconPlus, IconX } from '@tabler/icons-react';
import type { CostCode, EstimateSuggestion } from '../../types';

export function SuggestionCard({
  suggestion,
  costCodes,
  onAdd,
  onDismiss,
}: {
  suggestion: EstimateSuggestion;
  costCodes: CostCode[];
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const costCode = suggestion.cost_code_id ? costCodes.find((c) => c.id === suggestion.cost_code_id) : undefined;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{suggestion.title}</div>
      {costCode && (
        <span className="badge bg-gray" style={{ marginTop: 4, display: 'inline-block' }}>
          {costCode.code} - {costCode.name}
        </span>
      )}
      <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6 }}>{suggestion.rationale}</div>
      {suggestion.source_quote && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, fontStyle: 'italic' }}>
          "{suggestion.source_quote}"
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="button" className="btn btn-p btn-sm" onClick={onAdd}>
          <IconPlus size={13} /> Add
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          <IconX size={13} /> Dismiss
        </button>
      </div>
    </div>
  );
}
