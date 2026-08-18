import { IconAlertTriangle } from '@tabler/icons-react';
import { fmtD } from '../../lib/format';
import type { FathomDuplicateInfo } from '../../types';

// Shared across all three Fathom import surfaces (dashboard card, per-project
// widget, Task Board modal) -- shown right after a parse whose transcript
// hash matches an existing fathom_imports row, so someone (e.g. Shannon,
// right after Brent already imported the same meeting) sees it before they
// click Import, not after. Never blocks the import -- just a heads-up.
export function FathomDuplicateWarning({ duplicate }: { duplicate: FathomDuplicateInfo }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        background: 'rgba(196,142,33,.12)',
        border: '1px solid var(--amber)',
        borderRadius: 8,
        padding: 10,
        marginTop: 10,
        marginBottom: 10,
        fontSize: 12,
      }}
    >
      <IconAlertTriangle size={15} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>This looks like a duplicate</div>
        <div style={{ color: 'var(--t2)' }}>
          {duplicate.imported_by || 'Someone'} already imported "{duplicate.meeting_title || 'this meeting'}" on{' '}
          {fmtD(duplicate.imported_at)}. Importing again may create duplicate tasks — double check before
          continuing.
        </div>
      </div>
    </div>
  );
}
