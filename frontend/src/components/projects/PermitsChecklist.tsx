import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import type { Project } from '../../types';

const PERMIT_FIELDS = [
  { key: 'permit_structural_pulled', dateKey: 'permit_structural_date', numberKey: 'permit_structural_number', label: 'Structural permit pulled' },
  { key: 'permit_plumbing_pulled', dateKey: 'permit_plumbing_date', numberKey: 'permit_plumbing_number', label: 'Plumbing permit pulled' },
  { key: 'permit_electrical_pulled', dateKey: 'permit_electrical_date', numberKey: 'permit_electrical_number', label: 'Electrical permit pulled' },
  { key: 'permit_hvac_pulled', dateKey: 'permit_hvac_date', numberKey: 'permit_hvac_number', label: 'HVAC permit pulled' },
  { key: 'foundation_inspection_required', dateKey: 'foundation_inspection_date', numberKey: 'foundation_inspection_number', label: 'Foundation inspection required' },
] as const;

export function PermitsChecklist({ project, onSaved }: { project: Project; onSaved: (updated: Project) => void }) {
  const toast = useToast();

  async function toggle(key: (typeof PERMIT_FIELDS)[number]['key']) {
    const next = !project[key];
    onSaved({ ...project, [key]: next });
    try {
      await api.patch(`/projects/${project.id}`, { [key]: next });
    } catch (e) {
      onSaved({ ...project, [key]: !next });
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  async function setNumber(numberKey: (typeof PERMIT_FIELDS)[number]['numberKey'], value: string) {
    const parsed = value.trim() || null;
    if (parsed === (project[numberKey] || null)) return;
    onSaved({ ...project, [numberKey]: parsed });
    try {
      await api.patch(`/projects/${project.id}`, { [numberKey]: parsed });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  async function setDate(dateKey: (typeof PERMIT_FIELDS)[number]['dateKey'], value: string) {
    const parsed = value || null;
    onSaved({ ...project, [dateKey]: parsed });
    try {
      await api.patch(`/projects/${project.id}`, { [dateKey]: parsed });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PERMIT_FIELDS.map(({ key, dateKey, numberKey, label }) => (
        <div key={key} className="permit-box">
          <label>
            <input type="checkbox" checked={!!project[key]} onChange={() => toggle(key)} />
            {label}
          </label>
          <PermitNumberInput value={project[numberKey]} onCommit={(v) => setNumber(numberKey, v)} />
          <input
            className="fi"
            type="date"
            value={(project[dateKey] as string | null)?.slice(0, 10) || ''}
            onClick={openDatePicker}
            onChange={(e) => setDate(dateKey, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// Saves on blur (not per keystroke), like the rest of this page's autosaving
// fields. Local draft so typing isn't fighting the optimistic project update.
function PermitNumberInput({ value, onCommit }: { value: string | null; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  return (
    <input
      className="fi permit-number"
      type="text"
      placeholder="Permit #"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
