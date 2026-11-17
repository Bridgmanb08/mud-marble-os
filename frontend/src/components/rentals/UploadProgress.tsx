export function UploadProgress({ name, pct }: { name: string; pct: number }) {
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ margin: '8px 0 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
        Uploading {name} — {shown}%
      </div>
      <div
        role="progressbar"
        aria-valuenow={shown}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Uploading ${name}`}
        style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}
      >
        <div style={{ width: `${shown}%`, height: '100%', background: 'var(--accent)' }} />
      </div>
    </div>
  );
}
