import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { fmt } from '../../lib/format';
import type { DeletedRecord } from '../../types';

// Matches RETENTION_DAYS in api/app/deleted_records.py.
const RETENTION_DAYS = 90;

function daysLeft(deletedAt: string): number {
  const elapsed = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000);
  return Math.max(RETENTION_DAYS - elapsed, 0);
}

export function RecentlyDeletedModal({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [records, setRecords] = useState<DeletedRecord[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DeletedRecord[]>('/deleted-records?kind=estimate')
      .then(setRecords)
      .catch(() => {
        setRecords([]);
        toast('Failed to load recently deleted estimates', true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restore(r: DeletedRecord) {
    setRestoring(r.id);
    try {
      const out = await api.post<{ version: number; version_changed: boolean }>(`/deleted-records/${r.id}/restore`);
      toast(
        out.version_changed
          ? `Restored ${r.label} as v${out.version} -- its version number had been reused since it was deleted`
          : `Restored ${r.label}`
      );
      setRecords((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev));
      onRestored();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to restore', true);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Modal title="Recently deleted estimates" onClose={onClose} wide>
      <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
        A deleted estimate and all of its line items are kept for {RETENTION_DAYS} days and can be restored exactly as
        they were.
      </p>
      {records === null ? (
        <div className="empty-s">Loading…</div>
      ) : records.length === 0 ? (
        <div className="empty-s">Nothing has been deleted recently.</div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl tbl-zebra">
            <thead>
              <tr>
                <th>Estimate</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th>Deleted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.label}</td>
                  <td>{r.summary.status ? r.summary.status.replace(/_/g, ' ') : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.summary.grand_total_owner_price)}</td>
                  <td style={{ textAlign: 'right' }}>{r.summary.item_count ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(r.deleted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {r.deleted_by ? ` by ${r.deleted_by}` : ''}
                    <div style={{ color: 'var(--t3)' }}>{daysLeft(r.deleted_at)} days left</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-p btn-sm" disabled={restoring !== null} onClick={() => restore(r)}>
                      {restoring === r.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
