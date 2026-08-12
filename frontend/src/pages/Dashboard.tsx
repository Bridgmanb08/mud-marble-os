import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { IconSettings, IconPlus } from '@tabler/icons-react';
import { api } from '../api/client';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../auth/AuthContext';
import { WidgetShell } from '../components/dashboard/WidgetShell';
import { WIDGET_REGISTRY } from '../components/dashboard/widgetRegistry';
import { AddWidgetModal } from '../components/dashboard/AddWidgetModal';
import { CustomWidgetRenderer } from '../components/dashboard/widgets/CustomWidget';
import { Skeleton } from '../components/ui/Skeleton';
import type { DashboardSummary, DashboardLayout, UserSummary, WidgetItem, CustomWidget, WidgetId } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [viewingUserId, setViewingUserId] = useState<string>('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [widgets, setWidgets] = useState<WidgetItem[] | null>(null);
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!user) return;
    setViewingUserId(user.id);
    api.get<DashboardSummary>('/dashboard').then(setData).catch(() => toast('Failed to load dashboard', true));
    api
      .get<CustomWidget[]>('/dashboard/custom-widgets')
      .then(setCustomWidgets)
      .catch(() => {});
    if (user.is_admin) {
      api.get<UserSummary[]>('/users').then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!viewingUserId) return;
    setEditMode(false);
    const query = viewingUserId !== user?.id ? `?user_id=${viewingUserId}` : '';
    api
      .get<DashboardLayout>(`/dashboard/layout${query}`)
      .then((l) => setWidgets(l.widgets))
      .catch(() => toast('Failed to load dashboard layout', true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingUserId]);

  // Every mutation below persists immediately -- Shannon kept losing widgets
  // she'd added because she navigated away before hitting the old explicit
  // Save button. Auto-saving on each change means there's never an unsaved
  // edit sitting in memory to lose.
  async function persist(next: WidgetItem[]) {
    setSaving(true);
    try {
      const body: { user_id?: string; widgets: WidgetItem[] } = { widgets: next };
      if (viewingUserId !== user?.id) body.user_id = viewingUserId;
      await api.put('/dashboard/layout', body);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save dashboard changes', true);
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !widgets) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    const next = arrayMove(widgets, oldIndex, newIndex);
    setWidgets(next);
    persist(next);
  }

  // Mobile's tap-to-move alternative to drag-to-reorder -- swaps this widget
  // with its neighbor and persists through the exact same path as a drag.
  function moveWidget(id: string, direction: -1 | 1) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const index = prev.findIndex((w) => w.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = arrayMove(prev, index, target);
      persist(next);
      return next;
    });
  }

  function toggleVisible(id: string) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const next = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
      persist(next);
      return next;
    });
  }

  function addWidget(id: string) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const next = [...prev, { id, visible: true }];
      persist(next);
      return next;
    });
  }

  function removeWidget(id: string) {
    setWidgets((prev) => {
      if (!prev) return prev;
      const next = prev.filter((w) => w.id !== id);
      persist(next);
      return next;
    });
  }

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const viewingSelf = viewingUserId === user?.id;
  const viewingUserName = viewingSelf ? user?.name : users.find((u) => u.id === viewingUserId)?.name;
  const customWidgetById = new Map(customWidgets.map((w) => [`custom:${w.id}`, w]));

  return (
    <>
      <div className="ph">
        <div>
          <h1>{viewingSelf ? 'Good morning.' : `Viewing: ${viewingUserName || '…'}`}</h1>
          <p>{dateStr}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user?.is_admin && users.length > 0 && (
            <select
              className="fi"
              style={{ width: 'auto' }}
              value={viewingUserId}
              onChange={(e) => setViewingUserId(e.target.value)}
            >
              <option value={user.id}>Me ({user.name})</option>
              {users
                .filter((u) => u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          )}
          {!editMode ? (
            <button className="btn btn-sm" onClick={() => setEditMode(true)}>
              <IconSettings size={14} /> Customize dashboard
            </button>
          ) : (
            <>
              <button className="btn btn-sm" onClick={() => setShowAddWidget(true)}>
                <IconPlus size={14} /> Add widget
              </button>
              {saving && <span style={{ fontSize: 12, color: 'var(--t2)' }}>Saving…</span>}
              <button className="btn btn-p btn-sm" onClick={() => setEditMode(false)}>
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {!data || !widgets ? (
        <div className="dashboard-widgets">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: 18 }}>
              <Skeleton width={100} height={12} style={{ marginBottom: 14 }} />
              <Skeleton height={32} style={{ marginBottom: 8 }} />
              <Skeleton height={32} />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div className="dashboard-widgets">
              {widgets.map((w, i) => {
                const custom = w.id.startsWith('custom:') ? customWidgetById.get(w.id) : undefined;
                const def = custom ? undefined : WIDGET_REGISTRY[w.id as WidgetId];
                if (!custom && !def) return null;
                return (
                  <WidgetShell
                    key={w.id}
                    id={w.id}
                    title={custom ? custom.title : def!.title}
                    editMode={editMode}
                    visible={w.visible}
                    onToggleVisible={() => toggleVisible(w.id)}
                    onRemove={() => removeWidget(w.id)}
                    onMoveUp={() => moveWidget(w.id, -1)}
                    onMoveDown={() => moveWidget(w.id, 1)}
                    canMoveUp={i > 0}
                    canMoveDown={i < widgets.length - 1}
                    wide={custom ? true : def!.wide}
                  >
                    {custom ? <CustomWidgetRenderer spec={custom.spec} data={data} /> : (() => {
                      const Component = def!.Component;
                      return <Component data={data} />;
                    })()}
                  </WidgetShell>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddWidget && widgets && (
        <AddWidgetModal
          onClose={() => setShowAddWidget(false)}
          existingIds={widgets.map((w) => w.id)}
          customWidgets={customWidgets}
          onAddBuiltIn={(id) => addWidget(id)}
          onAddCustom={(id) => addWidget(`custom:${id}`)}
          onCustomWidgetCreated={(widget) => {
            setCustomWidgets((prev) => [widget, ...prev]);
            addWidget(`custom:${widget.id}`);
            toast('Widget created');
          }}
        />
      )}
    </>
  );
}
