import type { AppNotification } from '../types';

export function notificationPath(
  n: Pick<AppNotification, 'type' | 'source_type' | 'source_id' | 'project_id'>
): string | null {
  if (n.type === 'unclaimed_media') return '/review';
  if (n.type === 'job_import_conflict' && n.project_id) return `/job-import/${n.project_id}`;
  if (n.source_type === 'rental_work_order' && n.source_id) return `/rentals/work-orders?open=${n.source_id}`;
  if (n.project_id) return `/projects/${n.project_id}`;
  return null;
}
