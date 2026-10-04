import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFarm } from '@/farm/FarmProvider';

const BUCKET = 'farm-documents';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];
const DOC_TYPES = { contract: 'Contract', quote: 'Quote', settlement: 'Settlement', other: 'Other' } as const;
type DocType = keyof typeof DOC_TYPES;

interface DocumentRow {
  id: string;
  file_path: string;
  file_name: string;
  doc_type: DocType;
  size_bytes: number;
  status: string;
  created_at: string;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const { farm } = useFarm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [docType, setDocType] = useState<DocType>('contract');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!farm) return;
    const { data, error: err } = await supabase
      .from('documents')
      .select('id, file_path, file_name, doc_type, size_bytes, status, created_at')
      .eq('farm_id', farm.id)
      .order('created_at', { ascending: false });
    if (err) setError('We couldn’t load your documents. Refresh the page to try again.');
    else setDocs((data ?? []) as DocumentRow[]);
  }, [farm]);

  useEffect(() => {
    document.title = 'Documents · Grain Desk';
    load();
  }, [load]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !farm) return;
    setError(null);
    if (!ALLOWED.includes(file.type)) return setError('Please choose a PDF, PNG or JPEG file.');
    if (file.size > MAX_BYTES) return setError('That file is larger than 10 MB.');

    setBusy(true);
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
    const path = `${farm.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (upErr) {
      setBusy(false);
      return setError('The upload didn’t go through. Please try again.');
    }
    const { error: rowErr } = await supabase.from('documents').insert({
      farm_id: farm.id,
      file_path: path,
      file_name: file.name.slice(0, 200),
      doc_type: docType,
      size_bytes: file.size,
    });
    if (rowErr) {
      await supabase.storage.from(BUCKET).remove([path]);
      setError('The upload didn’t go through. Please try again.');
    }
    setBusy(false);
    await load();
  };

  const download = async (doc: DocumentRow) => {
    const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60);
    if (err || !data?.signedUrl) return setError('We couldn’t open that file. Please try again.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const remove = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
    const { error: err } = await supabase.from('documents').delete().eq('id', doc.id);
    if (err) return setError('That file couldn’t be deleted. Please try again.');
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
    await load();
  };

  return (
    <section className="animate-fade-up">
      <div className="flex items-start gap-4 border-b border-rule pb-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-rule bg-card text-gold-deep shadow-card sm:flex">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Documents</h1>
          <p className="mt-2 max-w-2xl text-base text-ink">Keep contracts, quotes and settlement notes in one private place for your farm.</p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-navy/30 bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block font-medium text-navy">Document type</span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
              className="mt-1 rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink focus:border-navy focus:outline-none"
            >
              {Object.entries(DOC_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-lighter disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Uploading…' : 'Upload file'}
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={onFile} />
          <p className="text-xs text-muted">PDF, PNG or JPEG, up to 10 MB. Only members of your farm can see these.</p>
        </div>
        <p className="mt-4 rounded-md bg-cream px-3 py-2 text-xs text-ink">
          Automatic checking of contract terms against your position will switch on once the desk’s AI service is connected. Until then files are stored safely and marked “Stored”.
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {!docs ? (
        !error && <div className="mt-6 h-40 animate-pulse rounded-lg bg-rule/40" aria-hidden="true" />
      ) : docs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-rule bg-card p-8 text-center text-sm text-muted">No documents yet. Upload your first contract above.</p>
      ) : (
        <ul className="mt-6 divide-y divide-rule rounded-lg border border-rule bg-card shadow-card">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-4 p-4">
              <FileText className="h-5 w-5 shrink-0 text-gold-deep" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy">{d.file_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {DOC_TYPES[d.doc_type]} · {formatSize(d.size_bytes)} · {format(parseISO(d.created_at), 'd MMM yyyy')}
                </p>
              </div>
              <span className="rounded-full border border-rule bg-cream px-2 py-0.5 text-xs text-muted">
                {d.status === 'uploaded' ? 'Stored' : d.status}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => download(d)} aria-label="Open file" title="Open" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-cream hover:text-navy">
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => remove(d)} aria-label="Delete file" title="Delete" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-red-50 hover:text-red-800">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
