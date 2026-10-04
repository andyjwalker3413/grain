import {
  MAX_PDF_BYTES,
  briefSchema,
  briefTexts,
  checkBriefShape,
  checkPdf,
  fail,
  parseJson,
  scanBannedPhrases,
  sha256Hex,
  validate,
} from '../../boxlink/contract.ts';
import { dbFailure, readBody, serveEndpoint } from '../http.ts';

const BUCKET = 'brief-pdfs';

serveEndpoint({ endpoint: 'ingest-brief', auth: 'ingest' }, async (req, ctx) => {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return fail('schema', 'Send multipart/form-data with a "payload" field and an optional "pdf" file.');
  }
  const body = await readBody(req, MAX_PDF_BYTES + 1024 * 1024);
  if (!body.ok) return body;

  let form: FormData;
  try {
    form = await new Response(body.data, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return fail('bad_json', 'The multipart body could not be read.');
  }

  const payloadField = form.get('payload');
  const payloadText = typeof payloadField === 'string' ? payloadField : payloadField ? await payloadField.text() : null;
  if (payloadText === null) return fail('schema', 'The "payload" field is missing.');
  const raw = parseJson(payloadText);
  if (!raw.ok) return raw;
  const parsed = validate(briefSchema, raw.data);
  if (!parsed.ok) return parsed;
  const b = parsed.data;

  const pdfField = form.get('pdf');
  const pdfFile = pdfField && typeof pdfField !== 'string' ? pdfField : null;
  const shape = checkBriefShape(b, pdfFile !== null);
  if (shape) return shape;

  let pdfPath: string | null = null;
  if (pdfFile && b.pdf) {
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    const actual = await sha256Hex(bytes);
    const pdfProblem = checkPdf(bytes, pdfFile.type, b.pdf, actual);
    if (pdfProblem) return pdfProblem;
    pdfPath = `${b.date}/${actual}.pdf`;
    const upload = await ctx.db.storage.from(BUCKET).upload(pdfPath, bytes, { contentType: 'application/pdf', upsert: true });
    if (upload.error) throw new Error('PDF upload failed');
  }

  const warnings = scanBannedPhrases(briefTexts(b));
  const { data, error } = await ctx.db.rpc('box_upsert_brief', {
    p: {
      date: b.date,
      edition: b.edition,
      title: b.title,
      released_at: b.released_at,
      word_count: b.word_count,
      run_id: b.run_id,
      sections: b.sections,
      watchlist: b.watchlist,
      warnings,
      pdf_path: pdfPath,
      pdf_sha256: b.pdf?.sha256 ?? null,
      pdf_bytes: b.pdf?.bytes ?? null,
    },
  });
  if (error) return dbFailure(error);
  const result = data as { inserted: number; updated: number };
  return { ok: true, runId: b.run_id, counts: { received: 1, inserted: result.inserted, updated: result.updated, warnings } };
});
