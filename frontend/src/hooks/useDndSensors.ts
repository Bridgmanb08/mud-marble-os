import { PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

// Shared dnd-kit sensor tuning, used by every drag-and-drop surface in this
// app (the Task Board's KanbanBoard.tsx, the estimate worksheet's
// useGroupedLineItemDrag.ts) -- was two byte-identical copies that could
// silently drift apart if one got tuned and the other forgotten. Pointer
// distance:5 avoids hijacking an ordinary click; touch delay:150/tolerance:8
// distinguishes a scroll gesture from a drag on a touchscreen; keyboard
// support comes from dnd-kit/sortable's own coordinate getter.
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}
