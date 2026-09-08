import { api, ApiError } from '../../api/client';
import { useToast } from '../ui/Toast';
import type { Project } from '../../types';

const DUMPSTER_SIZES = ['10 yd', '20 yd', '40 yd'];
const DUMPSTER_SUPPLIERS = ['Best Way Dumpsters', 'Iron Dumpsters', 'Other'];

export function DumpsterCard({ project, onSaved }: { project: Project; onSaved: (updated: Project) => void }) {
  const toast = useToast();

  async function save(patch: Partial<Project>) {
    onSaved({ ...project, ...patch });
    try {
      await api.patch(`/projects/${project.id}`, patch);
    } catch (e) {
      onSaved(project);
      toast(e instanceof ApiError ? e.message : 'Failed to save', true);
    }
  }

  return (
    <div className="dumpster-card">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={project.dumpster_on_site}
          onChange={(e) => save({ dumpster_on_site: e.target.checked })}
        />
        Dumpster on site
      </label>
      <div className="fg">
        <label className="fl">Size</label>
        <select
          className="fi"
          value={project.dumpster_size || ''}
          onChange={(e) => save({ dumpster_size: e.target.value || null })}
          disabled={!project.dumpster_on_site}
        >
          <option value="">— Select —</option>
          {DUMPSTER_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="fg">
        <label className="fl">Supplier</label>
        <select
          className="fi"
          value={project.dumpster_supplier || ''}
          onChange={(e) => save({ dumpster_supplier: e.target.value || null })}
          disabled={!project.dumpster_on_site}
        >
          <option value="">— Select —</option>
          {DUMPSTER_SUPPLIERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
