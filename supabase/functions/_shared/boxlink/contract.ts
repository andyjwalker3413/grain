import { z } from 'zod';

export const CONTRACT_VERSION = '1';
export const MAX_OBSERVATIONS = 5000;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const RATE_LIMIT_PER_MINUTE = 120;

export const CONTRACT_UNITS = [
  'GBP_per_t',
  'GBP_per_l',
  'EUR_per_t',
  'USD_per_t',
  'USc_per_bu',
  'USD_per_bbl',
  'p_per_therm',
  'index',
] as const;
export type ContractUnit = (typeof CONTRACT_UNITS)[number];

export const BANNED_PHRASES = [
  'you should',
  'we recommend',
  'we advise',
  'our advice',
  'recommend selling',
  'recommend buying',
  'sell now',
  'buy now',
  'time to sell',
  'time to buy',
  'will rise',
  'will fall',
  'is going to rise',
  'is going to fall',
  'price target',
  'forecast',
  'prediction',
  'guaranteed',
];

export type ErrorCode =
  | 'bad_json'
  | 'schema'
  | 'contract_version'
  | 'unauthorised'
  | 'ip_not_allowed'
  | 'payload_too_large'
  | 'unknown_code'
  | 'licence_refused'
  | 'rate_limited'
  | 'paused'
  | 'method_not_allowed'
  | 'internal';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  bad_json: 400,
  schema: 400,
  contract_version: 400,
  unauthorised: 401,
  ip_not_allowed: 403,
  payload_too_large: 413,
  unknown_code: 422,
  licence_refused: 422,
  rate_limited: 429,
  paused: 503,
  method_not_allowed: 405,
  internal: 500,
};

export interface Failure {
  ok: false;
  error: ErrorCode;
  detail: string;
}
export type Result<T> = { ok: true; data: T } | Failure;

export const fail = (error: ErrorCode, detail: string): Failure => ({ ok: false, error, detail });

export function errorBody(requestId: string, error: ErrorCode, detail: string) {
  const body: Record<string, unknown> = { ok: false, request_id: requestId, error, detail };
  if (error === 'paused') body.paused = true;
  return body;
}

export interface Counts {
  received: number;
  inserted: number;
  updated: number;
  rejected?: unknown[];
  warnings?: string[];
}

export function successBody(requestId: string, runId: string | null, c: Counts) {
  return {
    ok: true,
    request_id: requestId,
    run_id: runId,
    received: c.received,
    inserted: c.inserted,
    updated: c.updated,
    rejected: c.rejected ?? [],
    warnings: c.warnings ?? [],
  };
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function matchKey(provided: string | null, keys: Array<[label: string, value: string | undefined]>): string | null {
  if (!provided) return null;
  let match: string | null = null;
  for (const [label, value] of keys) {
    if (value && value.length > 0 && timingSafeEqual(provided, value) && match === null) match = label;
  }
  return match;
}

export function callerIp(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first ? first : null;
}

export function ipAllowed(ip: string | null, allowList: string | undefined): boolean {
  const allowed = (allowList ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return ip !== null && allowed.includes(ip);
}

export function retryAfterSeconds(now: Date): number {
  return Math.max(1, 60 - now.getUTCSeconds());
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'not a real date');
const isoTimestamp = z.string().refine(
  (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
  'expected ISO 8601 timestamp with offset',
);
const code = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/, 'codes are lower-case letters, digits, _ . -');
const text = (max: number) => z.string().max(max);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'expected lower-case hex sha256');

const sourceSchema = z.object({
  code,
  name: text(200).min(1),
  owner: text(200),
  url: z.string().url().max(500).nullable(),
  licence_class: z.string(),
  licence_scope: z.enum(['general', 'single_client']),
  attribution_text: text(1000),
  independence: text(80).min(1),
  merchant_interest_note: text(1000).nullable(),
  refresh_cadence: text(40).nullable(),
});

const seriesSchema = z.object({
  code,
  source_code: code,
  name: text(200).min(1),
  commodity: code,
  basis: text(80).nullable(),
  unit: z.enum(CONTRACT_UNITS),
  region: text(80).nullable(),
  delivery_period: text(80).nullable(),
  frequency: text(40).nullable(),
});

export const catalogueSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  sent_at: isoTimestamp.optional(),
  run_id: text(120).optional(),
  sources: z.array(sourceSchema).max(500),
  series: z.array(seriesSchema).max(2000),
});

const observationSchema = z.object({
  date: isoDate,
  value: z.number().refine(Number.isFinite, 'value must be a finite number').refine((v) => Math.abs(v) < 1e9, 'value out of range'),
  provenance: z.object({ file: text(500).min(1), sha256, captured_at: isoTimestamp }),
});

export const marketDataSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  run_id: text(120),
  source_code: code,
  series: z.array(z.object({ code, observations: z.array(observationSchema) })),
});

const sectionSchema = z.object({
  id: code,
  heading: text(200).min(1),
  body_markdown: text(20000),
  source_codes: z.array(code).max(50),
  chart_refs: z.array(code).max(50),
});

export const briefSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  run_id: text(120),
  date: isoDate,
  edition: z.enum(['weekday_short', 'friday_full']),
  title: text(300).min(1),
  released_at: isoTimestamp,
  word_count: z.number().int().min(0).max(100000),
  sections: z.array(sectionSchema).max(50),
  watchlist: z.array(z.object({ label: text(200), detail: text(2000) })).max(50),
  pdf: z.object({ filename: text(200).min(1), sha256, bytes: z.number().int().positive() }).nullable().optional(),
});

export const heartbeatSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  run_id: text(120).min(1),
  phase: z.enum(['started', 'finished']),
  started_at: isoTimestamp,
  finished_at: isoTimestamp.nullable().optional(),
  streams: z.record(z.string().max(40), z.enum(['ok', 'skipped', 'failed', 'paused'])),
  counts: z.record(z.string().max(40), z.number().int()).optional(),
  warnings: z.array(text(1000)).max(100).optional(),
});

export const dailyCycleSchema = z.object({
  contract_version: z.literal(CONTRACT_VERSION).optional(),
  as_of: isoDate,
  run_id: text(120).optional(),
});

export type Catalogue = z.infer<typeof catalogueSchema>;
export type MarketData = z.infer<typeof marketDataSchema>;
export type BriefPayload = z.infer<typeof briefSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type DailyCycle = z.infer<typeof dailyCycleSchema>;

export function parseJson(raw: string): Result<unknown> {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return fail('bad_json', 'Body is not valid JSON.');
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
    .join('; ');
}

export function validate<T>(schema: z.ZodType<T>, body: unknown, versionRequired = true): Result<T> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('schema', 'Body must be a JSON object.');
  if ('contract_version' in body) {
    const v = (body as { contract_version: unknown }).contract_version;
    if (v !== CONTRACT_VERSION) return fail('contract_version', `contract_version must be "1", got ${JSON.stringify(v)}.`);
  } else if (versionRequired) {
    return fail('contract_version', 'contract_version is missing; it must be "1".');
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data } : fail('schema', describeIssues(parsed.error));
}

export function checkCatalogueLicences(c: Catalogue): Failure | null {
  const refused = c.sources.filter((s) => s.licence_class !== 'display' && s.licence_class !== 'chart');
  if (refused.length > 0) {
    return fail(
      'licence_refused',
      `Only display or chart sources may be sent; refused: ${refused.map((s) => `${s.code} (${s.licence_class})`).join(', ')}.`,
    );
  }
  return null;
}

export function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

const GROUPS: Array<[group: 'grain' | 'fertiliser' | 'fuel', words: string[]]> = [
  ['grain', ['wheat', 'barley', 'oat', 'rape', 'oilseed', 'maize', 'corn', 'bean', 'pea', 'soy', 'grain']],
  ['fertiliser', ['fertiliser', 'fertilizer', 'nitrate', 'urea', 'ammonia', 'potash', 'phosphate', 'dap', 'uan', 'nitrogen']],
  ['fuel', ['diesel', 'gasoil', 'gas_oil', 'crude', 'brent', 'oil', 'gas', 'kerosene', 'petrol', 'fuel']],
];

export function commodityGroup(commodity: string): 'grain' | 'fertiliser' | 'fuel' | 'other' {
  const c = commodity.toLowerCase();
  return GROUPS.find(([, words]) => words.some((w) => c.includes(w)))?.[0] ?? 'other';
}

export function flattenObservations(m: MarketData) {
  return m.series.flatMap((s) =>
    s.observations.map((o) => ({ series_code: s.code, date: o.date, value: o.value, provenance: o.provenance })),
  );
}

export function checkObservations(m: MarketData): Failure | null {
  const rows = flattenObservations(m);
  if (rows.length > MAX_OBSERVATIONS) {
    return fail('payload_too_large', `At most ${MAX_OBSERVATIONS} observations per call; got ${rows.length}.`);
  }
  const dup = duplicates(rows.map((r) => `${r.series_code}@${r.date}`));
  if (dup.length > 0) return fail('schema', `Duplicate observations in one call: ${dup.slice(0, 10).join(', ')}.`);
  return null;
}

export function scanBannedPhrases(texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    const lower = t.toLowerCase();
    for (const p of BANNED_PHRASES) if (lower.includes(p)) found.add(p);
  }
  return [...found].map((p) => `Banned phrase found: "${p}"`);
}

export function briefTexts(b: BriefPayload): string[] {
  return [
    b.title,
    ...b.sections.flatMap((s) => [s.heading, s.body_markdown]),
    ...b.watchlist.flatMap((w) => [w.label, w.detail]),
  ];
}

export function checkBriefShape(b: BriefPayload, hasPdfFile: boolean): Failure | null {
  if (b.pdf && !hasPdfFile) return fail('schema', 'payload.pdf is set but no "pdf" file was attached.');
  if (!b.pdf && hasPdfFile) return fail('schema', 'A "pdf" file was attached but payload.pdf is missing.');
  if (b.sections.length === 0 && !b.pdf) return fail('schema', 'sections may be empty only when a PDF is attached.');
  if (b.pdf && b.pdf.bytes > MAX_PDF_BYTES) return fail('payload_too_large', 'The PDF is over 10 MB.');
  const dup = duplicates(b.sections.map((s) => s.id));
  if (dup.length > 0) return fail('schema', `Duplicate section ids: ${dup.join(', ')}.`);
  return null;
}

export function checkPdf(bytes: Uint8Array, mime: string, expected: { sha256: string; bytes: number }, actualSha: string): Failure | null {
  if (bytes.byteLength > MAX_PDF_BYTES) return fail('payload_too_large', 'The PDF is over 10 MB.');
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (mime !== 'application/pdf' || !isPdf) return fail('schema', 'The "pdf" field must be an application/pdf file.');
  if (bytes.byteLength !== expected.bytes) {
    return fail('schema', `PDF size mismatch: payload says ${expected.bytes} bytes, file is ${bytes.byteLength}.`);
  }
  if (actualSha !== expected.sha256) return fail('schema', 'PDF sha256 does not match payload.pdf.sha256.');
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
