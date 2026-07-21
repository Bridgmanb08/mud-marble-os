import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { Project, Task } from '../../types';

const STATUS_COLOR: Record<string, string> = {
  upcoming: 'var(--border-md)',
  in_progress: 'var(--amber)',
  delayed: 'var(--red)',
  blocked: 'var(--red)',
  complete: 'var(--green)',
};

const DAY_MS = 86400000;
const WEEKS_PER_PAGE = 8;
const SCROLL_TRIGGER_PX = 400;
const MAX_LANES = 5;
const BAR_HEIGHT = 20;
const BAR_GAP = 3;
const ROW_TOP_PAD = 22;

type DragMode = 'create' | 'move' | 'resize-start' | 'resize-end';

interface DragState {
  mode: DragMode;
  taskId?: string;
  anchorKey: string;
  currentKey: string;
  origStart?: string;
  origEnd?: string;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sundayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function weeksFrom(start: Date, count: number, direction: 1 | -1): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(start, direction * 7 * (direction === 1 ? i : i + 1)));
  }
  return direction === 1 ? out : out.reverse();
}

interface TaskSpan {
  task: Task;
  startKey: string;
  endKey: string;
}

function taskSpan(t: Task): TaskSpan | null {
  const rawStart = t.scheduled_start || t.scheduled_end;
  const rawEnd = t.scheduled_end || t.scheduled_start;
  if (!rawStart || !rawEnd) return null;
  // Parse as a local calendar date, not via `new Date(isoString)` -- a
  // date-only ISO string like "2026-07-20" parses as UTC midnight, which
  // renders as the 19th in any timezone behind UTC.
  const s = keyToDate(rawStart.slice(0, 10));
  const e = keyToDate(rawEnd.slice(0, 10));
  if (e < s) return { task: t, startKey: dateKey(e), endKey: dateKey(s) };
  return { task: t, startKey: dateKey(s), endKey: dateKey(e) };
}

/** Greedy lane assignment so overlapping tasks stack instead of collide. */
function assignLanes(spans: TaskSpan[]): Map<string, number> {
  const sorted = [...spans].sort((a, b) => a.startKey.localeCompare(b.startKey));
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();
  for (const s of sorted) {
    let lane = laneEnds.findIndex((end) => end < s.startKey);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.endKey);
    } else {
      laneEnds[lane] = s.endKey;
    }
    laneOf.set(s.task.id, lane);
  }
  return laneOf;
}

function fmtRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export function WeekScrollCalendar({
  tasks,
  projectId,
  projects,
  colorForTask,
  onOpenTask,
  onChanged,
}: {
  tasks: Task[];
  projectId?: string;
  /** Pass the full project list to render a project picker in the quick-add
   * popover -- only needed when `projectId` isn't fixed (a multi-project/master
   * calendar), since a new task always needs to know which job it belongs to. */
  projects?: Project[];
  /** Overrides the default status-based bar color, e.g. to color by job on a
   * multi-project calendar where distinguishing jobs matters more than status. */
  colorForTask?: (task: Task) => string;
  onOpenTask: (id: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingPrependHeight = useRef<number | null>(null);
  const dragMoved = useRef(false);

  const [weekStarts, setWeekStarts] = useState<Date[]>(() => {
    const thisWeek = sundayOf(new Date());
    return [...weeksFrom(thisWeek, 4, -1), thisWeek, ...weeksFrom(addDays(thisWeek, 7), WEEKS_PER_PAGE - 1, 1)];
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ startKey: string; endKey: string; title: string; projectId: string } | null>(null);

  useLayoutEffect(() => {
    if (pendingPrependHeight.current !== null && scrollRef.current) {
      const delta = scrollRef.current.scrollHeight - pendingPrependHeight.current;
      scrollRef.current.scrollTop += delta;
      pendingPrependHeight.current = null;
    }
  }, [weekStarts]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < SCROLL_TRIGGER_PX) {
      pendingPrependHeight.current = el.scrollHeight;
      setWeekStarts((prev) => [...weeksFrom(prev[0], WEEKS_PER_PAGE, -1), ...prev]);
    } else if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_TRIGGER_PX) {
      setWeekStarts((prev) => [...prev, ...weeksFrom(addDays(prev[prev.length - 1], 7), WEEKS_PER_PAGE, 1)]);
    }
  }

  function scrollToToday() {
    const rows = scrollRef.current?.querySelectorAll('[data-week-row]');
    if (!rows) return;
    const todaySunday = dateKey(sundayOf(new Date()));
    for (const row of rows) {
      if (row.getAttribute('data-week-row') === todaySunday) {
        row.scrollIntoView({ block: 'center' });
        return;
      }
    }
  }

  useEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spans = useMemo(() => tasks.map(taskSpan).filter((s): s is TaskSpan => s !== null), [tasks]);
  const todayKey = dateKey(new Date());

  // Geometry-based hit-testing (not elementFromPoint) -- once a drag starts, the
  // dragged/ghost bar sits visually on top of the day cells, so elementFromPoint
  // would just keep returning the bar itself instead of the date underneath it.
  function keyUnderPoint(x: number, y: number): string | null {
    const rows = scrollRef.current?.querySelectorAll<HTMLElement>('[data-week-row]');
    if (!rows) return null;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) continue;
      const gridEl = row.querySelector<HTMLElement>('.wcal-grid') || row;
      const gridRect = gridEl.getBoundingClientRect();
      if (x < gridRect.left || x > gridRect.right) return null;
      const col = Math.max(0, Math.min(6, Math.floor((x - gridRect.left) / (gridRect.width / 7))));
      return dateKey(addDays(keyToDate(row.getAttribute('data-week-row')!), col));
    }
    return null;
  }

  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      const key = keyUnderPoint(e.clientX, e.clientY);
      if (!key) return;
      dragMoved.current = true;
      setDrag((prev) => (prev ? { ...prev, currentKey: key } : prev));
    }

    async function onUp(e: PointerEvent) {
      const finalKey = keyUnderPoint(e.clientX, e.clientY) || drag!.currentKey;
      const finished: DragState = { ...drag!, currentKey: finalKey };
      setDrag(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      if (finished.mode === 'create') {
        const defaultProjectId = projectId || (projects?.length === 1 ? projects[0].id : '');
        if (!dragMoved.current) {
          setQuickAdd({ startKey: finished.anchorKey, endKey: finished.anchorKey, title: '', projectId: defaultProjectId });
        } else {
          const lo = finished.anchorKey <= finished.currentKey ? finished.anchorKey : finished.currentKey;
          const hi = finished.anchorKey <= finished.currentKey ? finished.currentKey : finished.anchorKey;
          setQuickAdd({ startKey: lo, endKey: hi, title: '', projectId: defaultProjectId });
        }
        return;
      }

      if (!dragMoved.current) return; // plain click on a task bar -- let onClick open the drawer
      const task = tasks.find((t) => t.id === finished.taskId);
      if (!task) return;

      const deltaDays = Math.round((keyToDate(finished.currentKey).getTime() - keyToDate(finished.anchorKey).getTime()) / DAY_MS);
      let newStart = finished.origStart!;
      let newEnd = finished.origEnd!;
      if (finished.mode === 'move') {
        newStart = dateKey(addDays(keyToDate(finished.origStart!), deltaDays));
        newEnd = dateKey(addDays(keyToDate(finished.origEnd!), deltaDays));
      } else if (finished.mode === 'resize-start') {
        const candidate = keyToDate(finished.origStart!).getTime() + deltaDays * DAY_MS;
        newStart = candidate > keyToDate(finished.origEnd!).getTime() ? finished.origEnd! : dateKey(new Date(candidate));
      } else if (finished.mode === 'resize-end') {
        const candidate = keyToDate(finished.origEnd!).getTime() + deltaDays * DAY_MS;
        newEnd = candidate < keyToDate(finished.origStart!).getTime() ? finished.origStart! : dateKey(new Date(candidate));
      }

      try {
        await api.patch(`/tasks/${task.id}`, {
          scheduled_start: newStart,
          scheduled_end: newEnd,
          expected_version: task.version,
        });
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Failed to reschedule task', true);
      } finally {
        onChanged();
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function startDrag(mode: DragMode, anchorKey: string, extra?: Partial<DragState>) {
    dragMoved.current = false;
    setDrag({ mode, anchorKey, currentKey: anchorKey, ...extra });
  }

  async function submitQuickAdd() {
    if (!quickAdd) return;
    const title = quickAdd.title.trim();
    if (!title) {
      setQuickAdd(null);
      return;
    }
    try {
      await api.post('/tasks', {
        project_id: projectId || quickAdd.projectId || null,
        title,
        scheduled_start: quickAdd.startKey,
        scheduled_end: quickAdd.endKey,
      });
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create task', true);
    } finally {
      setQuickAdd(null);
    }
  }

  const dragRangeKeys: [string, string] | null = drag
    ? [drag.anchorKey <= drag.currentKey ? drag.anchorKey : drag.currentKey, drag.anchorKey <= drag.currentKey ? drag.currentKey : drag.anchorKey]
    : null;

  return (
    <div className="wcal">
      <div className="wcal-hd">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="wcal-hd-cell">
            {d}
          </div>
        ))}
      </div>
      <div className="wcal-scroll" ref={scrollRef} onScroll={handleScroll}>
        {weekStarts.map((weekStart) => {
          const weekStartKey = dateKey(weekStart);
          const weekEndKey = dateKey(addDays(weekStart, 6));
          const weekSpans = spans.filter((s) => s.startKey <= weekEndKey && s.endKey >= weekStartKey);
          const lanes = assignLanes(weekSpans);
          const maxLane = weekSpans.reduce((m, s) => Math.max(m, (lanes.get(s.task.id) || 0) + 1), 0);
          const visibleLanes = Math.min(maxLane, MAX_LANES);
          const rowHeight = ROW_TOP_PAD + Math.max(1, visibleLanes) * (BAR_HEIGHT + BAR_GAP) + 8;
          const overflowByDay = new Map<string, number>();
          if (maxLane > MAX_LANES) {
            for (const s of weekSpans) {
              if ((lanes.get(s.task.id) || 0) < MAX_LANES) continue;
              for (let k = s.startKey; k <= s.endKey && k <= weekEndKey; k = dateKey(addDays(keyToDate(k), 1))) {
                if (k < weekStartKey) continue;
                overflowByDay.set(k, (overflowByDay.get(k) || 0) + 1);
              }
            }
          }

          return (
            <div key={weekStartKey} data-week-row={weekStartKey} className="wcal-week" style={{ minHeight: rowHeight }}>
              <div className="wcal-week-label">{fmtRange(weekStart)}</div>
              <div className="wcal-grid" style={{ minHeight: rowHeight }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = addDays(weekStart, i);
                  const key = dateKey(day);
                  const inRange = dragRangeKeys && drag?.mode === 'create' && key >= dragRangeKeys[0] && key <= dragRangeKeys[1];
                  return (
                    <div
                      key={key}
                      data-date={key}
                      className={`wcal-day${key === todayKey ? ' today' : ''}${inRange ? ' drag-range' : ''}`}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest('.wcal-bar, .wcal-handle')) return;
                        startDrag('create', key);
                      }}
                    >
                      <div className="wcal-daynum">{day.getDate()}</div>
                      {overflowByDay.get(key) ? <div className="wcal-more">+{overflowByDay.get(key)} more</div> : null}
                    </div>
                  );
                })}
                {weekSpans.map((s) => {
                  const lane = lanes.get(s.task.id) || 0;
                  if (lane >= MAX_LANES) return null;
                  const clipStart = s.startKey < weekStartKey ? weekStartKey : s.startKey;
                  const clipEnd = s.endKey > weekEndKey ? weekEndKey : s.endKey;
                  const colStart = Math.round((keyToDate(clipStart).getTime() - weekStart.getTime()) / DAY_MS) + 1;
                  const colEnd = Math.round((keyToDate(clipEnd).getTime() - weekStart.getTime()) / DAY_MS) + 2;
                  const isDraggingThis = drag?.taskId === s.task.id;
                  let previewStart = s.startKey;
                  let previewEnd = s.endKey;
                  if (isDraggingThis && dragMoved.current) {
                    const deltaDays = Math.round((keyToDate(drag!.currentKey).getTime() - keyToDate(drag!.anchorKey).getTime()) / DAY_MS);
                    if (drag!.mode === 'move') {
                      previewStart = dateKey(addDays(keyToDate(drag!.origStart!), deltaDays));
                      previewEnd = dateKey(addDays(keyToDate(drag!.origEnd!), deltaDays));
                    } else if (drag!.mode === 'resize-start') {
                      previewStart = dateKey(addDays(keyToDate(drag!.origStart!), deltaDays));
                      if (previewStart > drag!.origEnd!) previewStart = drag!.origEnd!;
                    } else if (drag!.mode === 'resize-end') {
                      previewEnd = dateKey(addDays(keyToDate(drag!.origEnd!), deltaDays));
                      if (previewEnd < drag!.origStart!) previewEnd = drag!.origStart!;
                    }
                  }
                  const previewClipStart = previewStart < weekStartKey ? weekStartKey : previewStart;
                  const previewClipEnd = previewEnd > weekEndKey ? weekEndKey : previewEnd;
                  const previewColStart = Math.round((keyToDate(previewClipStart).getTime() - weekStart.getTime()) / DAY_MS) + 1;
                  const previewColEnd = Math.round((keyToDate(previewClipEnd).getTime() - weekStart.getTime()) / DAY_MS) + 2;
                  const showPreview = isDraggingThis && dragMoved.current && previewEnd >= weekStartKey && previewStart <= weekEndKey;

                  return (
                    <div
                      key={s.task.id}
                      className={`wcal-bar${s.task.status === 'complete' ? ' done' : ''}${isDraggingThis && dragMoved.current ? ' ghosting' : ''}`}
                      style={{
                        gridColumn: `${showPreview ? previewColStart : colStart} / ${showPreview ? previewColEnd : colEnd}`,
                        top: ROW_TOP_PAD + lane * (BAR_HEIGHT + BAR_GAP),
                        height: BAR_HEIGHT,
                        background: colorForTask ? colorForTask(s.task) : STATUS_COLOR[s.task.status] || 'var(--border-md)',
                      }}
                      title={s.task.title}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const anchorKey = keyUnderPoint(e.clientX, e.clientY) || s.startKey;
                        startDrag('move', anchorKey, { taskId: s.task.id, origStart: s.startKey, origEnd: s.endKey });
                      }}
                      onClick={() => {
                        if (!dragMoved.current) onOpenTask(s.task.id);
                      }}
                    >
                      {s.startKey >= weekStartKey && (
                        <span
                          className="wcal-handle wcal-handle-l"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const anchorKey = keyUnderPoint(e.clientX, e.clientY) || s.startKey;
                            startDrag('resize-start', anchorKey, { taskId: s.task.id, origStart: s.startKey, origEnd: s.endKey });
                          }}
                        />
                      )}
                      {s.task.is_punch_list && <span className="wcal-punch">Punch</span>}
                      <span className="wcal-bar-title">{s.task.title}</span>
                      {s.endKey <= weekEndKey && (
                        <span
                          className="wcal-handle wcal-handle-r"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            const anchorKey = keyUnderPoint(e.clientX, e.clientY) || s.endKey;
                            startDrag('resize-end', anchorKey, { taskId: s.task.id, origStart: s.startKey, origEnd: s.endKey });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {quickAdd && (
        <div className="mo" onClick={(e) => e.target === e.currentTarget && setQuickAdd(null)}>
          <div className="mb" style={{ width: 340, padding: 18 }}>
            <div className="mt" style={{ marginBottom: 12, fontSize: 14 }}>
              New task &middot; {keyToDate(quickAdd.startKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {quickAdd.endKey !== quickAdd.startKey && ` – ${keyToDate(quickAdd.endKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </div>
            <input
              className="fi"
              autoFocus
              placeholder="Task title…"
              value={quickAdd.title}
              onChange={(e) => setQuickAdd({ ...quickAdd, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitQuickAdd();
                } else if (e.key === 'Escape') {
                  setQuickAdd(null);
                }
              }}
            />
            {!projectId && projects && (
              <select
                className="fi"
                style={{ marginTop: 8 }}
                value={quickAdd.projectId}
                onChange={(e) => setQuickAdd({ ...quickAdd, projectId: e.target.value })}
              >
                <option value="">— No job —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.replace(/\|.*/, '').trim()}
                  </option>
                ))}
              </select>
            )}
            <div className="ma">
              <button type="button" className="btn" onClick={() => setQuickAdd(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-p" onClick={submitQuickAdd} disabled={!quickAdd.title.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
