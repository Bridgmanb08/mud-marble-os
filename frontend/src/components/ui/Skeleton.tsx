import type { CSSProperties } from 'react';

export function Skeleton({
  width = '100%',
  height = 14,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width, height, ...style }} />;
}
