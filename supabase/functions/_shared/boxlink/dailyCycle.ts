import { isAlertTriggered, type AlertDirection, type AlertMetric } from '../engine/alerts.ts';
import { computeCropMargin, type CostLineInput } from '../engine/margin.ts';
import { computeCropPosition, type ContractInput } from '../engine/position.ts';
import { scanBannedPhrases } from './contract.ts';

export interface CycleCrop {
  id: string;
  name: string;
  areaHa: number;
  expectedTonnes: number;
  referenceP: number | null;
  contracts: ContractInput[];
  costLines: CostLineInput[];
}

export interface CycleRule {
  id: string;
  farmId: string;
  cropId: string;
  metric: AlertMetric;
  direction: AlertDirection;
  threshold: number;
}

export interface RuleEvaluation {
  ruleId: string;
  farmId: string;
  value: number | null;
  triggered: boolean;
  dedupeKey: string;
  message: { title: string; body: string } | null;
}

export const DISCLAIMER = 'This is information about your own figures, not advice. Decisions on selling and buying stay with you.';

export const toPence = (value: number) => Math.round(value * 100);

export function metricValue(crop: CycleCrop, metric: AlertMetric): number | null {
  const position = computeCropPosition({
    expectedTonnes: crop.expectedTonnes,
    contracts: crop.contracts,
    referencePriceP: crop.referenceP,
    previousReferencePriceP: null,
  });
  if (metric === 'committed_pct') return position.committedPct;
  if (metric === 'reference_price') return crop.referenceP === null ? null : crop.referenceP / 100;
  const margin = computeCropMargin({
    areaHa: crop.areaHa,
    expectedTonnes: crop.expectedTonnes,
    totalValueP: position.totalValueP,
    costLines: crop.costLines,
  });
  return margin.marginPerHaP === null ? null : margin.marginPerHaP / 100;
}

const money = (pounds: number) =>
  `${pounds < 0 ? '−' : ''}£${Math.abs(pounds).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function alertMessage(crop: CycleCrop, rule: CycleRule, value: number, asOf: string) {
  const side = rule.direction === 'above' ? 'above' : 'below';
  const when = longDate(asOf);
  let title: string;
  let lead: string;
  if (rule.metric === 'reference_price') {
    title = `${crop.name}: reference price ${side} ${money(rule.threshold)}/t`;
    lead = `The reference price for ${crop.name} was ${money(value)}/t on ${when}, ${side} the ${money(rule.threshold)}/t level you set.`;
  } else if (rule.metric === 'margin_per_ha') {
    title = `${crop.name}: margin ${side} ${money(rule.threshold)}/ha`;
    lead = `Your margin on ${crop.name} worked out at ${money(value)}/ha on ${when}, ${side} the ${money(rule.threshold)}/ha level you set.`;
  } else {
    title = `${crop.name}: ${pct(value)} committed`;
    lead = `${crop.name} was ${pct(value)} committed on ${when}, ${side} the ${pct(rule.threshold)} level you set.`;
  }
  return { title, body: `${lead} ${DISCLAIMER}` };
}

export function evaluateRule(rule: CycleRule, crop: CycleCrop | undefined, asOf: string): RuleEvaluation {
  const dedupeKey = `${rule.id}:${asOf}`;
  const value = crop ? metricValue(crop, rule.metric) : null;
  const triggered = isAlertTriggered(value, rule.direction, rule.threshold) === true;
  let message = null;
  if (triggered && crop && value !== null) {
    const m = alertMessage(crop, rule, value, asOf);
    if (scanBannedPhrases([m.title, m.body]).length === 0) message = m;
  }
  return { ruleId: rule.id, farmId: rule.farmId, value, triggered, dedupeKey, message };
}
