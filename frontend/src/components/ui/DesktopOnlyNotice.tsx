import { IconDeviceDesktop } from '@tabler/icons-react';

// Shared banner for the views that are genuinely desktop-primary tools
// (Gantt-style timelines, wide analytics tables) rather than something
// worth force-fitting into a phone screen -- reused across the Task
// Board's Timeline view, Rentals' LeaseTimeline, and the later
// SubIntelligence/Reports mobile pass. Matches this app's plain-CSS,
// no-component-library convention.
export function DesktopOnlyNotice({ label }: { label: string }) {
  return (
    <div className="card" style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--t2)' }}>
      <IconDeviceDesktop size={28} style={{ marginBottom: 10, color: 'var(--t3)' }} />
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{label} is best viewed on a larger screen</div>
      <div style={{ fontSize: 13 }}>This view is dense and works better on a desktop or tablet -- try another view here on your phone.</div>
    </div>
  );
}
