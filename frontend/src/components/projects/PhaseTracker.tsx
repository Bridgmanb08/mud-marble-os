import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import { PROJECT_PHASES, projectPhaseLabel } from '../../lib/projectPhases';
import type { ProjectPhaseProgress } from '../../types';

// The project Overview page's phase slider: current phase is set by hand
// (Shannon clicks a dot to mark where the job actually is -- see the
// project's own request: manual, not computed, since schedule data isn't
// reliably kept up to date enough to trust as the source of truth for
// "what phase are we in"). Per-phase alerts ARE computed from real
// Schedule tab data though: a red badge means a task tagged to that phase
// is overdue, an amber "+" bubble means NO scheduled task is tagged to
// that phase at all -- click it to add one right there, inline, without
// leaving this page.
export function PhaseTracker({
  projectId,
  currentPhase,
  onPhaseChange,
}: {
  projectId: string;
  currentPhase: string | null;
  onPhaseChange: (phase: string) => void;
}) {
  const toast = useToast();
  const [progress, setProgress] = useState<ProjectPhaseProgress | null>(null);
  const [quickAddPhase, setQuickAddPhase] = useState<string | null>(null);
  const [qaTitle, setQaTitle] = useState('');
  const [qaStart, setQaStart] = useState('');
  const [qaEnd, setQaEnd] = useState('');
  const [qaSaving, setQaSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  async function setPhase(phase: string) {
    onPhaseChange(phase); // optimistic, parent owns the source of truth for display elsewhere on the page
    try {
      await api.patch(`/projects/${projectId}`, { current_phase: phase });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to update phase', true);
    }
  }

  function openQuickAdd(phase: string) {
    setQuickAddPhase(phase);
    setQaTitle(`${projectPhaseLabel(phase)} work`);
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

  const currentIndex = currentPhase ? PROJECT_PHASES.indexOf(currentPhase as (typeof PROJECT_PHASES)[number]) : -1;
  const rowByPhase = new Map((progress?.phases || []).map((r) => [r.phase, r]));

  return (
    <div>
      <div className="phase-tracker-track">
        {PROJECT_PHASES.map((phase, i) => {
          const row = rowByPhase.get(phase);
          const isDone = currentIndex >= 0 && i < currentIndex;
          const isCurrent = phase === currentPhase;
          // A future phase with no schedule data yet isn't alarming on its
          // own -- only flag "go fill in the calendar" for the current
          // phase and anything already behind it, where you'd expect real
          // tasks to exist by now. "Complete" never needs its own tasks.
          const showMissing = row && row.task_count === 0 && currentIndex >= 0 && i <= currentIndex && phase !== 'complete';
          return (
            <div key={phase} className={`phase-segment${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
              {row?.has_overdue && (
                <div className="phase-badge overdue" title={`A scheduled task for ${projectPhaseLabel(phase)} is overdue`}>
                  <IconAlertTriangle size={9} />
                </div>
              )}
              {!row?.has_overdue && showMissing && (
                <button
                  type="button"
                  className="phase-badge missing"
                  title={`No schedule data for ${projectPhaseLabel(phase)} yet -- click to add`}
                  onClick={() => openQuickAdd(phase)}
                >
                  <IconPlus size={10} />
                </button>
              )}
              <button
                type="button"
                className="phase-dot-btn"
                title={`Mark as current phase: ${projectPhaseLabel(phase)}`}
                onClick={() => setPhase(phase)}
              />
              <div className="phase-label">{projectPhaseLabel(phase)}</div>
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
      </div>
    </div>
  );
}
