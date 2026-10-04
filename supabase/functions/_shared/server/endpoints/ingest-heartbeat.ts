import { heartbeatSchema, validate } from '../../boxlink/contract.ts';
import { dbFailure, readJson, serveEndpoint } from '../http.ts';

serveEndpoint({ endpoint: 'ingest-heartbeat', auth: 'ingest' }, async (req, ctx) => {
  const raw = await readJson(req);
  if (!raw.ok) return raw;
  const parsed = validate(heartbeatSchema, raw.data);
  if (!parsed.ok) return parsed;
  const h = parsed.data;

  const { data, error } = await ctx.db.rpc('box_record_heartbeat', { p: h, p_request: ctx.requestId });
  if (error) return dbFailure(error);
  const result = data as { inserted: number; updated: number };
  return { ok: true, runId: h.run_id, counts: { received: 1, inserted: result.inserted, updated: result.updated } };
});
