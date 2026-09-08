import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import { openDatePicker } from '../../lib/datePicker';
import type { Project } from '../../types';

const PERMIT_FIELDS = [
  { key: 'permit_structural_pulled', dateKey: 'permit_structural_date', label: 'Structural permit pulled' },
  { key: 'permit_plumbing_pulled', dateKey: 'permit_plumbing_date', label: 'Plumbing permit pulled' },
  { key: 'permit_electrical_pulled', dateKey: 'permit_electrical_date', label: 'Electrical permit pulled' },
  { key: 'permit_hvac_pulled', dateKey: 'permit_hvac_date', label: 'HVAC permit pulled' },
  { key: 'foundation_inspection_required', dateKey: 'foundation_inspection_date', label: 'Foundation inspection required' },
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
      {PERMIT_FIELDS.map(({ key, dateKey, label }) => (
        <div key={key} className="permit-box">
          <label>
            <input type="checkbox" checked={!!project[key]} onChange={() => toggle(key)} />
            {label}
          </label>
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
