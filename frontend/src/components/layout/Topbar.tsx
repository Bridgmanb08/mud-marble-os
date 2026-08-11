import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconLogout, IconChevronDown, IconSettings, IconSearch, IconHeartHandshake, IconMenu2 } from '@tabler/icons-react';
import { useAuth } from '../../auth/AuthContext';
import { NotificationBell } from './NotificationBell';
import { JobSwitcher } from './JobSwitcher';
import { PulseCheckinModal } from '../dashboard/PulseCheckinModal';

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPulseCheckin, setShowPulseCheckin] = useState(false);

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button
          type="button"
          className="btn btn-sm btn-ghost hamburger-btn"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          title="Menu"
        >
          <IconMenu2 size={20} />
        </button>
        <div className="logo">
          <img src="/logo.png" alt="Mud & Marble" className="logo-mark" />
          <span className="logo-name">Mud &amp; Marble</span>
          <span className="logo-sub">OS</span>
        </div>
        {/* Job switcher and the ⌘K hint are desktop conveniences -- the
            keyboard-shortcut badge is meaningless with no physical
            keyboard, and both are hidden under the mobile breakpoint (see
            index.css) in favor of the plain search icon below staying
            reachable. */}
        <span className="topbar-desktop-only">
          <JobSwitcher />
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t3)' }}
          title="Search everything"
        >
          <IconSearch size={14} />
          <span className="topbar-desktop-only">Search</span>
          <span className="topbar-desktop-only" style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>
            ⌘K
          </span>
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
              onClick={() => {
                setMenuOpen(false);
                setShowPulseCheckin(true);
              }}
            >
              <IconHeartHandshake size={14} /> Share a pulse check-in
            </button>
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
      {showPulseCheckin && <PulseCheckinModal onClose={() => setShowPulseCheckin(false)} />}
    </div>
  );
}
