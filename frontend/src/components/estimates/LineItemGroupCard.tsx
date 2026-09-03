import { useDroppable } from '@dnd-kit/core';
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

// Every item row's sortable id is shared across ALL groups' tables in one
// DndContext (lifted up to EstimateWorksheet.tsx) so an item can be dropped
// into a different group, not just reordered within its own -- `data.type`
// lets the parent's single onDragEnd tell an item drag apart from a group
// drag without needing two separate DndContexts (which can't interoperate
// for a cross-container drop anyway).
function SortableLineItemRow<T extends LineItemLike>({
  item,
  groupKey,
  hasDays,
  dragDisabled,
  onClick,
}: {
  item: T;
  groupKey: string;
  hasDays: boolean;
  dragDisabled: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'item', groupKey },
    // A search filter can show a subset of a group's real items -- dragging
    // within that filtered view would reorder against an incomplete group
    // and corrupt sort_order for the rows currently hidden by the filter.
    // Disabling the drag handle here (grip greyed out, no listeners
    // attached) rather than just hoping it isn't misused mirrors the same
    // "filters disable drag" rule already established on the Task Board.
    disabled: dragDisabled,
  });
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
          {...(dragDisabled ? {} : attributes)}
          {...(dragDisabled ? {} : listeners)}
          style={{
            display: 'flex',
            cursor: dragDisabled ? 'not-allowed' : 'grab',
            color: dragDisabled ? 'var(--border-md)' : 'var(--t3)',
            touchAction: 'none',
          }}
          title={dragDisabled ? 'Clear the search to reorder items' : 'Drag to reorder, or drop into another group'}
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
  dragDisabled = false,
  onToggleCollapse,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onAddItem,
  onItemClick,
}: {
  groupKey: string;
  items: T[];
  hasDays: boolean;
  collapsed: boolean;
  editing: boolean;
  editingValue: string;
  // True while a search filter is active -- see SortableLineItemRow's own
  // comment for why dragging a filtered view is unsafe. Also disables the
  // group-level drag handle, since a filtered view can hide whole groups.
  dragDisabled?: boolean;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onAddItem: () => void;
  onItemClick: (item: T) => void;
}) {
  const subtotal = groupItems.reduce((s, i) => s + (i.owner_price || 0), 0);

  // The group card's own drag handle -- a sibling drag "kind" to the item
  // rows below, sharing the one DndContext EstimateWorksheet.tsx now owns.
  // `group:` prefix keeps this id namespace disjoint from raw item ids (real
  // uuids) and from the `items:` droppable id below, since dnd-kit requires
  // every id registered in one DndContext to be unique.
  const {
    attributes: groupAttributes,
    listeners: groupListeners,
    setNodeRef: setGroupNodeRef,
    transform: groupTransform,
    transition: groupTransition,
    isDragging: isGroupDragging,
  } = useSortable({
    id: `group:${groupKey}`,
    data: { type: 'group' },
    disabled: dragDisabled || editing,
  });

  // Drop target for moving an item into this group -- covers both an empty
  // group (nothing to drop ONTO otherwise) and dropping into the gap below
  // this group's last row.
  const { setNodeRef: setItemsDroppableRef } = useDroppable({ id: `items:${groupKey}` });

  return (
    <div
      ref={setGroupNodeRef}
      className="card"
      style={{
        padding: 16,
        marginBottom: 12,
        transform: CSS.Transform.toString(groupTransform),
        transition: groupTransition,
        opacity: isGroupDragging ? 0.5 : 1,
      }}
    >
      {/* The item-drop target wraps the header row too, not just the
          (conditionally-rendered) table below -- a collapsed group has no
          table in the DOM at all, so binding the droppable ref only inside
          `{!collapsed && ...}` left collapsed groups with no drop target
          whatsoever. The always-visible header row gives a collapsed group
          a real, sized area to drop an item onto. */}
      <div ref={setItemsDroppableRef}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
          <button
            type="button"
            className="btn-reset"
            {...(dragDisabled || editing ? {} : groupAttributes)}
            {...(dragDisabled || editing ? {} : groupListeners)}
            style={{
              display: 'flex',
              cursor: dragDisabled || editing ? 'not-allowed' : 'grab',
              color: dragDisabled || editing ? 'var(--border-md)' : 'var(--t3)',
              touchAction: 'none',
            }}
            title={dragDisabled ? 'Clear the search to reorder groups' : 'Drag to reorder this group'}
            onClick={(e) => e.stopPropagation()}
          >
            <IconGripVertical size={14} />
          </button>
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
          <table className="tbl tbl-sticky-head">
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
            <SortableContext items={groupItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {groupItems.length === 0 ? (
                  <tr>
                    <td colSpan={hasDays ? 8 : 7} style={{ padding: '10px 8px', fontSize: 12, color: 'var(--t3)' }}>
                      Drop an item here to move it into this group.
                    </td>
                  </tr>
                ) : (
                  groupItems.map((item) => (
                    <SortableLineItemRow
                      key={item.id}
                      item={item}
                      groupKey={groupKey}
                      hasDays={hasDays}
                      dragDisabled={dragDisabled}
                      onClick={() => onItemClick(item)}
                    />
                  ))
                )}
              </tbody>
            </SortableContext>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
