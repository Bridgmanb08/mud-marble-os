import { useState } from 'react';
import { IconLogout, IconChevronDown } from '@tabler/icons-react';
import { useAuth } from '../../auth/AuthContext';
import { NotificationBell } from './NotificationBell';

export function Topbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="topbar">
      <div className="logo">
        <div className="logo-mark">M&amp;M</div>
        <span className="logo-name">Mud &amp; Marble</span>
        <span className="logo-sub">OS</span>
      </div>
      <div className="topbar-right" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <NotificationBell />
        <button className="btn btn-sm btn-ghost" onClick={() => setMenuOpen((v) => !v)}>
          {user?.name || user?.email}
          <IconChevronDown size={14} />
        </button>
        {menuOpen && (
          <div
            className="card"
            style={{ position: 'absolute', top: '110%', right: 0, padding: 6, minWidth: 140 }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => logout()}
            >
              <IconLogout size={14} /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
