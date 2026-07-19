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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !widgets) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    setWidgets(arrayMove(widgets, oldIndex, newIndex));
  }

  function toggleVisible(id: string) {
    setWidgets((prev) => prev && prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }

  function addWidget(id: string) {
    setWidgets((prev) => (prev ? [...prev, { id, visible: true }] : prev));
  }

  async function handleSave() {
    if (!widgets) return;
    setSaving(true);
    try {
      const body: { user_id?: string; widgets: WidgetItem[] } = { widgets };
      if (viewingUserId !== user?.id) body.user_id = viewingUserId;
      await api.put('/dashboard/layout', body);
      toast('Dashboard saved');
      setEditMode(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save layout', true);
    } finally {
      setSaving(false);
    }
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
              <button className="btn btn-sm" onClick={() => setEditMode(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-p btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {!data || !widgets ? (
        <div className="empty">
          <div className="empty-t">Loading…</div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {widgets.map((w) => {
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
