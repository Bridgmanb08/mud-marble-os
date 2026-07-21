// Validated categorical set built from the app's own brand colors (index.css),
// ordered to maximize adjacent CVD separation -- run through the dataviz skill's
// validator before shipping (all 5 pass; amber requires the direct-label relief
// this file's consumers already provide via recharts' built-in slice labels).
export const CATEGORICAL_COLORS = ['#378ADD', '#1D9E75', '#EF9F27', '#E24B4A', '#534AB7'];
export const OTHER_COLOR = '#9E9C96';

export function colorForIndex(i: number): string {
  return CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length];
}
