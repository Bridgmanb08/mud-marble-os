import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { NotificationTicker } from './NotificationTicker';
import { TeamReminders } from './TeamReminders';
import { CommandPalette } from './CommandPalette';
import { AskAIWidget } from '../ai/AskAIWidget';
import { QuickTaskWidget } from '../reminders/QuickTaskWidget';

export function AppLayout() {
  return (
    <>
      <Topbar />
      <Sidebar />
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
