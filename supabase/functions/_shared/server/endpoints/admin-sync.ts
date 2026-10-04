import { corsHeaders, serviceClient } from '../http.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Not signed in' });
    const db = serviceClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user?.email) return json(401, { error: 'Not signed in' });

    const allowed = (Deno.env.get('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = data.user.email.toLowerCase();

    // With no list configured, leave existing admins untouched rather than revoking everyone.
    if (allowed.length === 0) {
      const existing = await db.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (existing.error) throw new Error('Admin lookup failed');
      return json(200, { is_admin: Boolean(existing.data) });
    }
    const isAdmin = allowed.includes(email);

    const write = isAdmin
      ? await db.from('app_admins').upsert({ user_id: data.user.id, email }, { onConflict: 'user_id', ignoreDuplicates: true })
      : await db.from('app_admins').delete().eq('user_id', data.user.id);
    if (write.error) throw new Error('Admin list update failed');

    return json(200, { is_admin: isAdmin });
  } catch (err) {
    console.error('admin-sync failed', err instanceof Error ? err.message : 'unknown');
    return json(500, { error: 'Internal error' });
  }
});
