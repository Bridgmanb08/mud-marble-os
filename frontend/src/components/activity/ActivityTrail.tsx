import { useEffect, useState } from 'react';
import { IconRobot } from '@tabler/icons-react';
import { api } from '../../api/client';
import type { ActivityEntry } from '../../types';
import { botTouchName } from '../../lib/actor';

export function BotBadge({ name }: { name: string }) {
  return (
    <span className="bot-badge" title={`AI bot ${name}`}>
      <IconRobot size={12} aria-hidden />
      {name}
    </span>
  );
}

export function TaskActorLine({
  task,
}: {
  task: {
    updated_by_type?: string | null;
    updated_by_name?: string | null;
    created_by_type?: string | null;
    created_by_name?: string | null;
  };
}) {
  const bot = botTouchName(task);
  if (bot) return <BotBadge name={bot} />;
  if (task.updated_by_type === 'human' && task.updated_by_name) {
    return <span className="actor-human">Last edited by {task.updated_by_name}</span>;
  }
  if (!task.updated_by_type && task.created_by_type === 'human' && task.created_by_name) {
    return <span className="actor-human">Added by {task.created_by_name}</span>;
  }
  return <span className="actor-legacy">Last editor unknown (legacy)</span>;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  assigned_to: 'Assignee',
  assignees: 'Assignees',
  phase: 'Phase',
  construction_phase: 'Build phase',
  status: 'Status',
  priority: 'Priority',
  scheduled_start: 'Start',
  scheduled_end: 'Due',
  notes: 'Notes',
  is_milestone: 'Milestone',
  is_punch_list: 'Punch list',
  clarify_from: 'Needs clarity from',
  subcontractor_id: 'Subcontractor',
  project_id: 'Project',
  completed_at: 'Completed',
  start_date: 'Start date',
  estimated_completion: 'Est. completion',
  current_phase: 'Current phase',
  event_date: 'Date',
  comment: 'Comment',
  contract_value: 'Contract value',
  name: 'Name',
  address: 'Address',
  notes_internal: 'Internal notes',
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: 'To do',
  in_progress: 'In progress',
  delayed: 'Delayed',
  urgent_today: 'Urgent today',
  complete: 'Done',
};

const TABLE_LABELS: Record<string, string> = {
  schedule_items: 'Task',
  calendar_events: 'Calendar event',
  projects: 'Project',
  estimates: 'Estimate',
  clients: 'Client',
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ');
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (field === 'status' && STATUS_LABELS[text]) return STATUS_LABELS[text];
  if (text.length > 180) return text.slice(0, 180) + '…';
  return text;
}

function actionLabel(action: string): string {
  if (action === 'create') return 'created';
  if (action === 'comment') return 'commented';
  if (action === 'delete') return 'deleted';
  return 'updated';
}

interface Group {
  key: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  source: string | null;
  created_at: string;
  table_name: string;
  record_title: string | null;
  entries: ActivityEntry[];
}

function groupEntries(entries: ActivityEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const key = [
      entry.created_at,
      entry.actor_type,
      entry.actor_name || '',
      entry.action,
      entry.table_name,
      entry.record_id,
      entry.source || '',
    ].join('|');
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({
        key,
        actor_type: entry.actor_type,
        actor_name: entry.actor_name,
        action: entry.action,
        source: entry.source,
        created_at: entry.created_at,
        table_name: entry.table_name,
        record_title: entry.record_title,
        entries: [entry],
      });
    }
  }
  return groups;
}

function ActorLabel({ type, name }: { type: string; name: string | null }) {
  if (type === 'bot') return <BotBadge name={name || 'AI bot'} />;
  if (type === 'human') return <strong>{name || 'Someone'}</strong>;
  return <span className="actor-legacy">{name ? `${name} · legacy` : 'Unknown / legacy'}</span>;
}

function ChangeLine({ entry }: { entry: ActivityEntry }) {
  if (entry.action === 'comment') {
    return <div>Comment: {formatValue('comment', entry.new_value)}</div>;
  }
  if (entry.action === 'delete') {
    return <div>Removed {formatValue('title', entry.old_value)}</div>;
  }
  if (entry.action === 'create') {
    return (
      <div>
        {fieldLabel(entry.field)}: {formatValue(entry.field, entry.new_value)}
      </div>
    );
  }
  return (
    <div>
      {fieldLabel(entry.field)}: {formatValue(entry.field, entry.old_value)} → {formatValue(entry.field, entry.new_value)}
    </div>
  );
}

export function ActivityFeed({ path, refreshKey = 0 }: { path: string; refreshKey?: number }) {
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api
      .get<ActivityEntry[]>(path)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey]);

  if (rows === null) {
    return <div className="actor-legacy">Loading change history…</div>;
  }
  if (failed) {
    return <div className="actor-legacy">Couldn't load change history.</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="actor-legacy">
        No change history yet. Edits from here on are recorded with who made them. Older items stay unmarked instead of
        being labeled as a bot.
      </div>
    );
  }

  const groups = groupEntries(rows);
  return (
    <div className="activity-feed">
      {groups.map((group) => {
        const when = new Date(group.created_at).toLocaleString();
        const what = TABLE_LABELS[group.table_name] || group.table_name;
        const subject = group.record_title && group.table_name !== 'projects' ? `${what} “${group.record_title}”` : what;
        return (
          <div key={group.key} className="activity-entry">
            <div className="activity-entry-hd">
              <ActorLabel type={group.actor_type} name={group.actor_name} />
              <span>
                {actionLabel(group.action)} {subject}
                {group.source ? <span className="actor-legacy"> · from {group.source}</span> : null}
              </span>
              <span className="actor-legacy" style={{ marginLeft: 'auto' }}>
                {when}
              </span>
            </div>
            <div className="activity-entry-body">
              {group.entries.map((entry) => (
                <ChangeLine key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
