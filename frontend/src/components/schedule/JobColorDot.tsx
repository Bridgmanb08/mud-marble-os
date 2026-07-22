import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { JOB_COLOR_SWATCHES, colorForProject } from '../../lib/jobColors';
import type { Project } from '../../types';

export function JobColorDot({ project, onChanged }: { project: Project; onChanged: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const color = colorForProject(project);

  async function setColor(c: string) {
    setOpen(false);
    onChanged(c);
    try {
      await api.patch(`/projects/${project.id}`, { color: c });
    } catch {
      // best-effort -- a reload resyncs from the server if this silently failed
    }
  }

  function openPopover() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn-reset job-color-dot"
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : openPopover();
        }}
        title="Change job color"
        style={{ background: color }}
      />
      {open &&
        createPortal(
          <>
            <div className="job-color-pop-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <div
              className="card job-color-pop"
              style={{ position: 'fixed', top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {JOB_COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`btn-reset job-color-swatch${c === color ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <label className="job-color-custom" title="Custom color">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#9e9c96'} onChange={(e) => setColor(e.target.value)} />
              </label>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
