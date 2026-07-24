import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconLogout, IconChevronDown, IconSettings, IconSearch } from '@tabler/icons-react';
import { useAuth } from '../../auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import { JobSwitcher } from './JobSwitcher';

export function Topbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div className="logo">
          <div className="logo-mark">M&amp;M</div>
          <span className="logo-name">Mud &amp; Marble</span>
          <span className="logo-sub">OS</span>
        </div>
        <JobSwitcher />
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t3)' }}
          title="Search everything"
        >
          <IconSearch size={14} />
          Search
          <span style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
        </button>
      </div>
      <div className="topbar-right" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link to="/settings" className="btn btn-sm btn-ghost" title="Settings">
          <IconSettings size={16} />
        </Link>
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
