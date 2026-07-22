import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { NotificationTicker } from './NotificationTicker';
import { CommandPalette } from './CommandPalette';
import { AskAIWidget } from '../ai/AskAIWidget';
import { QuickReminderWidget } from '../reminders/QuickReminderWidget';

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
      <QuickReminderWidget />
      <CommandPalette />
    </>
  );
}
