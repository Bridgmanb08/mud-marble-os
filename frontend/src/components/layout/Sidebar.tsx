import { NavLink } from 'react-router-dom';
import {
  IconGauge,
  IconBuilding,
  IconUserPlus,
  IconUsers,
  IconFileDollar,
  IconReceipt,
  IconGitBranch,
  IconTable,
  IconLayoutKanban,
  IconCalendar,
  IconTools,
  IconChartBar,
  IconReportAnalytics,
  IconShieldLock,
  IconInbox,
} from '@tabler/icons-react';
import { useAuth } from '../../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconGauge;
  end?: boolean;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: IconGauge, end: true }],
  },
  {
    label: 'Operations',
    items: [
      { to: '/projects', label: 'Projects', icon: IconBuilding },
      { to: '/leads', label: 'Leads', icon: IconUserPlus },
      { to: '/clients', label: 'Client Directory', icon: IconUsers },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/estimates', label: 'Estimates', icon: IconFileDollar },
      { to: '/invoices', label: 'Invoices', icon: IconReceipt },
      { to: '/change-orders', label: 'Change Orders', icon: IconGitBranch },
      { to: '/inhouse', label: 'In-House Sheet', icon: IconTable },
      { to: '/reports', label: 'Reports', icon: IconReportAnalytics },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/tasks', label: 'Task Board', icon: IconLayoutKanban },
      { to: '/schedule', label: 'Schedule', icon: IconCalendar },
      { to: '/subcontractors', label: 'Subcontractors', icon: IconTools },
      { to: '/sub-intelligence', label: 'Sub Intelligence', icon: IconChartBar },
    ],
  },
];

export function Sidebar() {
  const { user } = useAuth();
  const sections = user?.is_admin
    ? [
        ...navSections,
        {
          label: 'Admin',
          items: [
            { to: '/users', label: 'Users', icon: IconShieldLock },
            { to: '/review', label: 'Review', icon: IconInbox },
          ],
        },
      ]
    : navSections;

  return (
    <div className="sidebar">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="nav-section">{section.label}</div>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  );
}
