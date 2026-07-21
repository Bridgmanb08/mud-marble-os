import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { AskAIWidget } from '../ai/AskAIWidget';

export function AppLayout() {
  return (
    <>
      <Topbar />
      <Sidebar />
      <div className="main">
        <Outlet />
      </div>
      <AskAIWidget />
    </>
  );
}
