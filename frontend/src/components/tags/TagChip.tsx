import { IconX } from '@tabler/icons-react';
import type { PersonTag } from '../../types';

export function TagChip({ tag, onRemove }: { tag: PersonTag; onRemove?: () => void }) {
  return (
    <span
      className="badge"
      style={{ background: `${tag.color}22`, color: tag.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {tag.label}
      {onRemove && (
        <button
          type="button"
          className="btn-reset"
          onClick={onRemove}
          style={{ display: 'flex', cursor: 'pointer', color: 'inherit', opacity: 0.7 }}
          title="Remove tag"
        >
          <IconX size={11} />
        </button>
      )}
    </span>
  );
}
