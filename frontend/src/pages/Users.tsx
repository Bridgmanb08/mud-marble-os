import { useEffect, useState } from 'react';
import { IconPlus, IconUsers, IconShieldCheck, IconKey } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import type { UserSummary } from '../types';
import { NewUserModal } from '../components/users/NewUserModal';
import { ResetPasswordModal } from '../components/users/ResetPasswordModal';

export default function Users() {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<UserSummary[]>('/users');
      setUsers(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load users', true);
      setUsers([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleHideRentalFinancials(u: UserSummary) {
    const next = !u.hide_rental_financials;
    // Optimistic -- same instant-feedback pattern used throughout this app
    // rather than waiting on the round trip.
    setUsers((prev) => prev && prev.map((x) => (x.id === u.id ? { ...x, hide_rental_financials: next } : x)));
    try {
      await api.patch(`/users/${u.id}`, { hide_rental_financials: next });
    } catch (e) {
      setUsers((prev) => prev && prev.map((x) => (x.id === u.id ? { ...x, hide_rental_financials: !next } : x)));
      toast(e instanceof Error ? e.message : 'Failed to update', true);
    }
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Users</h1>
          <p>Team members with access to Mud &amp; Marble OS</p>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New user
        </button>
      </div>

      {users === null ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : users.length === 0 ? (
        <div className="empty">
          <IconUsers size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
          <div className="empty-t">No users yet</div>
        </div>
      ) : (
        users.map((u) => (
          <div key={u.id} className="cc">
            <div className="av">{(u.name || '?')[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{u.email}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span className="badge bg-blue">{u.role}</span>
              {u.is_admin && (
                <span className="badge bg-green">
                  <IconShieldCheck size={11} style={{ marginRight: 3 }} /> Admin
                </span>
              )}
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}
                title="Hides rental property purchase value, debt, and equity from this person -- rent, expenses, and other operational data stay visible."
              >
                <input type="checkbox" checked={u.hide_rental_financials} onChange={() => toggleHideRentalFinancials(u)} />
                Hide rental value/equity
              </label>
              <button className="btn btn-sm" onClick={() => setResetTarget(u)}>
                <IconKey size={12} /> Reset password
              </button>
            </div>
          </div>
        ))
      )}

      {showNew && (
        <NewUserModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            toast('User added');
            load();
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          userId={resetTarget.id}
          userName={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onReset={() => {
            setResetTarget(null);
            toast('Password reset');
          }}
        />
      )}
    </>
  );
}
