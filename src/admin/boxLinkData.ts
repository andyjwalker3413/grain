import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const formatWhen = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'd MMM yyyy, HH:mm') : 'Never');

const ts = z.string().nullable();

const heartbeatSchema = z.object({
  run_id: z.string(),
  phase: z.string(),
  received_at: z.string(),
  warnings: z.array(z.unknown()).nullable().optional(),
});

const runSchema = z.object({
  request_id: z.string(),
  endpoint: z.string(),
  http_status: z.number(),
  ok: z.boolean(),
  error_code: z.string().nullable(),
  started_at: z.string(),
  key_label: z.string().nullable().optional(),
});

const boxSourceSchema = z.object({
  code: z.string(),
  name: z.string(),
  status: z.string(),
  licence_class: z.string(),
  licence_scope: z.string(),
  box_licence_class: z.string().nullable(),
  box_licence_scope: z.string().nullable(),
  refresh_cadence: z.string().nullable(),
  updated_at: ts,
});

const boxSeriesSchema = z.object({
  code: z.string(),
  name: z.string(),
  source_code: z.string(),
  unit: z.string(),
  frequency: z.string().nullable(),
  refresh_cadence: z.string().nullable(),
  last_observed_on: ts,
  observations: z.number(),
});

const healthSchema = z.object({
  settings: z.object({ accept_data: z.boolean(), updated_at: ts.optional() }).nullable(),
  heartbeats: z.array(heartbeatSchema),
  last_success: z.record(z.string(), z.string()),
  last_cycle: z
    .object({
      as_of: z.string(),
      ok: z.boolean(),
      triggered_by: z.string(),
      rules_evaluated: z.number(),
      events_created: z.number(),
      messages_created: z.number(),
      started_at: z.string(),
    })
    .nullable(),
  recent_runs: z.array(runSchema),
  warnings: z.array(z.object({ endpoint: z.string(), at: z.string(), warnings: z.array(z.unknown()) })),
  sources: z.array(boxSourceSchema),
  series: z.array(boxSeriesSchema),
});

export type BoxHealth = z.infer<typeof healthSchema>;
export type BoxSource = z.infer<typeof boxSourceSchema>;
export type BoxSeries = z.infer<typeof boxSeriesSchema>;
export type IngestRun = z.infer<typeof runSchema>;

export const STREAMS: { endpoint: string; label: string }[] = [
  { endpoint: 'sync-catalogue', label: 'Source catalogue' },
  { endpoint: 'ingest-market-data', label: 'Market prices' },
  { endpoint: 'ingest-brief', label: 'Daily brief' },
  { endpoint: 'ingest-heartbeat', label: 'Heartbeat' },
  { endpoint: 'run-daily-cycle', label: 'Daily cycle' },
];

export async function fetchHealth(): Promise<BoxHealth> {
  const { data, error } = await supabase.rpc('box_link_health');
  if (error) throw new Error('Could not load the box link health.');
  const parsed = healthSchema.safeParse(data);
  if (!parsed.success) throw new Error('The box link health came back in an unexpected shape.');
  return parsed.data;
}

export async function setAccepting(accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_box_link_accepting', { p_accept: accept });
  if (error) throw new Error('Could not change the switch.');
}

export interface Restriction {
  licenceClass: 'display' | 'chart';
  licenceScope: 'general' | 'single_client';
  status: 'active' | 'paused';
}

export async function restrictSource(code: string, r: Restriction): Promise<void> {
  const { error } = await supabase.rpc('admin_restrict_source', {
    p_code: code,
    p_licence_class: r.licenceClass,
    p_licence_scope: r.licenceScope,
    p_status: r.status,
  });
  if (error) throw new Error('Could not save the restriction for this source.');
}

export interface CycleResult {
  received: number;
  inserted: number;
}

export async function runDailyCycle(asOf: string): Promise<CycleResult> {
  const { data, error } = await supabase.functions.invoke('run-daily-cycle', {
    body: { contract_version: '1', as_of: asOf },
  });
  if (error) {
    const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : 'The daily cycle did not run.');
  }
  if (!data || typeof data.received !== 'number' || typeof data.inserted !== 'number') {
    throw new Error('The daily cycle replied in an unexpected shape.');
  }
  return { received: data.received, inserted: data.inserted };
}
