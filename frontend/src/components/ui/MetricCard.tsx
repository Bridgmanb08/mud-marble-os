interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}

export function MetricCard({ label, value, sub, valueColor }: MetricCardProps) {
  return (
    <div className="metric">
      <div className="m-label">{label}</div>
      <div className="m-val" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      {sub && <div className="m-sub">{sub}</div>}
    </div>
  );
}
