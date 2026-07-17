import { IconTools } from '@tabler/icons-react';

export default function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <div className="ph">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="empty">
        <IconTools size={32} color="var(--t3)" style={{ display: 'block', margin: '0 auto 12px' }} />
        <div className="empty-t">Being rebuilt</div>
        <div className="empty-s">This module is coming in a later phase of the rewrite.</div>
      </div>
    </>
  );
}
