import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  IconSettings,
  IconSearch,
  IconBriefcase,
  IconPlus,
} from '@tabler/icons-react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Project } from '../../types';

interface PaletteItem {
  id: string;
  group: 'Jobs' | 'Quick actions' | 'Pages';
  label: string;
  sublabel?: string;
  icon: typeof IconGauge;
  action: () => void;
}

const PAGES = [
  { to: '/', label: 'Dashboard', icon: IconGauge },
  { to: '/projects', label: 'Projects', icon: IconBuilding },
  { to: '/leads', label: 'Leads', icon: IconUserPlus },
  { to: '/clients', label: 'Clients', icon: IconUsers },
  { to: '/estimates', label: 'Estimates', icon: IconFileDollar },
  { to: '/invoices', label: 'Invoices', icon: IconReceipt },
  { to: '/change-orders', label: 'Change Orders', icon: IconGitBranch },
  { to: '/inhouse', label: 'In-House Sheet', icon: IconTable },
  { to: '/reports', label: 'Reports', icon: IconReportAnalytics },
  { to: '/tasks', label: 'Task Board', icon: IconLayoutKanban },
  { to: '/schedule', label: 'Schedule', icon: IconCalendar },
  { to: '/subcontractors', label: 'Subcontractors', icon: IconTools },
  { to: '/sub-intelligence', label: 'Sub Intelligence', icon: IconChartBar },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function handleOpenEvent() {
      setOpen(true);
    }
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('open-command-palette', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      api
        .get<Project[]>('/projects')
        .then(setProjects)
        .catch(() => setProjects([]));
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const jobItems: PaletteItem[] = projects.map((p) => ({
      id: `job-${p.id}`,
      group: 'Jobs',
      label: p.name.replace(/\|.*/, '').trim(),
      sublabel: p.status,
      icon: IconBriefcase,
      action: () => navigate(`/projects/${p.id}`),
    }));

    const quickActions: PaletteItem[] = [
      { id: 'qa-task', group: 'Quick actions', label: 'New task', icon: IconPlus, action: () => navigate('/tasks?new=1') },
      { id: 'qa-lead', group: 'Quick actions', label: 'New lead', icon: IconPlus, action: () => navigate('/leads?new=1') },
      { id: 'qa-txn', group: 'Quick actions', label: 'Add a transaction (pick a job)', icon: IconPlus, action: () => navigate('/inhouse') },
      { id: 'qa-estimate', group: 'Quick actions', label: 'Start an estimate (pick a job)', icon: IconPlus, action: () => navigate('/projects') },
    ];

    const pageItems: PaletteItem[] = PAGES.map((p) => ({
      id: `page-${p.to}`,
      group: 'Pages',
      label: p.label,
      icon: p.icon,
      action: () => navigate(p.to),
    }));
    pageItems.push({ id: 'page-settings', group: 'Pages', label: 'Settings', icon: IconSettings, action: () => navigate('/settings') });

    return [...jobItems, ...quickActions, ...pageItems];
  }, [projects, user, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q));
  }, [items, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, PaletteItem[]> = {};
    for (const item of filtered) {
      (groups[item.group] ||= []).push(item);
    }
    return groups;
  }, [filtered]);

  function activate(item: PaletteItem) {
    item.action();
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) activate(filtered[activeIndex]);
    }
  }

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 200,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="card"
        style={{ width: 560, maxHeight: '65vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <IconSearch size={16} style={{ color: 'var(--t3)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to a job, page, or action…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }}
          />
          <span style={{ fontSize: 11, color: 'var(--t3)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>
            Esc
          </span>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--t2)' }}>No matches.</div>
          )}
          {(['Jobs', 'Quick actions', 'Pages'] as const).map((groupName) => {
            const groupItems = grouped[groupName];
            if (!groupItems || groupItems.length === 0) return null;
            return (
              <div key={groupName} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--t3)', padding: '6px 14px 2px' }}>
                  {groupName}
                </div>
                {groupItems.map((item) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="btn-reset"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        background: isActive ? 'var(--gray-bg)' : undefined,
                      }}
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => activate(item)}
                    >
                      <item.icon size={15} style={{ color: 'var(--t2)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, flex: 1 }}>{item.label}</span>
                      {item.sublabel && (
                        <span style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'capitalize' }}>{item.sublabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
