export type MarkupType = 'percent' | 'flat' | 'per_unit';

// The dollar profit a markup produces on a line.
export function profitFor(type: MarkupType, value: number, qty: number, builderCost: number): number {
  if (type === 'flat') return value;
  if (type === 'per_unit') return value * qty;
  return builderCost * (value / 100);
}

const clean = (n: number) => parseFloat(n.toFixed(6)); // enough places to keep the profit exact, no float noise

// Re-expresses a markup in another type so the line's profit stays exactly the same:
// 35% on $10,800 of cost -> $2.3625 per unit on 1,600 units -> $3,780 flat. Returns null
// when there's nothing to divide by (no quantity, or no cost for a percent) so the caller
// can leave the value blank instead of guessing.
export function convertMarkup(from: MarkupType, to: MarkupType, value: number, qty: number, builderCost: number): number | null {
  if (from === to) return value;
  const profit = profitFor(from, value, qty, builderCost);
  if (to === 'flat') return clean(profit);
  if (to === 'per_unit') return qty !== 0 ? clean(profit / qty) : null;
  return builderCost !== 0 ? clean((profit / builderCost) * 100) : null;
}
