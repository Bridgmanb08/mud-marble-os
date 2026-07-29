import { DndContext, type DragEndEvent, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconPlus, IconGripVertical, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { fmt } from '../../lib/format';

export interface LineItemLike {
  id: string;
  title: string;
  notes_external?: string | null;
  quantity: number;
  unit_cost: number;
  builder_cost: number;
  owner_price: number;
  estimated_days?: number | null;
  cost_codes?: { code: string; name: string } | null;
}

function SortableLineItemRow<T extends LineItemLike>({
  item,
  hasDays,
  onClick,
}: {
  item: T;
  hasDays: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <tr
      ref={setNodeRef}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        background: isDragging ? 'var(--surface)' : undefined,
      }}
    >
      <td onClick={(e) => e.stopPropagation()} style={{ width: 24 }}>
        <button
          type="button"
          className="btn-reset"
          {...attributes}
          {...listeners}
          style={{ display: 'flex', cursor: 'grab', color: 'var(--t3)', touchAction: 'none' }}
          title="Drag to reorder"
        >
          <IconGripVertical size={14} />
        </button>
      </td>
      <td className="sticky-col">
        <div style={{ fontWeight: 500 }}>{item.title}</div>
        {item.cost_codes && (
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
            {item.cost_codes.code} - {item.cost_codes.name}
          </div>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--t2)', maxWidth: 320 }}>{item.notes_external || '—'}</td>
      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.unit_cost)}</td>
      <td style={{ textAlign: 'right' }}>{fmt(item.builder_cost)}</td>
      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(item.owner_price)}</td>
      {hasDays && <td style={{ textAlign: 'right' }}>{item.estimated_days != null ? item.estimated_days : '—'}</td>}
    </tr>
  );
}

export function LineItemGroupCard<T extends LineItemLike>({
  groupKey,
  items: groupItems,
  hasDays,
  collapsed,
  editing,
  editingValue,
  itemSensors,
  onToggleCollapse,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onAddItem,
  onItemClick,
  onReorderItems,
}: {
  groupKey: string;
  items: T[];
  hasDays: boolean;
  collapsed: boolean;
  editing: boolean;
  editingValue: string;
  itemSensors: ReturnType<typeof useSensors>;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onAddItem: () => void;
  onItemClick: (item: T) => void;
  onReorderItems: (event: DragEndEvent) => void;
}) {
  const subtotal = groupItems.reduce((s, i) => s + (i.owner_price || 0), 0);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
        <button type="button" className="btn-reset" onClick={onToggleCollapse} style={{ display: 'flex', color: 'var(--t2)' }}>
          {collapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
        </button>
        {editing ? (
          <input
            className="fi"
            autoFocus
            value={editingValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{ maxWidth: 260 }}
          />
        ) : (
          <div className="ibt" style={{ margin: 0, border: 'none', padding: 0, cursor: 'text' }} onClick={onStartRename} title="Click to rename group">
            {groupKey}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          {groupItems.length} item{groupItems.length !== 1 ? 's' : ''} · {fmt(subtotal)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onAddItem}>
          <IconPlus size={13} /> Add item
        </button>
      </div>
      {!collapsed && (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 24 }} />
                <th className="sticky-col">Items</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit cost</th>
                <th style={{ textAlign: 'right' }}>Builder cost</th>
                <th style={{ textAlign: 'right' }}>Client price</th>
                {hasDays && <th style={{ textAlign: 'right' }}>Workdays</th>}
              </tr>
            </thead>
            <DndContext sensors={itemSensors} onDragEnd={onReorderItems}>
              <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {groupItems.map((item) => (
                    <SortableLineItemRow key={item.id} item={item} hasDays={hasDays} onClick={() => onItemClick(item)} />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}
    </div>
  );
}
