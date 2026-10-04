import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { AlertDirection, AlertMetric } from '@engine/alerts.ts';

export interface AlertRule {
  id: string;
  cropId: string;
  metric: AlertMetric;
  direction: AlertDirection;
  threshold: number;
  active: boolean;
}

export interface DeskMessage {
  id: string;
  kind: 'alert' | 'market_note' | 'weekly_summary';
  title: string;
  body: string;
  createdAt: string;
}

export const METRIC_LABEL: Record<AlertMetric, string> = {
  reference_price: 'Reference price (£/t)',
  margin_per_ha: 'Margin (£/ha)',
  committed_pct: 'Committed (%)',
};

export const newRuleSchema = z.object({
  cropId: z.string().uuid('Choose a crop'),
  metric: z.enum(['reference_price', 'margin_per_ha', 'committed_pct']),
  direction: z.enum(['above', 'below']),
  threshold: z.number({ message: 'Enter a number' }).finite().min(-100000).max(100000),
});

export async function fetchRules(farmId: string): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('id, crop_id, metric, direction, threshold, active')
    .eq('farm_id', farmId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    cropId: r.crop_id,
    metric: r.metric as AlertMetric,
    direction: r.direction as AlertDirection,
    threshold: Number(r.threshold),
    active: r.active,
  }));
}

export async function createRule(farmId: string, rule: z.infer<typeof newRuleSchema>): Promise<void> {
  const { error } = await supabase.from('alert_rules').insert({
    farm_id: farmId,
    crop_id: rule.cropId,
    metric: rule.metric,
    direction: rule.direction,
    threshold: rule.threshold,
  });
  if (error) throw error;
}

export async function setRuleActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('alert_rules').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('alert_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMessages(farmId: string): Promise<DeskMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, kind, title, body, created_at')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, kind: m.kind as DeskMessage['kind'], title: m.title, body: m.body, createdAt: m.created_at }));
}
