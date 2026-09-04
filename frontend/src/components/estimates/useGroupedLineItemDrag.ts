import { useMemo, useRef, useState } from 'react';
import {
  pointerWithin,
  closestCorners,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDndSensors } from '../../hooks/useDndSensors';

const BUCKET_LABEL: Record<string, string> = { pm_fee: 'PM Fee', construction: 'Construction', allowance: 'Allowance' };

export interface GroupableLineItem {
  id: string;
  group_name?: string | null;
  bucket: string;
  sort_order: number;
}

export function groupKeyForItem(item: GroupableLineItem): string {
  return item.group_name || BUCKET_LABEL[item.bucket] || 'Ungrouped';
}

// Shared drag engine behind both the real Estimate worksheet and the
// Estimate Template worksheet -- they render the exact same LineItemGroupCard
// shape against two different PATCH endpoints, so the drag mechanics (a
// group-of-groups drag layered over a group-of-items drag, sharing one
// DndContext so an item can cross from one group's table into another) only
// need writing once. This hook now also OWNS the grouping itself (groups/
// groupKeys), not just the drag mechanics -- both worksheet pages used to
// each keep their own local BUCKET_LABEL/grouping-loop copy that could
// silently drift from what actually drives drag behavior; consuming the
// hook's own grouping closes that gap, and gives both pages the same
// "don't let a group disappear out from under you mid-drag" fix for free
// (see phantomGroups below).
//
// Two drag "kinds" share one DndContext (a cross-group item drop needs every
// group's items visible to the same context -- the old per-group DndContext
// this replaced couldn't do that): group cards (id `group:${key}`, dragged by
// their header handle) and item rows (raw item id, dragged by their row
// handle). `active.data.current.type` tells them apart in every handler
// below, and the collision detector below is scoped to keep a dragged group
// from ever "colliding" with an item row or vice versa.
export function useGroupedLineItemDrag<T extends GroupableLineItem>({
  items,
  setItems,
  searchActive,
  patchItem,
  onSaveError,
  onSettled,
}: {
  items: T[];
  setItems: (updater: (prev: T[]) => T[]) => void;
  // True while a search filter is hiding some rows/groups -- reordering (or
  // moving an item across groups) against a partial view would corrupt
  // sort_order for whatever's hidden, so both drag kinds are disabled.
  searchActive: boolean;
  patchItem: (itemId: string, body: { sort_order?: number; group_name?: string; bucket?: string }) => Promise<unknown>;
  onSaveError: (message: string) => void;
  onSettled: () => void;
}) {
  const snapshotRef = useRef<T[] | null>(null);
  // Every group that existed at the moment a drag started, in their
  // on-screen order -- kept visible (as an empty group, if it comes to
  // that) for the rest of THAT drag even if onDragOver's live preview
  // empties it by moving its last item elsewhere. A group that's still
  // genuinely empty once the drag actually ends drops out again on the
  // next render (this only pins it DURING an active drag, not permanently
  // -- there's no backend concept of a named-but-empty group to persist
  // one beyond that).
  const [phantomGroups, setPhantomGroups] = useState<string[]>([]);

  const { groups, groupKeys } = useMemo(() => {
    const g: Record<string, T[]> = {};
    const order: string[] = [];
    for (const key of phantomGroups) {
      if (!(key in g)) {
        g[key] = [];
        order.push(key);
      }
    }
    for (const item of items) {
      const k = groupKeyForItem(item);
      if (!(k in g)) {
        g[k] = [];
        order.push(k);
      }
      g[k].push(item);
    }
    return { groups: g, groupKeys: order };
  }, [items, phantomGroups]);

  const sensors = useDndSensors();

  const collisionDetection: CollisionDetection = (args) => {
    const activeType = args.active.data.current?.type;
    const filtered = {
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const isGroupContainer = typeof c.id === 'string' && c.id.startsWith('group:');
        return activeType === 'group' ? isGroupContainer : !isGroupContainer;
      }),
    };
    const pointerCollisions = pointerWithin(filtered);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(filtered);
  };

  function onDragStart(_event: DragStartEvent) {
    snapshotRef.current = items;
    setPhantomGroups(groupKeys);
  }

  // Live cross-group preview: as soon as an item is dragged over a DIFFERENT
  // group than the one it started in, move it there right away (appended to
  // the end of that group's block, same "don't guess a precise slot on a
  // cross-container move" call KanbanBoard's own handleDragOver already
  // makes) so the item visually leaves its old group and appears in the new
  // one while still dragging. A further drag within the new group, before
  // release, is handled by onDragEnd's precise same-group reorder below.
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== 'item' || searchActive) return;
    const activeItem = items.find((i) => i.id === active.id);
    if (!activeItem) return;
    const activeGroup = groupKeyForItem(activeItem);
    let overGroup: string | undefined;
    if (typeof over.id === 'string' && over.id.startsWith('items:')) {
      overGroup = over.id.slice('items:'.length);
    } else {
      const overItem = items.find((i) => i.id === over.id);
      overGroup = overItem ? groupKeyForItem(overItem) : undefined;
    }
    if (!overGroup || overGroup === activeGroup) return;
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === active.id);
      if (idx === -1) return prev;
      const without = prev.filter((i) => i.id !== active.id);
      // A group's bucket (pm_fee / construction / allowance) is what
      // `_recalc_estimate_totals` sums by on the server -- if a dragged item
      // kept its OLD bucket while displaying under a group whose other items
      // are a different bucket, its price would silently keep counting
      // toward the wrong total (e.g. a PM Fee item dragged into a
      // Construction group still counting as pm_fee_total). Infer the
      // destination group's bucket from any item already in it; an empty
      // destination group has no bucket to infer, so the item keeps its own.
      const destExample = without.find((i) => groupKeyForItem(i) === overGroup);
      const moved = { ...prev[idx], group_name: overGroup, ...(destExample ? { bucket: destExample.bucket } : {}) } as T;
      let insertAt = without.length;
      for (let i = without.length - 1; i >= 0; i--) {
        if (groupKeyForItem(without[i]) === overGroup) {
          insertAt = i + 1;
          break;
        }
      }
      return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    });
  }

  async function persist(finalItems: T[], rollback: T[] | null) {
    const byId = new Map((rollback || []).map((i) => [i.id, i]));
    const changed = finalItems
      .map((item, i) => {
        const prev = byId.get(item.id);
        const sortChanged = !prev || prev.sort_order !== i;
        const groupChanged = !prev || (prev.group_name || null) !== (item.group_name || null);
        const bucketChanged = !prev || prev.bucket !== item.bucket;
        return {
          id: item.id,
          sort_order: i,
          group_name: item.group_name || undefined,
          bucket: item.bucket,
          sortChanged,
          groupChanged,
          bucketChanged,
        };
      })
      .filter((c) => c.sortChanged || c.groupChanged || c.bucketChanged);
    if (!changed.length) return;
    try {
      await Promise.all(
        changed.map((c) =>
          patchItem(c.id, {
            ...(c.sortChanged ? { sort_order: c.sort_order } : {}),
            ...(c.groupChanged ? { group_name: c.group_name } : {}),
            ...(c.bucketChanged ? { bucket: c.bucket } : {}),
          })
        )
      );
    } catch (e) {
      if (rollback) setItems(() => rollback);
      onSaveError(e instanceof Error ? e.message : 'Failed to save the new order');
    } finally {
      onSettled();
    }
  }

  // Escape (or a programmatic cancelDrag()) fires onDragCancel, NOT
  // onDragEnd -- dnd-kit treats them as genuinely different outcomes. A
  // drag cancelled this way must roll back exactly like onDragEnd's own
  // "dropped on nothing" branch below, or an Escape-cancelled cross-group
  // move would leave the item stranded in its live-preview group with
  // nothing persisted, same bug as the !over case but through a path
  // onDragEnd never even sees.
  function onDragCancel() {
    const rollback = snapshotRef.current;
    snapshotRef.current = null;
    if (rollback) setItems(() => rollback);
    setPhantomGroups([]);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const rollback = snapshotRef.current;
    snapshotRef.current = null;
    if (!over) {
      // A drop with no valid target (released past the table edge, over the
      // search box) must roll back -- onDragOver may have already relocated
      // an item into a different group in local state (a real mutation, not
      // just a visual overlay), and leaving that in place with nothing
      // persisted server-side meant the item sat visibly in the wrong group
      // until the next reload silently snapped it back.
      if (rollback) setItems(() => rollback);
      setPhantomGroups([]);
      return;
    }

    if (active.data.current?.type === 'group') {
      if (searchActive) {
        setPhantomGroups([]);
        return;
      }
      const activeKey = typeof active.id === 'string' && active.id.startsWith('group:') ? active.id.slice('group:'.length) : null;
      const overKey = typeof over.id === 'string' && over.id.startsWith('group:') ? over.id.slice('group:'.length) : null;
      if (!activeKey || !overKey || activeKey === overKey) {
        setPhantomGroups([]);
        return;
      }
      const oldIdx = groupKeys.indexOf(activeKey);
      const newIdx = groupKeys.indexOf(overKey);
      setPhantomGroups([]);
      if (oldIdx === -1 || newIdx === -1) return;
      const reorderedKeys = arrayMove(groupKeys, oldIdx, newIdx);
      const flattened: T[] = [];
      for (const k of reorderedKeys) flattened.push(...groups[k]);
      setItems(() => flattened);
      persist(flattened, rollback);
      return;
    }

    // Item drag.
    if (searchActive) {
      if (rollback) setItems(() => rollback);
      setPhantomGroups([]);
      return;
    }
    let finalItems = items;
    // A drop directly on another item, still within the same group, gets a
    // precise arrayMove reorder (the cross-group case above already
    // relocated the item during onDragOver -- this only fires when the drop
    // target is a sibling in whatever group the item is currently in).
    if (typeof over.id === 'string' && !over.id.startsWith('items:') && over.id !== active.id) {
      const activeItem = items.find((i) => i.id === active.id);
      const overItem = items.find((i) => i.id === over.id);
      if (activeItem && overItem && groupKeyForItem(activeItem) === groupKeyForItem(overItem)) {
        const groupKey = groupKeyForItem(activeItem);
        const groupIds = items.filter((i) => groupKeyForItem(i) === groupKey).map((i) => i.id);
        const oldIdx = groupIds.indexOf(active.id as string);
        const newIdx = groupIds.indexOf(over.id as string);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          const reorderedIds = arrayMove(groupIds, oldIdx, newIdx);
          const byId = new Map(items.map((i) => [i.id, i]));
          const reordered = reorderedIds.map((gid) => byId.get(gid)!);
          let gi = 0;
          finalItems = items.map((i) => (groupKeyForItem(i) === groupKey ? reordered[gi++] : i));
          setItems(() => finalItems);
        }
      }
    }
    setPhantomGroups([]);
    persist(finalItems, rollback);
  }

  return { sensors, collisionDetection, onDragStart, onDragOver, onDragEnd, onDragCancel, groups, groupKeys };
}
