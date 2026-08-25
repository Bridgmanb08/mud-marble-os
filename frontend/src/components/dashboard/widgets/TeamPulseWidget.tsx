import { useEffect, useState } from 'react';
import { IconSend, IconFlag3Filled } from '@tabler/icons-react';
import { api, ApiError } from '../../../api/client';
import { fmtD } from '../../../lib/format';
import { Skeleton } from '../../ui/Skeleton';
import type { PulseTeamSummary } from '../../../types';

function workloadColor(rating: number): string {
  if (rating <= 2) return 'var(--green)';
  if (rating === 3) return 'var(--amber)';
  return 'var(--red)';
}

function staleness(days: number | null): string {
  if (days === null) return 'Never checked in';
  if (days === 0) return 'Checked in today';
  if (days === 1) return 'Checked in yesterday';
  return `Checked in ${days} days ago`;
}

export function TeamPulseWidget() {
  const [summary, setSummary] = useState<PulseTeamSummary | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);

  async function load() {
    setError('');
    try {
      const res = await api.get<PulseTeamSummary>('/pulse/team-summary');
      setSummary(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'Failed to load team pulse');
      }
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function pushRequest() {
    setPushing(true);
    try {
      await api.post('/pulse/push-request');
      setPushed(true);
      setTimeout(() => setPushed(false), 4000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to send push request');
    } finally {
      setPushing(false);
    }
  }

  if (forbidden) {
    return <div style={{ fontSize: 13, color: 'var(--t2)' }}>Admin access required to view team pulse.</div>;
  }
  if (error) return <div className="merr">{error}</div>;
  if (!summary) return <Skeleton height={90} />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge bg-gray">
            Avg workload {summary.avg_workload !== null ? summary.avg_workload.toFixed(1) : '—'}
          </span>
          {summary.stuck_count > 0 && <span className="badge bg-red">{summary.stuck_count} feeling stuck</span>}
          <span className="badge bg-green">{summary.responses_this_week} check-ins this week</span>
        </div>
        <button type="button" className="btn btn-sm" onClick={pushRequest} disabled={pushing} style={{ marginLeft: 'auto' }}>
          <IconSend size={14} /> {pushing ? 'Sending…' : pushed ? 'Sent!' : 'Push a check-in request'}
        </button>
      </div>

      {summary.members.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>No team members yet.</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          {summary.members.map((m) => (
            <div key={m.user_id} style={{ flex: '0 0 220px', background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {m.latest && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: workloadColor(m.latest.workload_rating),
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                {m.latest?.feeling_stuck && <IconFlag3Filled size={13} color="var(--red)" />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{staleness(m.days_since_checkin)}</div>
              {m.latest?.feeling_stuck && m.latest.stuck_note && (
                <div style={{ fontSize: 11.5, color: 'var(--red)', marginBottom: 8, lineHeight: 1.4 }}>
                  Stuck: {m.latest.stuck_note}
                </div>
              )}
              {m.latest?.win && (
                <div style={{ fontSize: 11.5, color: 'var(--t2)', marginBottom: 4, lineHeight: 1.4 }}>
                  🏆 {m.latest.win}
                </div>
              )}
              {m.latest?.grateful_for && (
                <div style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.4 }}>🙏 {m.latest.grateful_for}</div>
              )}
              {m.trend.length > 1 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
                  {m.trend.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background: workloadColor(r),
                        opacity: 0.4 + (0.6 * (i + 1)) / m.trend.length,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 8 }}>Wins &amp; gratitude</div>
        {summary.recent_wins.length === 0 ? (
          <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>Nothing shared yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.recent_wins.map((w, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.4 }}>
                <strong>{w.name}</strong>{' '}
                {w.win && <span>🏆 {w.win}</span>}
                {w.win && w.grateful_for && ' · '}
                {w.grateful_for && <span>🙏 {w.grateful_for}</span>}
                <span style={{ color: 'var(--t3)', fontSize: 10.5 }}> — {fmtD(w.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
