import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { setApiReadOnly } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { isWriteButton } from '../../auth/viewerUi';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { NotificationTicker } from './NotificationTicker';
import { TeamReminders } from './TeamReminders';
import { DigestPopup } from './DigestPopup';
import { CommandPalette } from './CommandPalette';
import { AskAIWidget } from '../ai/AskAIWidget';
import { QuickTaskWidget } from '../reminders/QuickTaskWidget';

export function AppLayout() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';

  useEffect(() => {
    const root = document.documentElement;
    if (!isViewer) {
      delete root.dataset.access;
      setApiReadOnly(false);
      return;
    }
    root.dataset.access = 'viewer';
    setApiReadOnly(true);
    const mark = (scope: ParentNode) => {
      scope.querySelectorAll('button').forEach((node) => {
        if (node instanceof HTMLButtonElement && isWriteButton(node)) node.dataset.viewerWrite = '';
      });
    };
    mark(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node instanceof HTMLButtonElement && isWriteButton(node)) node.dataset.viewerWrite = '';
          mark(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      delete root.dataset.access;
      setApiReadOnly(false);
      document.querySelectorAll('[data-viewer-write]').forEach((el) => el.removeAttribute('data-viewer-write'));
    };
  }, [isViewer]);

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
      {!isViewer && <AskAIWidget />}
      {!isViewer && <QuickTaskWidget />}
      <TeamReminders />
      <DigestPopup />
      <CommandPalette />
    </>
  );
}
