import { IconClipboardList } from '@tabler/icons-react';

// Placeholder for Phase 20.5 (Work Orders + Task Board link) -- the
// rental_work_orders backend/router doesn't exist yet. Keeps the "Work
// Orders" nav item (added in Phase 20.2) from dead-ending on a blank page
// in the meantime.
export default function RentalWorkOrders() {
  return (
    <>
      <div className="ph">
        <div>
          <h1>Work Orders</h1>
          <p>Maintenance requests across all rental properties</p>
        </div>
      </div>
      <div className="empty">
        <IconClipboardList size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
        <div className="empty-t">Coming soon</div>
        <div className="empty-s">Work order tracking (linked into the Task Board) ships in the next Rentals update.</div>
      </div>
    </>
  );
}
