import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_UNITS,
  ERROR_STATUS,
  MAX_OBSERVATIONS,
  briefSchema,
  briefTexts,
  callerIp,
  catalogueSchema,
  checkBriefShape,
  checkCatalogueLicences,
  checkObservations,
  checkPdf,
  commodityGroup,
  dailyCycleSchema,
  errorBody,
  heartbeatSchema,
  ipAllowed,
  marketDataSchema,
  matchKey,
  parseJson,
  retryAfterSeconds,
  scanBannedPhrases,
  sha256Hex,
  successBody,
  timingSafeEqual,
  validate,
  type BriefPayload,
  type Catalogue,
  type MarketData,
} from './contract.ts';

function contractSamples(): Record<'A' | 'B' | 'C' | 'D', unknown> {
  const doc = readFileSync(new URL('../../../../docs/CONTRACT.md', import.meta.url), 'utf8');
  const parts = doc.split(/^Sample ([A-D]) - .*$/m);
  const out: Record<string, unknown> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const block = parts[i + 1];
    out[parts[i]] = JSON.parse(block.slice(block.indexOf('{'), block.lastIndexOf('}') + 1));
  }
  return out as Record<'A' | 'B' | 'C' | 'D', unknown>;
}

const samples = contractSamples();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('contract samples', () => {
  it('extracts all four samples from docs/CONTRACT.md', () => {
    expect(Object.keys(samples).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
  it('accepts sample A (sync-catalogue)', () => expect(validate(catalogueSchema, samples.A).ok).toBe(true));
  it('accepts sample B (ingest-market-data)', () => expect(validate(marketDataSchema, samples.B).ok).toBe(true));
  it('accepts sample C (ingest-brief payload)', () => expect(validate(briefSchema, samples.C).ok).toBe(true));
  it('accepts sample D (ingest-heartbeat)', () => expect(validate(heartbeatSchema, samples.D).ok).toBe(true));
  it('accepts the run-daily-cycle body', () => expect(validate(dailyCycleSchema, { as_of: '2026-10-05' }, false).ok).toBe(true));
  it('passes sample A licence check (display and chart only)', () =>
    expect(checkCatalogueLicences(samples.A as Catalogue)).toBeNull());
});

describe('400: bad JSON, schema and contract_version', () => {
  it('rejects malformed JSON', () => expect(parseJson('{"contract_version":')).toMatchObject({ ok: false, error: 'bad_json' }));
  it('rejects a missing contract_version', () => {
    const b = clone(samples.B) as Record<string, unknown>;
    delete b.contract_version;
    expect(validate(marketDataSchema, b)).toMatchObject({ ok: false, error: 'contract_version' });
  });
  it('rejects contract_version "2"', () =>
    expect(validate(marketDataSchema, { ...(samples.B as object), contract_version: '2' })).toMatchObject({ ok: false, error: 'contract_version' }));
  it('rejects a numeric contract_version 1', () =>
    expect(validate(heartbeatSchema, { ...(samples.D as object), contract_version: 1 })).toMatchObject({ ok: false, error: 'contract_version' }));
  it('rejects a unit outside the contract list', () => {
    const a = clone(samples.A) as Catalogue;
    (a.series[0] as { unit: string }).unit = 'p_per_l';
    const r = validate(catalogueSchema, a);
    expect(r).toMatchObject({ ok: false, error: 'schema' });
  });
  it('accepts every contract unit', () => {
    for (const unit of CONTRACT_UNITS) {
      const a = clone(samples.A) as Catalogue;
      a.series[0].unit = unit;
      expect(validate(catalogueSchema, a).ok).toBe(true);
    }
  });
  it('rejects non-finite values (NaN, Infinity) and strings', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '0.83']) {
      const b = clone(samples.B) as MarketData;
      (b.series[0].observations[0] as { value: unknown }).value = value;
      expect(validate(marketDataSchema, b)).toMatchObject({ ok: false, error: 'schema' });
    }
  });
  it('rejects JSON with a non-finite literal', () => expect(parseJson('{"value": NaN}')).toMatchObject({ ok: false, error: 'bad_json' }));
  it('rejects an impossible date', () => {
    const b = clone(samples.B) as MarketData;
    b.series[0].observations[0].date = '2026-02-30';
    expect(validate(marketDataSchema, b)).toMatchObject({ ok: false, error: 'schema' });
  });
  it('requires provenance on each observation', () => {
    const b = clone(samples.B) as MarketData;
    delete (b.series[0].observations[0] as { provenance?: unknown }).provenance;
    expect(validate(marketDataSchema, b)).toMatchObject({ ok: false, error: 'schema' });
  });
  it('rejects duplicate observations in one call', () => {
    const b = clone(samples.B) as MarketData;
    b.series[0].observations.push(clone(b.series[0].observations[0]));
    expect(checkObservations(b)).toMatchObject({ ok: false, error: 'schema' });
  });
  it('rejects a heartbeat stream state outside ok|skipped|failed|paused', () => {
    const d = clone(samples.D) as { streams: Record<string, string> };
    d.streams.market = 'running';
    expect(validate(heartbeatSchema, d)).toMatchObject({ ok: false, error: 'schema' });
  });
  it('rejects an unknown edition', () =>
    expect(validate(briefSchema, { ...(samples.C as object), edition: 'saturday' })).toMatchObject({ ok: false, error: 'schema' }));
});

describe('413: payload too large', () => {
  it('refuses more than 5,000 observations', () => {
    const b = clone(samples.B) as MarketData;
    const base = b.series[0].observations[0];
    b.series[0].observations = Array.from({ length: MAX_OBSERVATIONS + 1 }, (_, i) => ({
      ...base,
      date: new Date(Date.UTC(2000, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    }));
    expect(checkObservations(b)).toMatchObject({ ok: false, error: 'payload_too_large' });
    expect(ERROR_STATUS.payload_too_large).toBe(413);
  });
  it('accepts exactly 5,000 observations', () => {
    const b = clone(samples.B) as MarketData;
    const base = b.series[0].observations[0];
    b.series[0].observations = Array.from({ length: MAX_OBSERVATIONS }, (_, i) => ({
      ...base,
      date: new Date(Date.UTC(2000, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    }));
    expect(checkObservations(b)).toBeNull();
  });
  it('refuses a PDF over 10 MB', () => {
    const c = clone(samples.C) as BriefPayload;
    c.pdf = { ...c.pdf!, bytes: 10 * 1024 * 1024 + 1 };
    expect(checkBriefShape(c, true)).toMatchObject({ ok: false, error: 'payload_too_large' });
  });
});

describe('422: licence refused', () => {
  for (const cls of ['describe_only', 'store']) {
    it(`refuses a ${cls} source`, () => {
      const a = clone(samples.A) as Catalogue;
      a.sources[1].licence_class = cls;
      const r = checkCatalogueLicences(a);
      expect(r).toMatchObject({ ok: false, error: 'licence_refused' });
      expect(r?.detail).toContain('example_exchange');
      expect(ERROR_STATUS.licence_refused).toBe(422);
    });
  }
});

describe('brief shape and PDF checks', () => {
  it('allows empty sections when a PDF is attached', () => {
    const c = clone(samples.C) as BriefPayload;
    c.sections = [];
    expect(checkBriefShape(c, true)).toBeNull();
  });
  it('refuses empty sections without a PDF', () => {
    const c = clone(samples.C) as BriefPayload;
    c.sections = [];
    c.pdf = null;
    expect(checkBriefShape(c, false)).toMatchObject({ ok: false, error: 'schema' });
  });
  it('refuses payload.pdf without a file, and a file without payload.pdf', () => {
    const c = clone(samples.C) as BriefPayload;
    expect(checkBriefShape(c, false)).toMatchObject({ ok: false });
    c.pdf = null;
    expect(checkBriefShape(c, true)).toMatchObject({ ok: false });
  });
  it('verifies the PDF hash, size and type', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 test');
    const sha = await sha256Hex(bytes);
    expect(checkPdf(bytes, 'application/pdf', { sha256: sha, bytes: bytes.byteLength }, sha)).toBeNull();
    expect(checkPdf(bytes, 'application/pdf', { sha256: '0'.repeat(64), bytes: bytes.byteLength }, sha)).toMatchObject({ ok: false });
    expect(checkPdf(bytes, 'application/pdf', { sha256: sha, bytes: 1 }, sha)).toMatchObject({ ok: false });
    expect(checkPdf(bytes, 'text/plain', { sha256: sha, bytes: bytes.byteLength }, sha)).toMatchObject({ ok: false });
    const notPdf = new TextEncoder().encode('hello');
    expect(checkPdf(notPdf, 'application/pdf', { sha256: sha, bytes: notPdf.byteLength }, sha)).toMatchObject({ ok: false });
  });
  it('reports banned phrases as warnings without failing validation', () => {
    const c = clone(samples.C) as BriefPayload;
    c.sections[0].body_markdown = 'Prices will rise and you should sell now.';
    expect(validate(briefSchema, c).ok).toBe(true);
    expect(scanBannedPhrases(briefTexts(c))).toEqual(
      expect.arrayContaining(['Banned phrase found: "will rise"', 'Banned phrase found: "you should"', 'Banned phrase found: "sell now"']),
    );
    expect(scanBannedPhrases(briefTexts(samples.C as BriefPayload))).toEqual([]);
  });
});

describe('401, 403 and 429 helpers', () => {
  it('compares keys in constant time and accepts INGEST_KEY or INGEST_KEY_NEXT', () => {
    const keys: Array<[string, string | undefined]> = [['ingest_key', 'a'.repeat(40)], ['ingest_key_next', 'b'.repeat(40)]];
    expect(matchKey('a'.repeat(40), keys)).toBe('ingest_key');
    expect(matchKey('b'.repeat(40), keys)).toBe('ingest_key_next');
    expect(matchKey('c'.repeat(40), keys)).toBeNull();
    expect(matchKey(null, keys)).toBeNull();
    expect(matchKey('', [['ingest_key', '']])).toBeNull();
    expect(matchKey('anything', [['ingest_key', undefined]])).toBeNull();
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
  it('allows every IP when INGEST_ALLOWED_IPS is unset and only listed IPs when set', () => {
    expect(ipAllowed('1.2.3.4', undefined)).toBe(true);
    expect(ipAllowed('1.2.3.4', '5.6.7.8, 1.2.3.4')).toBe(true);
    expect(ipAllowed('9.9.9.9', '5.6.7.8')).toBe(false);
    expect(ipAllowed(null, '5.6.7.8')).toBe(false);
    expect(callerIp('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4');
  });
  it('maps each error to the contract status', () => {
    expect(ERROR_STATUS).toMatchObject({
      bad_json: 400, schema: 400, contract_version: 400, unauthorised: 401, ip_not_allowed: 403,
      payload_too_large: 413, unknown_code: 422, licence_refused: 422, rate_limited: 429, paused: 503,
    });
    expect(retryAfterSeconds(new Date('2026-10-05T06:50:45Z'))).toBe(15);
  });
});

describe('response bodies', () => {
  it('success body has exactly the contract fields', () => {
    const body = successBody('req-1', 'run-1', { received: 2, inserted: 1, updated: 1 });
    expect(Object.keys(body)).toEqual(['ok', 'request_id', 'run_id', 'received', 'inserted', 'updated', 'rejected', 'warnings']);
  });
  it('error body has exactly the contract fields, plus paused when paused', () => {
    expect(Object.keys(errorBody('r', 'schema', 'x'))).toEqual(['ok', 'request_id', 'error', 'detail']);
    expect(errorBody('r', 'paused', 'x')).toMatchObject({ ok: false, paused: true, error: 'paused' });
  });
});

describe('commodity grouping', () => {
  it('groups contract commodity codes for the Markets filters', () => {
    expect(commodityGroup('feed_wheat')).toBe('grain');
    expect(commodityGroup('red_diesel')).toBe('fuel');
    expect(commodityGroup('ammonium_nitrate')).toBe('fertiliser');
    expect(commodityGroup('electricity')).toBe('other');
  });
});
