import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { NotificationTicker } from './NotificationTicker';
import { TeamReminders } from './TeamReminders';
import { CommandPalette } from './CommandPalette';
import { AskAIWidget } from '../ai/AskAIWidget';
import { QuickTaskWidget } from '../reminders/QuickTaskWidget';

export function AppLayout() {
  // Lifted here (not local to Sidebar/Topbar) since the hamburger button
  // that opens the drawer lives in Topbar while the drawer itself lives in
  // Sidebar -- they need to share one boolean. Irrelevant above the mobile
  // breakpoint: desktop CSS keeps the sidebar always visible regardless of
  // this state, it only drives the off-canvas drawer behavior on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Safety net so the drawer never gets stuck open across a route change
  // that didn't go through one of Sidebar's own NavLink clicks (e.g.
  // browser back/forward, or a link inside page content).
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <>
      <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <div className="main">
        <div style={{ position: 'sticky', top: 0, zIndex: 95, margin: '-24px -24px 16px' }}>
          <NotificationTicker />
        </div>
        <Outlet />
      </div>
      <AskAIWidget />
      <QuickTaskWidget />
      <TeamReminders />
      <CommandPalette />
    </>
  );
}
