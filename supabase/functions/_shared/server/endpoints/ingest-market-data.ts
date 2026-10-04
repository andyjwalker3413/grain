import { checkObservations, flattenObservations, marketDataSchema, validate } from '../../boxlink/contract.ts';
import { dbFailure, readJson, serveEndpoint } from '../http.ts';

serveEndpoint({ endpoint: 'ingest-market-data', auth: 'ingest' }, async (req, ctx) => {
  const raw = await readJson(req);
  if (!raw.ok) return raw;
  const parsed = validate(marketDataSchema, raw.data);
  if (!parsed.ok) return parsed;
  const m = parsed.data;

  const problem = checkObservations(m);
  if (problem) return problem;
  const rows = flattenObservations(m);

  const { data, error } = await ctx.db.rpc('box_ingest_observations', {
    p_source: m.source_code,
    p_rows: rows,
    p_request: ctx.requestId,
  });
  if (error) return dbFailure(error);
  const result = data as { inserted: number; updated: number };
  return {
    ok: true,
    runId: m.run_id,
    sourceCode: m.source_code,
    counts: { received: rows.length, inserted: result.inserted, updated: result.updated },
  };
});
