import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../ui/Toast';
import { TaskDetailDrawer } from '../tasks/TaskDetailDrawer';
import type { Task } from '../../types';

interface DashboardTaskDrawerProps {
  taskId: string;
  onClose: () => void;
}

// Dashboard widgets only get a lightweight task summary, not the full Task
// shape TaskDetailDrawer needs (subcontractor, assignees, dependencies,
// version, etc.) -- so on open we fetch the full list once (same call the
// Task Board makes) and reuse the exact same drawer/editing experience.
export function DashboardTaskDrawer({ taskId, onClose }: DashboardTaskDrawerProps) {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Task[]>('/tasks')
      .then((rows) => {
        if (cancelled) return;
        if (!rows.some((t) => t.id === taskId)) {
          toast('This task could not be found — it may have been deleted.', true);
          onClose();
          return;
        }
        setTasks(rows);
      })
      .catch(() => {
        if (!cancelled) {
          toast('Failed to load task', true);
          onClose();
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!tasks) return null;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  return <TaskDetailDrawer task={task} allTasks={tasks} onClose={onClose} onSaved={onClose} onDeleted={onClose} />;
}
