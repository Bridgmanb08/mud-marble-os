import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconPlus } from '@tabler/icons-react';
import { api } from '../../../api/client';
import { NewProjectModal } from '../../projects/NewProjectModal';
import type { JobImportStatus } from '../../../types';

function StatusDot({ done }: { done: boolean }) {
  return <span className={`dot ${done ? 'dot-g' : 'dot-a'}`} />;
}

export function JobImportWidget() {
  const [statuses, setStatuses] = useState<JobImportStatus[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();

  function load() {
    api
      .get<JobImportStatus[]>('/job-import/status')
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--t2)' }}>
          Import each job's estimate, invoices/change orders, and In-House sheet.
        </div>
        <button className="btn btn-sm" onClick={() => setShowNew(true)}>
          <IconPlus size={14} /> New job
        </button>
      </div>

      {!statuses ? (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>Loading…</div>
      ) : statuses.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>No jobs yet — click "New job" to add the first one.</div>
      ) : (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 130px 90px',
              gap: 8,
              padding: '6px 0',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--t2)',
              textTransform: 'uppercase',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div>Job</div>
            <div>Estimate</div>
            <div>Invoices/COs</div>
            <div>In-House</div>
          </div>
          {statuses.map((s) => (
            <Link
              key={s.project_id}
              to={`/job-import/${s.project_id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 130px 90px',
                gap: 8,
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: 12.5,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.project_name.replace(/\|.*/, '').trim()}
              </div>
              <StatusDot done={s.has_estimate} />
              <StatusDot done={s.has_financials} />
              <StatusDot done={s.has_inhouse} />
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(project) => {
            setShowNew(false);
            navigate(`/job-import/${project.id}`);
          }}
        />
      )}
    </div>
  );
}
