import { useEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import { mergeCustomPhases, projectPhaseLabel } from '../../lib/projectPhases';
import type { CustomPhase, Project, ProjectPhaseProgress } from '../../types';

function fmtShort(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A phase row's real Schedule-derived date range, compact enough to sit as
// small gray text under a ~76px-wide phase label. Per Brent's explicit
// choice, this is NOT a separately-typed target date -- it's exactly the
// earliest_start/latest_end the phase-progress endpoint already computes
// from real tasks tagged to that phase, so "editing" it just means editing
// those tasks (via the quick-add popover below, or the Schedule/Tasks tabs).
function phaseDateRange(earliestStart: string | null, latestEnd: string | null): string | null {
  if (!earliestStart && !latestEnd) return null;
  if (earliestStart && latestEnd && earliestStart !== latestEnd) {
    return `${fmtShort(earliestStart)} – ${fmtShort(latestEnd)}`;
  }
  return fmtShort(earliestStart || latestEnd!);
}

// The project Overview page's phase slider: current phase is set by hand
// (Shannon clicks a dot to mark where the job actually is -- see the
// project's own request: manual, not computed, since schedule data isn't
// reliably kept up to date enough to trust as the source of truth for
// "what phase are we in"). Per-phase alerts ARE computed from real
// Schedule tab data though: a red badge means a task tagged to that phase
// is overdue, an amber "+" bubble means NO scheduled task is tagged to
// that phase at all -- click it to add one right there, inline, without
// leaving this page. The small gray text under each label is that same
// real data's date range, not a separate manually-set target.
export function PhaseTracker({
  projectId,
  currentPhase,
  customPhases,
  onPhaseChange,
  onCustomPhasesChange,
}: {
  projectId: string;
  currentPhase: string | null;
  customPhases: CustomPhase[];
  onPhaseChange: (phase: string) => void;
  onCustomPhasesChange: (customPhases: CustomPhase[]) => void;
}) {
  const toast = useToast();
  const [progress, setProgress] = useState<ProjectPhaseProgress | null>(null);
  const [quickAddPhase, setQuickAddPhase] = useState<string | null>(null);
  const [qaTitle, setQaTitle] = useState('');
  const [qaStart, setQaStart] = useState('');
  const [qaEnd, setQaEnd] = useState('');
  const [qaSaving, setQaSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const [insertLabel, setInsertLabel] = useState('');
  const [insertSaving, setInsertSaving] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);

  const { keys: phaseKeys, labels: phaseLabels } = useMemo(() => mergeCustomPhases(customPhases), [customPhases]);
  const labelFor = (phase: string) => phaseLabels[phase] || projectPhaseLabel(phase);

  async function load() {
    try {
      setProgress(await api.get<ProjectPhaseProgress>(`/projects/${projectId}/phase-progress`));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load phase progress', true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!quickAddPhase) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setQuickAddPhase(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [quickAddPhase]);

  useEffect(() => {
    if (!insertAfter) return;
    function handleClickOutside(e: MouseEvent) {
      if (insertRef.current && !insertRef.current.contains(e.target as Node)) {
        setInsertAfter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [insertAfter]);

  async function setPhase(phase: string) {
    onPhaseChange(phase); // optimistic, parent owns the source of truth for display elsewhere on the page
    try {
      await api.patch(`/projects/${projectId}`, { current_phase: phase });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update phase', true);
    }
  }

  function openQuickAdd(phase: string) {
    setInsertAfter(null);
    setQuickAddPhase(phase);
    setQaTitle(`${labelFor(phase)} work`);
    setQaStart('');
    setQaEnd('');
  }

  async function submitQuickAdd() {
    if (!quickAddPhase || !qaTitle.trim()) return;
    setQaSaving(true);
    try {
      await api.post('/tasks', {
        project_id: projectId,
        title: qaTitle.trim(),
        construction_phase: quickAddPhase,
        status: 'upcoming',
        scheduled_start: qaStart || null,
        scheduled_end: qaEnd || null,
      });
      toast('Added to the schedule');
      setQuickAddPhase(null);
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add to schedule', true);
    } finally {
      setQaSaving(false);
    }
  }

  function openInsert(afterKey: string) {
    setQuickAddPhase(null);
    setInsertAfter(afterKey);
    setInsertLabel('');
  }

  async function submitInsert() {
    if (!insertAfter || !insertLabel.trim()) return;
    setInsertSaving(true);
    try {
      const updated = await api.post<Project>(`/projects/${projectId}/custom-phases`, {
        label: insertLabel.trim(),
        after: insertAfter,
      });
      onCustomPhasesChange(updated.custom_phases);
      toast(`Added "${insertLabel.trim()}" to the tracker`);
      setInsertAfter(null);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to add phase', true);
    } finally {
      setInsertSaving(false);
    }
  }

  const currentIndex = currentPhase ? phaseKeys.indexOf(currentPhase) : -1;
  const rowByPhase = new Map((progress?.phases || []).map((r) => [r.phase, r]));

  return (
    <div>
      <div className="phase-tracker-track">
        {phaseKeys.map((phase, i) => {
          const row = rowByPhase.get(phase);
          const isDone = currentIndex >= 0 && i < currentIndex;
          const isCurrent = phase === currentPhase;
          // A future phase with no schedule data yet isn't alarming on its
          // own -- only flag "go fill in the calendar" for the current
          // phase and anything already behind it, where you'd expect real
          // tasks to exist by now. "Complete" never needs its own tasks.
          const showMissing = row && row.task_count === 0 && currentIndex >= 0 && i <= currentIndex && phase !== 'complete';
          const dateRange = row ? phaseDateRange(row.earliest_start, row.latest_end) : null;
          return (
            <div key={phase} className={`phase-segment${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
              {i > 0 && (
                <button
                  type="button"
                  className="phase-insert-btn"
                  title={`Insert a custom phase between ${labelFor(phaseKeys[i - 1])} and ${labelFor(phase)}`}
                  onClick={() => openInsert(phaseKeys[i - 1])}
                >
                  <IconPlus size={9} />
                </button>
              )}
              {insertAfter === phaseKeys[i - 1] && (
                <div className="phase-quick-add" ref={insertRef} onClick={(e) => e.stopPropagation()} style={{ left: 0, transform: 'translateX(-50%)' }}>
                  <div className="fg">
                    <label className="fl">New phase name</label>
                    <input
                      className="fi"
                      autoFocus
                      value={insertLabel}
                      onChange={(e) => setInsertLabel(e.target.value)}
                      placeholder="e.g. Roof"
                      onKeyDown={(e) => e.key === 'Enter' && submitInsert()}
                    />
                  </div>
                  <div className="ma">
                    <button type="button" className="btn btn-sm" onClick={() => setInsertAfter(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-p btn-sm" onClick={submitInsert} disabled={insertSaving || !insertLabel.trim()}>
                      {insertSaving ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
              {row?.has_overdue && (
                <div className="phase-badge overdue" title={`A scheduled task for ${labelFor(phase)} is overdue`}>
                  <IconAlertTriangle size={9} />
                </div>
              )}
              {!row?.has_overdue && showMissing && (
                <button
                  type="button"
                  className="phase-badge missing"
                  title={`No schedule data for ${labelFor(phase)} yet -- click to add`}
                  onClick={() => openQuickAdd(phase)}
                >
                  <IconPlus size={10} />
                </button>
              )}
              <button
                type="button"
                className="phase-dot-btn"
                title={`Mark as current phase: ${labelFor(phase)}`}
                onClick={() => setPhase(phase)}
              />
              <div className="phase-label">{labelFor(phase)}</div>
              {dateRange && <div className="phase-dates">{dateRange}</div>}
              {quickAddPhase === phase && (
                <div className="phase-quick-add" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
                  <div className="fg">
                    <label className="fl">Title</label>
                    <input className="fi" value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} />
                  </div>
                  <div className="fg">
                    <label className="fl">Start</label>
                    <input className="fi" type="date" value={qaStart} onClick={openDatePicker} onChange={(e) => setQaStart(e.target.value)} />
                  </div>
                  <div className="fg">
                    <label className="fl">End</label>
                    <input className="fi" type="date" value={qaEnd} onClick={openDatePicker} onChange={(e) => setQaEnd(e.target.value)} />
                  </div>
                  <div className="ma">
                    <button type="button" className="btn btn-sm" onClick={() => setQuickAddPhase(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-p btn-sm" onClick={submitQuickAdd} disabled={qaSaving || !qaTitle.trim()}>
                      {qaSaving ? 'Adding…' : 'Add to schedule'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="phase-legend">
        <span>
          <span className="phase-legend-dot" style={{ background: 'var(--red)' }} /> Overdue task in this phase
        </span>
        <span>
          <span className="phase-legend-dot" style={{ background: 'var(--amber)' }} /> No schedule data yet -- click to add
        </span>
        <span>
          <IconPlus size={11} /> Hover a gap between phases to insert a custom one
        </span>
      </div>
    </div>
  );
}
