import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ERROR_STATUS,
  MAX_JSON_BYTES,
  RATE_LIMIT_PER_MINUTE,
  callerIp,
  errorBody,
  fail,
  ipAllowed,
  matchKey,
  parseJson,
  retryAfterSeconds,
  successBody,
  type Counts,
  type Failure,
  type Result,
} from '../boxlink/contract.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Ingest-Key, X-Cron-Secret',
};

export interface Ctx {
  requestId: string;
  db: SupabaseClient;
  keyLabel: string;
  actor: string | null;
  ip: string | null;
}

export interface Success {
  ok: true;
  runId: string | null;
  sourceCode?: string | null;
  counts: Counts;
}

export type Outcome = Success | Failure;

export interface EndpointConfig {
  endpoint: string;
  auth: 'ingest' | 'cron';
  allowAdminSession?: boolean;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Server configuration missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readBody(req: Request, max: number): Promise<Result<Uint8Array>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > max) return fail('payload_too_large', `Body is over ${Math.round(max / 1024 / 1024)} MB.`);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > max) return fail('payload_too_large', `Body is over ${Math.round(max / 1024 / 1024)} MB.`);
  return { ok: true, data: buf };
}

export async function readJson(req: Request): Promise<Result<unknown>> {
  const body = await readBody(req, MAX_JSON_BYTES);
  if (!body.ok) return body;
  return parseJson(new TextDecoder().decode(body.data));
}

export function dbFailure(error: { code?: string; message?: string }): Failure {
  if (error.code === 'P0422') {
    const msg = error.message ?? 'Refused';
    return fail(/licence/i.test(msg) ? 'licence_refused' : 'unknown_code', msg);
  }
  throw new Error(`Database error ${error.code ?? ''}`);
}

async function adminFromSession(db: SupabaseClient, req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: admin } = await db.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return admin ? data.user.id : null;
}

async function logRun(db: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await db.from('ingest_runs').insert(row);
  if (error) console.error('ingest_runs insert failed', error.code);
}

export function serveEndpoint(cfg: EndpointConfig, handler: (req: Request, ctx: Ctx) => Promise<Outcome>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
    const requestId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const ip = callerIp(req.headers.get('x-forwarded-for'));
    let db: SupabaseClient | null = null;
    let keyLabel: string | null = null;

    const finish = async (outcome: Outcome, extraHeaders: Record<string, string> = {}) => {
      const status = outcome.ok ? 200 : ERROR_STATUS[outcome.error];
      if (db) {
        await logRun(db, {
          request_id: requestId,
          endpoint: cfg.endpoint,
          run_id: outcome.ok ? outcome.runId : null,
          source_code: outcome.ok ? outcome.sourceCode ?? null : null,
          http_status: status,
          ok: outcome.ok,
          error_code: outcome.ok ? null : outcome.error,
          detail: outcome.ok ? null : outcome.detail.slice(0, 2000),
          received: outcome.ok ? outcome.counts.received : 0,
          inserted: outcome.ok ? outcome.counts.inserted : 0,
          updated: outcome.ok ? outcome.counts.updated : 0,
          rejected: outcome.ok ? outcome.counts.rejected ?? [] : [],
          warnings: outcome.ok ? outcome.counts.warnings ?? [] : [],
          caller_ip: ip,
          key_label: keyLabel,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        });
      }
      const body = outcome.ok
        ? successBody(requestId, outcome.runId, outcome.counts)
        : errorBody(requestId, outcome.error, outcome.detail);
      return json(status, body, extraHeaders);
    };

    try {
      db = serviceClient();
      if (req.method !== 'POST') return await finish(fail('method_not_allowed', 'Use POST.'));
      if (!ipAllowed(ip, Deno.env.get('INGEST_ALLOWED_IPS'))) {
        return await finish(fail('ip_not_allowed', 'Caller IP is not on the allowed list.'));
      }

      let actor: string | null = null;
      keyLabel =
        cfg.auth === 'ingest'
          ? matchKey(req.headers.get('x-ingest-key'), [
              ['ingest_key', Deno.env.get('INGEST_KEY')],
              ['ingest_key_next', Deno.env.get('INGEST_KEY_NEXT')],
            ])
          : matchKey(req.headers.get('x-cron-secret'), [['cron_secret', Deno.env.get('CRON_SECRET')]]);
      if (!keyLabel && cfg.allowAdminSession) {
        actor = await adminFromSession(db, req);
        if (actor) keyLabel = 'admin_session';
      }
      if (!keyLabel) {
        const header = cfg.auth === 'ingest' ? 'x-ingest-key' : 'x-cron-secret';
        return await finish(fail('unauthorised', `Missing or wrong ${header}.`));
      }

      const hits = await db.rpc('box_rate_hit', { p_label: keyLabel });
      if (hits.error) throw new Error('Rate counter unavailable');
      if (Number(hits.data) > RATE_LIMIT_PER_MINUTE) {
        const wait = retryAfterSeconds(new Date());
        return await finish(fail('rate_limited', `More than ${RATE_LIMIT_PER_MINUTE} calls a minute. Retry after ${wait} seconds.`), {
          'Retry-After': String(wait),
        });
      }

      if (keyLabel !== 'admin_session') {
        const settings = await db.from('box_link_settings').select('accept_data').eq('id', 1).maybeSingle();
        if (settings.error) throw new Error('Settings unavailable');
        if (settings.data && settings.data.accept_data === false) {
          return await finish(fail('paused', 'The app admin has paused data from the box. Spool and retry at the next pass.'));
        }
      }

      return await finish(await handler(req, { requestId, db, keyLabel, actor, ip }));
    } catch (err) {
      console.error(cfg.endpoint, 'failed', err instanceof Error ? err.message : 'unknown');
      try {
        return await finish(fail('internal', 'Internal error. Retry later.'));
      } catch {
        return json(500, errorBody(requestId, 'internal', 'Internal error. Retry later.'));
      }
    }
  });
}
