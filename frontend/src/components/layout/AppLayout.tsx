import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <>
      <Topbar />
      <Sidebar />
      <div className="main">
        <Outlet />
      </div>
    </>
  );
}
