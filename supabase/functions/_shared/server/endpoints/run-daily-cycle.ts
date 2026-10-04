import { dailyCycleSchema, validate } from '../../boxlink/contract.ts';
import { evaluateRule, toPence, type CycleCrop, type CycleRule } from '../../boxlink/dailyCycle.ts';
import type { CostLineInput } from '../../engine/margin.ts';
import type { ContractStatus, ContractType } from '../../engine/position.ts';
import type { AlertDirection, AlertMetric } from '../../engine/alerts.ts';
import { readJson, serveEndpoint, type Ctx } from '../http.ts';

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function latestUsablePrices(ctx: Ctx, seriesIds: string[], asOf: string): Promise<Map<string, number | null>> {
  const prices = new Map<string, number | null>();
  if (seriesIds.length === 0) return prices;
  const { data, error } = await ctx.db
    .from('market_series')
    .select('id, source:sources(status, licence_class, licence_scope)')
    .in('id', seriesIds);
  if (error) throw new Error('Series lookup failed');
  await Promise.all(
    (data ?? []).map(async (s) => {
      const src = one(s.source as unknown as { status: string; licence_class: string; licence_scope: string } | null);
      const usable = src && src.status === 'active' && ['display', 'chart'].includes(src.licence_class) && src.licence_scope === 'general';
      if (!usable) return prices.set(s.id, null);
      const obs = await ctx.db
        .from('market_observations')
        .select('value, value_exact')
        .eq('series_id', s.id)
        .lte('observed_on', asOf)
        .order('observed_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (obs.error) throw new Error('Observation lookup failed');
      prices.set(s.id, obs.data ? toPence(Number(obs.data.value_exact ?? obs.data.value)) : null);
    }),
  );
  return prices;
}

serveEndpoint({ endpoint: 'run-daily-cycle', auth: 'cron', allowAdminSession: true }, async (req, ctx) => {
  const startedAt = new Date().toISOString();
  const raw = await readJson(req);
  if (!raw.ok) return raw;
  const parsed = validate(dailyCycleSchema, raw.data, false);
  if (!parsed.ok) return parsed;
  const { as_of: asOf, run_id: runId } = parsed.data;

  const rulesRes = await ctx.db.from('alert_rules').select('id, farm_id, crop_id, metric, direction, threshold').eq('active', true);
  if (rulesRes.error) throw new Error('Rules lookup failed');
  const rules: CycleRule[] = (rulesRes.data ?? []).map((r) => ({
    id: r.id,
    farmId: r.farm_id,
    cropId: r.crop_id,
    metric: r.metric as AlertMetric,
    direction: r.direction as AlertDirection,
    threshold: Number(r.threshold),
  }));
  const cropIds = [...new Set(rules.map((r) => r.cropId))];

  const [cropsRes, contractsRes, linesRes] = cropIds.length
    ? await Promise.all([
        ctx.db.from('crops').select('id, name, area_ha, expected_tonnes, reference_series_id').in('id', cropIds),
        ctx.db.from('contracts').select('crop_id, contract_type, status, tonnes, price_p').in('crop_id', cropIds),
        ctx.db.from('cost_lines').select('crop_id, amount_p_per_ha, qty_per_ha, series_id').in('crop_id', cropIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (cropsRes.error || contractsRes.error || linesRes.error) throw new Error('Farm data lookup failed');

  const seriesIds = [
    ...new Set([
      ...(cropsRes.data ?? []).map((c) => c.reference_series_id),
      ...(linesRes.data ?? []).map((l) => l.series_id),
    ].filter((id): id is string => !!id)),
  ];
  const prices = await latestUsablePrices(ctx, seriesIds, asOf);

  const crops = new Map<string, CycleCrop>();
  for (const c of cropsRes.data ?? []) {
    const costLines: CostLineInput[] = (linesRes.data ?? [])
      .filter((l) => l.crop_id === c.id)
      .map((l) =>
        l.series_id && l.qty_per_ha !== null
          ? { kind: 'linked', qtyPerHa: Number(l.qty_per_ha), priceP: prices.get(l.series_id) ?? null }
          : { kind: 'fixed', amountPPerHa: l.amount_p_per_ha ?? 0 },
      );
    crops.set(c.id, {
      id: c.id,
      name: c.name,
      areaHa: Number(c.area_ha),
      expectedTonnes: Number(c.expected_tonnes),
      referenceP: c.reference_series_id ? prices.get(c.reference_series_id) ?? null : null,
      contracts: (contractsRes.data ?? [])
        .filter((k) => k.crop_id === c.id)
        .map((k) => ({ type: k.contract_type as ContractType, status: k.status as ContractStatus, tonnes: Number(k.tonnes), priceP: k.price_p })),
      costLines,
    });
  }

  const evaluations = rules.map((r) => evaluateRule(r, crops.get(r.cropId), asOf));
  const warnings = evaluations.filter((e) => e.value === null).map((e) => `Rule ${e.ruleId}: no usable figure for ${asOf}.`);
  const thresholds = new Map(rules.map((r) => [r.id, r.threshold]));

  let createdEvents: Array<{ id: string; dedupe_key: string }> = [];
  if (evaluations.length) {
    const { data, error } = await ctx.db
      .from('alert_events')
      .upsert(
        evaluations.map((e) => ({
          farm_id: e.farmId,
          rule_id: e.ruleId,
          as_of: asOf,
          triggered: e.triggered,
          value: e.value,
          threshold: thresholds.get(e.ruleId),
          dedupe_key: e.dedupeKey,
        })),
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id, dedupe_key');
    if (error) throw new Error('Alert events write failed');
    createdEvents = data ?? [];
  }

  let messagesCreated = 0;
  for (const ev of createdEvents) {
    const e = evaluations.find((x) => x.dedupeKey === ev.dedupe_key);
    if (!e?.message) continue;
    const msg = await ctx.db
      .from('messages')
      .insert({ farm_id: e.farmId, kind: 'alert', title: e.message.title, body: e.message.body, status: 'queued', origin: 'daily_cycle', alert_event_id: ev.id })
      .select('id')
      .single();
    if (msg.error) throw new Error('Message write failed');
    await ctx.db.from('alert_events').update({ message_id: msg.data.id }).eq('id', ev.id);
    messagesCreated++;
  }

  await ctx.db.from('daily_cycle_runs').insert({
    request_id: ctx.requestId,
    as_of: asOf,
    run_id: runId ?? null,
    triggered_by: ctx.keyLabel === 'admin_session' ? 'admin' : 'cron',
    actor: ctx.actor,
    farms: new Set(rules.map((r) => r.farmId)).size,
    rules_evaluated: evaluations.length,
    events_created: createdEvents.length,
    messages_created: messagesCreated,
    warnings,
    ok: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });

  return {
    ok: true,
    runId: runId ?? null,
    counts: { received: evaluations.length, inserted: createdEvents.length, updated: 0, warnings },
  };
});
