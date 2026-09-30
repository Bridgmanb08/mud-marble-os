import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { openDatePicker } from '../../lib/datePicker';
import type { CalendarEvent, Project } from '../../types';

// A calendar entry that is NOT a task -- deliberately never links to one by
// default (see api/app/calendar_events.py). Used both for a genuine
// free-standing event someone adds here, and to view/retime one of the
// auto-synced markers (a project's Start/Estimated Completion date, a
// phase's manual date) -- editing those just moves the marker; the actual
// source (the project's date field, the phase's date box) is still the
// place to change it for good.
export function CalendarEventModal({
  event,
  projectId,
  projects,
  onClose,
  onSaved,
  onDeleted,
}: {
  event?: CalendarEvent;
  /** Fixed project for a project-scoped calendar; omit for the master
   * schedule, where the project is picked per event (or left blank). */
  projectId?: string;
  projects?: Project[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [title, setTitle] = useState(event?.title || '');
  const [eventDate, setEventDate] = useState(event?.event_date.slice(0, 10) || '');
  const [notes, setNotes] = useState(event?.notes || '');
  const [eventProjectId, setEventProjectId] = useState(projectId || event?.project_id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !eventDate) {
      setError('Title and date are both required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (event) {
        await api.patch(`/calendar-events/${event.id}`, {
          title: title.trim(),
          event_date: eventDate,
          notes: notes.trim() || null,
        });
      } else {
        await api.post('/calendar-events', {
          project_id: eventProjectId || null,
          title: title.trim(),
          event_date: eventDate,
          notes: notes.trim() || null,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the event');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event || !confirm(`Remove "${event.title}" from the schedule?`)) return;
    try {
      await api.delete(`/calendar-events/${event.id}`);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the event');
    }
  }

  return (
    <Modal title={event ? 'Edit event' : 'New calendar event'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="merr">{error}</div>}
        {event?.auto_kind && (
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
            This date is kept in sync automatically. Changing it here only moves this calendar entry -- use the
            project's own date field (or the phase tracker) to change the actual source.
          </div>
        )}
        <div className="fg">
          <label className="fl">Title</label>
          <input className="fi" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client walkthrough" />
        </div>
        <div className="fr">
          <div className="fg">
            <label className="fl">Date</label>
            <input className="fi" type="date" value={eventDate} onClick={openDatePicker} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          {!projectId && projects && (
            <div className="fg">
              <label className="fl">Project</label>
              <select className="fi" value={eventProjectId} onChange={(e) => setEventProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.replace(/\|.*/, '').trim()}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="fg">
          <label className="fl">Notes</label>
          <textarea className="fi" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="ma">
          {event && (
            <button type="button" className="btn" style={{ color: 'var(--red)' }} onClick={handleDelete}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-p" disabled={saving}>
            {saving ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
