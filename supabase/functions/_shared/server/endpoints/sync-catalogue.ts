import {
  catalogueSchema,
  checkCatalogueLicences,
  commodityGroup,
  duplicates,
  fail,
  validate,
} from '../../boxlink/contract.ts';
import { dbFailure, readJson, serveEndpoint } from '../http.ts';

serveEndpoint({ endpoint: 'sync-catalogue', auth: 'ingest' }, async (req, ctx) => {
  const raw = await readJson(req);
  if (!raw.ok) return raw;
  const parsed = validate(catalogueSchema, raw.data);
  if (!parsed.ok) return parsed;
  const c = parsed.data;

  const licence = checkCatalogueLicences(c);
  if (licence) return licence;
  const dupSources = duplicates(c.sources.map((s) => s.code));
  const dupSeries = duplicates(c.series.map((s) => s.code));
  if (dupSources.length || dupSeries.length) {
    return fail('schema', `Duplicate codes in one call: ${[...dupSources, ...dupSeries].join(', ')}.`);
  }

  const series = c.series.map((s) => ({ ...s, group: commodityGroup(s.commodity) }));
  const { data, error } = await ctx.db.rpc('box_sync_catalogue', { p_sources: c.sources, p_series: series });
  if (error) return dbFailure(error);
  const result = data as { inserted: number; updated: number };
  return {
    ok: true,
    runId: c.run_id ?? null,
    counts: { received: c.sources.length + c.series.length, inserted: result.inserted, updated: result.updated },
  };
});
