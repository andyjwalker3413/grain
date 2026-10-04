export type AlertMetric = 'reference_price' | 'margin_per_ha' | 'committed_pct';
export type AlertDirection = 'above' | 'below';

export function isAlertTriggered(value: number | null, direction: AlertDirection, threshold: number): boolean | null {
  if (value === null) return null;
  return direction === 'above' ? value > threshold : value < threshold;
}
