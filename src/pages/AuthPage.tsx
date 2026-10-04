import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BrandMark } from '@/components/layout/BrandMark';

type Mode = 'signin' | 'signup';

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password don’t match an account.';
  if (m.includes('already registered') || m.includes('already exists')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('password')) return 'Password must be at least 8 characters.';
  if (m.includes('fetch') || m.includes('network')) return 'We couldn’t reach the server. Check your connection.';
  return 'Something went wrong. Please try again.';
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
    setBusy(false);
    if (result.error) setError(friendlyError(result.error.message));
  };

  const inputClass =
    'mt-1 block w-full rounded-md border border-rule bg-white px-3 py-2.5 text-sm text-navy placeholder:text-muted/70 transition-colors focus:border-gold';

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, #D4AF37 0 1px, transparent 1px 22px)' }}
        />
        <div className="relative">
          <BrandMark />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold text-white">Your grain position, in pounds, every morning.</h1>
          <p className="mt-4 text-base text-white/75">
            Stock, contracts and quotes across every merchant, with market moves translated into what they mean for your farm.
          </p>
        </div>
        <p className="relative text-xs text-white/50">Prototype. All farm and market figures are synthetic test data.</p>
      </div>

      <div className="flex items-center justify-center bg-cream px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 rounded-lg bg-navy p-4 lg:hidden">
            <BrandMark compact />
          </div>
          <h2 className="text-2xl font-bold">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
          <p className="mt-2 text-sm text-muted">
            {mode === 'signin'
              ? 'Welcome back to the desk.'
              : 'You’ll start with Downland Farm, a demo farm filled with test data.'}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-md border border-rule bg-card p-1 text-sm font-medium">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded px-3 py-2 transition-colors ${mode === m ? 'bg-navy text-white' : 'text-muted hover:text-navy'}`}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <label className="block text-sm font-medium text-navy">
                Your name
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
              </label>
            )}
            <label className="block text-sm font-medium text-navy">
              Email
              <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="block text-sm font-medium text-navy">
              Password
              <input
                type="password"
                required
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-lighter disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
