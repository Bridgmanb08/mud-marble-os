import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconPlus, IconLayoutKanban, IconTable, IconTimeline, IconBookmark, IconTrash, IconFileImport } from '@tabler/icons-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import type { BoardView, Task } from '../types';
import { taskAssignees } from '../lib/taskAssignees';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TableView, type TaskGroupBy } from '../components/tasks/TableView';
import { TimelineView } from '../components/tasks/TimelineView';
import { NewTaskModal } from '../components/tasks/NewTaskModal';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { JobFilterSidebar } from '../components/tasks/JobFilterSidebar';
import { FathomImportModal } from '../components/tasks/FathomImportModal';
import { DesktopOnlyNotice } from '../components/ui/DesktopOnlyNotice';
import { useIsMobile } from '../hooks/useMediaQuery';

type TaskTab = 'all' | 'mine' | 'punch';
type ViewMode = 'kanban' | 'table' | 'timeline';

const STORAGE_KEY = 'mm.tasks.viewState.v1';

interface SavedViewState {
  view?: ViewMode;
  groupBy?: TaskGroupBy;
  projectFilter?: string;
  assigneeFilter?: string;
  statusFilter?: string;
  tab?: TaskTab;
  activeViewId?: string;
}

function loadSavedState(): SavedViewState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedViewState) : null;
  } catch {
    return null;
  }
}

export default function Tasks() {
  const saved = loadSavedState();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [view, setView] = useState<ViewMode>(saved?.view || 'kanban');
  const [groupBy, setGroupBy] = useState<TaskGroupBy>(saved?.groupBy || 'none');
  const [projectFilter, setProjectFilter] = useState(saved?.projectFilter || '');
  const [assigneeFilter, setAssigneeFilter] = useState(saved?.assigneeFilter || '');
  const [statusFilter, setStatusFilter] = useState(saved?.statusFilter || '');
  const [tab, setTab] = useState<TaskTab>(saved?.tab || 'all');
  const [showModal, setShowModal] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('upcoming');
  const [detailTask, setDetailTask] = useState<Task | undefined>(undefined);

  const [views, setViews] = useState<BoardView[]>([]);
  const [activeViewId, setActiveViewId] = useState(saved?.activeViewId || '');
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showFathomImport, setShowFathomImport] = useState(false);

  const toast = useToast();

  async function load() {
    try {
      const data = await api.get<Task[]>('/tasks');
      setTasks(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load tasks', true);
      setTasks([]);
    }
  }

  async function loadViews() {
    setViews(await api.get<BoardView[]>('/tasks/views').catch(() => []));
  }

  useEffect(() => {
    load();
    loadViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Supports the global command palette's "New task" quick action deep-linking
  // in via ?new=1 -- open the modal once, then strip the param so a refresh
  // or back-navigation doesn't reopen it.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDefaultStatus('upcoming');
      setShowModal(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Remember the last view/tab/filters the user had open so returning to
  // the Task Board doesn't dump them back to a blank Kanban view.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ view, groupBy, projectFilter, assigneeFilter, statusFilter, tab, activeViewId })
      );
    } catch {
      // ignore (e.g. private browsing / storage disabled)
    }
  }, [view, groupBy, projectFilter, assigneeFilter, statusFilter, tab, activeViewId]);

  function openNew(status: string) {
    setDefaultStatus(status);
    setShowModal(true);
  }

  function openEdit(id: string) {
    const t = tasks?.find((t) => t.id === id);
    if (t) setDetailTask(t);
  }

  function applyView(v: BoardView) {
    setActiveViewId(v.id);
    setView(v.view_type === 'table' ? 'table' : v.view_type === 'timeline' ? 'timeline' : 'kanban');
    setGroupBy((v.group_by as TaskGroupBy) || 'none');
    const f = v.filters || {};
    setProjectFilter((f.project_id as string) || '');
    setAssigneeFilter((f.assigned_to as string) || '');
    setStatusFilter((f.status as string) || '');
    setTab((f.tab as TaskTab) || 'all');
  }

  async function saveCurrentView() {
    if (!newViewName.trim()) return;
    try {
      const created = await api.post<BoardView>('/tasks/views', {
        name: newViewName.trim(),
        view_type: view,
        group_by: groupBy,
        filters: { project_id: projectFilter, assigned_to: assigneeFilter, status: statusFilter, tab },
      });
      setViews((prev) => [...prev, created]);
      setActiveViewId(created.id);
      setShowSaveViewModal(false);
      setNewViewName('');
      toast('View saved');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save view', true);
    }
  }

  async function deleteActiveView() {
    if (!activeViewId) return;
    try {
      await api.delete(`/tasks/views/${activeViewId}`);
      setViews((prev) => prev.filter((v) => v.id !== activeViewId));
      setActiveViewId('');
      toast('View deleted');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete view', true);
    }
  }

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks || []) for (const name of taskAssignees(t)) seen.add(name);
    return Array.from(seen);
  }, [tasks]);

  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      const assignees = taskAssignees(t);
      if (projectFilter && t.project_id !== projectFilter) return false;
      if (assigneeFilter && !assignees.includes(assigneeFilter)) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (tab === 'mine' && !assignees.includes(user?.name || '')) return false;
      if (tab === 'punch' && !t.is_punch_list) return false;
      return true;
    });
  }, [tasks, projectFilter, assigneeFilter, statusFilter, tab, user]);

  const filtersActive = Boolean(projectFilter || assigneeFilter || statusFilter || tab !== 'all');

  const total = filtered.length;
  const inProgress = filtered.filter((t) => t.status === 'in_progress').length;
  const delayed = filtered.filter((t) => ['delayed', 'blocked'].includes(t.status)).length;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const completedThisWeek = filtered.filter(
    (t) => t.status === 'complete' && t.completed_at && new Date(t.completed_at) >= oneWeekAgo
  ).length;

  return (
    <>
      <div className="tasks-layout">
        <JobFilterSidebar value={projectFilter} onChange={setProjectFilter} />

        <div className="tasks-main">
          <div className="ph">
            <div>
              <h1>Task Board</h1>
              <p>Shared task management across all active projects</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ background: view === 'kanban' ? 'var(--surface)' : undefined, boxShadow: view === 'kanban' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
                  onClick={() => setView('kanban')}
                >
                  <IconLayoutKanban size={14} /> Board
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ background: view === 'table' ? 'var(--surface)' : undefined, boxShadow: view === 'table' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
                  onClick={() => setView('table')}
                >
                  <IconTable size={14} /> Table
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ background: view === 'timeline' ? 'var(--surface)' : undefined, boxShadow: view === 'timeline' ? '0 1px 3px rgba(0,0,0,.08)' : undefined }}
                  onClick={() => setView('timeline')}
                >
                  <IconTimeline size={14} /> Timeline
                </button>
              </div>
              <button className="btn btn-sm" onClick={() => setShowFathomImport(true)}>
                <IconFileImport size={14} /> Import Fathom
              </button>
              <button className="btn btn-p btn-sm" onClick={() => openNew('upcoming')}>
                <IconPlus size={14} /> New task
              </button>
            </div>
          </div>

          <div className="tabs task-tabs">
            <button className={`tab${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>
              All tasks
            </button>
            <button className={`tab${tab === 'mine' ? ' on' : ''}`} onClick={() => setTab('mine')}>
              My tasks
            </button>
            <button className={`tab${tab === 'punch' ? ' on' : ''}`} onClick={() => setTab('punch')}>
              Punch list
            </button>
          </div>

          <div className="filters" style={{ marginBottom: 14, alignItems: 'center' }}>
            <select
              className="fi"
              style={{ width: 'auto' }}
              value={activeViewId}
              onChange={(e) => {
                const v = views.find((v) => v.id === e.target.value);
                if (v) applyView(v);
                else setActiveViewId('');
              }}
            >
              <option value="">Saved views…</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowSaveViewModal(true)}>
              <IconBookmark size={13} /> Save view
            </button>
            {activeViewId && (
              <button className="btn btn-sm btn-ghost" onClick={deleteActiveView}>
                <IconTrash size={13} /> Delete view
              </button>
            )}
            <select className="fi" style={{ width: 'auto', marginLeft: 'auto' }} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="">All assignees</option>
              {assigneeOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select className="fi" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="upcoming">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="delayed">Delayed / Blocked</option>
              <option value="urgent_today">Extremely Important / Urgent — Must Be Done Today</option>
              <option value="complete">Done</option>
            </select>
          </div>

          <div className="metrics">
            <div className="metric">
              <div className="m-label">Total tasks</div>
              <div className="m-val">{total}</div>
            </div>
            <div className="metric">
              <div className="m-label">In progress</div>
              <div className="m-val" style={{ color: 'var(--amber)' }}>
                {inProgress}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Delayed / blocked</div>
              <div className="m-val" style={{ color: delayed ? 'var(--red)' : undefined }}>
                {delayed}
              </div>
            </div>
            <div className="metric">
              <div className="m-label">Completed this week</div>
              <div className="m-val" style={{ color: 'var(--green)' }}>
                {completedThisWeek}
              </div>
            </div>
          </div>

          {tasks === null ? (
            <div className="card" style={{ padding: 4 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < 5 ? '1px solid var(--border)' : undefined }}>
                  <Skeleton width={16} height={16} style={{ borderRadius: '50%', flexShrink: 0 }} />
                  <Skeleton width="40%" height={13} />
                  <Skeleton width={70} height={12} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          ) : view === 'kanban' ? (
            <KanbanBoard tasks={filtered} onTaskClick={openEdit} onAddTask={openNew} onChanged={load} filtersActive={filtersActive} />
          ) : view === 'table' ? (
            <TableView tasks={filtered} onTaskClick={openEdit} groupBy={groupBy} onGroupByChange={setGroupBy} onChanged={load} />
          ) : isMobile ? (
            // Timeline is a Gantt-style view, inherently wide -- rather than
            // force-fitting it into a phone screen, point back to Board/Table.
            <DesktopOnlyNotice label="Timeline" />
          ) : (
            <TimelineView tasks={filtered} onTaskClick={openEdit} />
          )}
        </div>
      </div>

      {showModal && (
        <NewTaskModal
          defaultStatus={defaultStatus}
          defaultProjectId={projectFilter || undefined}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            toast('Task created');
            load();
          }}
        />
      )}

      {showFathomImport && (
        <FathomImportModal onClose={() => setShowFathomImport(false)} onImported={load} />
      )}

      {detailTask && (
        <TaskDetailDrawer
          task={detailTask}
          allTasks={tasks || []}
          onClose={() => setDetailTask(undefined)}
          onChanged={load}
          onSaved={() => {
            setDetailTask(undefined);
            toast('Task updated');
            load();
          }}
          onDeleted={() => {
            setDetailTask(undefined);
            toast('Task deleted');
            load();
          }}
        />
      )}

      {showSaveViewModal && (
        <Modal title="Save view" onClose={() => setShowSaveViewModal(false)}>
          <div className="fg">
            <label className="fl">Name</label>
            <input
              className="fi"
              autoFocus
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveCurrentView();
                }
              }}
              placeholder="Shannon's board"
            />
          </div>
          <div className="ma">
            <button type="button" className="btn" onClick={() => setShowSaveViewModal(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-p" onClick={saveCurrentView} disabled={!newViewName.trim()}>
              Save view
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
