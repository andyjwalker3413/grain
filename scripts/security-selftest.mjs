// Security self-test for the box link and admin actions.
// Run: node --env-file=.env scripts/security-selftest.mjs
// Signs up a throwaway signed-in user who is not an admin, plus a signed-out caller, and checks that
// every admin action, box-only database call and box-link table refuses them. Prints a PASS/FAIL table
// and the throwaway user's id, which must be deleted afterwards (see docs/PROGRESS.md).
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, anonKey, opts);
const user = createClient(url, anonKey, opts);
const results = [];
const record = (area, check, pass, evidence) => results.push({ area, check, result: pass ? 'PASS' : 'FAIL', evidence });

const email = `selftest.${Date.now()}@grain-desk-selftest.test`;
const signUp = await user.auth.signUp({ email, password: `St-${crypto.randomUUID()}` });
if (signUp.error || !signUp.data.session) throw new Error(`Could not create the throwaway user: ${signUp.error?.message ?? 'no session'}`);
const token = signUp.data.session.access_token;
const userId = signUp.data.user.id;

const describe = (r) => (r.error ? `refused (${r.error.code ?? r.error.statusCode ?? 'error'})` : `allowed, ${JSON.stringify(r.data)?.slice(0, 60)}`);
const denied = (r) => (r.error ? r.error.code === '42501' : Array.isArray(r.data) && r.data.length === 0);

const adminRpcs = [
  ['set_box_link_accepting', { p_accept: false }],
  ['admin_restrict_source', { p_code: 'desnz_fuel', p_licence_class: 'chart', p_licence_scope: 'general', p_status: 'active' }],
  ['box_link_health', {}],
];
const boxRpcs = [
  ['box_rate_hit', { p_label: 'selftest' }],
  ['box_sync_catalogue', { p_sources: [], p_series: [] }],
  ['box_ingest_observations', { p_source: 'desnz_fuel', p_rows: [], p_request: crypto.randomUUID() }],
  ['box_upsert_brief', { p: {} }],
  ['box_record_heartbeat', { p: {}, p_request: crypto.randomUUID() }],
];

for (const [who, client] of [['signed-in non-admin', user], ['signed-out', anon]]) {
  for (const [fn, args] of [...adminRpcs, ...boxRpcs]) {
    const r = await client.rpc(fn, args);
    record(`API, ${who}`, `rpc ${fn}`, r.error?.code === '42501', describe(r));
  }
}

for (const table of ['app_admins', 'box_link_settings', 'ingest_runs', 'box_heartbeats', 'ingest_rate_counters', 'daily_cycle_runs']) {
  const r = await user.from(table).select('*').limit(5);
  record('API, signed-in non-admin', `read ${table}`, denied(r), r.error ? describe(r) : `${r.data.length} rows visible`);
}

const writes = [
  ['insert app_admins (self-promotion)', () => user.from('app_admins').insert({ user_id: userId, email }).select()],
  ['update box_link_settings (pause the box)', () => user.from('box_link_settings').update({ accept_data: false }).eq('id', 1).select()],
  ['insert ingest_runs', () => user.from('ingest_runs').insert({ request_id: crypto.randomUUID(), endpoint: 'sync-catalogue', http_status: 200, ok: true }).select()],
  ['insert box_heartbeats', () => user.from('box_heartbeats').insert({ run_id: 'selftest', phase: 'finished' }).select()],
  ['insert daily_cycle_runs', () => user.from('daily_cycle_runs').insert({ request_id: crypto.randomUUID(), as_of: '2026-10-05' }).select()],
  ['insert alert_events', () => user.from('alert_events').insert({ dedupe_key: 'selftest' }).select()],
  ['update sources (loosen a licence)', () => user.from('sources').update({ licence_scope: 'general' }).neq('id', '').select()],
];
for (const [check, run] of writes) {
  const r = await run();
  record('API, signed-in non-admin', check, denied(r), r.error ? describe(r) : `${r.data.length} rows changed`);
}

const upload = await user.storage.from('brief-pdfs').upload(`selftest/${Date.now()}.pdf`, new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
record('API, signed-in non-admin', 'upload to brief-pdfs', Boolean(upload.error), upload.error ? `refused (${upload.error.message})` : 'allowed');

const call = async (slug, headers, body = { contract_version: '1', as_of: '2026-10-05' }) => {
  const res = await fetch(`${url}/functions/v1/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const bearer = { Authorization: `Bearer ${token}`, apikey: anonKey };

const cycle = await call('run-daily-cycle', bearer);
record('API, signed-in non-admin', 'Run now (run-daily-cycle with own session)', cycle.status === 401, `HTTP ${cycle.status} ${cycle.body?.error ?? ''}`);
for (const slug of ['sync-catalogue', 'ingest-market-data', 'ingest-heartbeat', 'ingest-brief']) {
  const r = await call(slug, bearer, { contract_version: '1' });
  record('API, signed-in non-admin', `${slug} with own session, no ingest key`, r.status === 401, `HTTP ${r.status} ${r.body?.error ?? ''}`);
}
const guessed = await call('sync-catalogue', { 'x-ingest-key': 'not-the-key' }, { contract_version: '1' });
record('API, signed-out', 'sync-catalogue with a wrong key', guessed.status === 401 && typeof guessed.body?.request_id === 'string', `HTTP ${guessed.status} ${guessed.body?.error ?? ''}`);

const sync = await user.functions.invoke('admin-sync', { body: {} });
record('UI, signed-in non-admin', 'admin check reports not an admin (hides Admin menu, page shows "Desk admins only")', sync.data?.is_admin === false, sync.error ? `error ${sync.error.message}` : `is_admin=${sync.data?.is_admin}`);

console.table(results);
const failed = results.filter((r) => r.result === 'FAIL').length;
console.log(`${results.length - failed} PASS, ${failed} FAIL. Throwaway user to delete: ${userId}`);
process.exitCode = failed ? 1 : 0;
