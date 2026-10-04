import { describe, expect, it } from 'vitest';
import { DISCLAIMER, evaluateRule, metricValue, toPence, type CycleCrop, type CycleRule } from './dailyCycle.ts';
import { scanBannedPhrases } from './contract.ts';

const crop: CycleCrop = {
  id: 'crop-1',
  name: 'Winter wheat',
  areaHa: 100,
  expectedTonnes: 850,
  referenceP: 17650,
  contracts: [{ type: 'fixed', status: 'open', tonnes: 500, priceP: 18000 }],
  costLines: [{ kind: 'fixed', amountPPerHa: 90000 }],
};

const rule = (over: Partial<CycleRule>): CycleRule => ({
  id: 'rule-1',
  farmId: 'farm-1',
  cropId: 'crop-1',
  metric: 'reference_price',
  direction: 'above',
  threshold: 175,
  ...over,
});

describe('daily cycle evaluation', () => {
  it('converts pound values to pence like the browser does', () => {
    expect(toPence(176.5)).toBe(17650);
    expect(toPence(0.8353)).toBe(84);
  });
  it('triggers a reference price rule and writes a plain message with the disclaimer', () => {
    const e = evaluateRule(rule({}), crop, '2026-10-05');
    expect(e.triggered).toBe(true);
    expect(e.value).toBe(176.5);
    expect(e.dedupeKey).toBe('rule-1:2026-10-05');
    expect(e.message?.body).toContain('£176.50/t on 5 October 2026');
    expect(e.message?.body).toContain(DISCLAIMER);
    expect(scanBannedPhrases([e.message!.title, e.message!.body])).toEqual([]);
  });
  it('uses the same dedupe key on a second run the same day', () => {
    expect(evaluateRule(rule({}), crop, '2026-10-05').dedupeKey).toBe(evaluateRule(rule({}), crop, '2026-10-05').dedupeKey);
  });
  it('does not trigger when the condition is not met', () => {
    const e = evaluateRule(rule({ direction: 'below' }), crop, '2026-10-05');
    expect(e.triggered).toBe(false);
    expect(e.message).toBeNull();
  });
  it('evaluates committed % and margin per hectare', () => {
    expect(metricValue(crop, 'committed_pct')).toBe(58.8);
    expect(metricValue(crop, 'margin_per_ha')).not.toBeNull();
  });
  it('does not trigger without a usable price', () => {
    const e = evaluateRule(rule({}), { ...crop, referenceP: null }, '2026-10-05');
    expect(e.value).toBeNull();
    expect(e.triggered).toBe(false);
  });
});
