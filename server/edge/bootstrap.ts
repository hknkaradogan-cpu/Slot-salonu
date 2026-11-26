// SLOT SALONU — Supabase başlatıcı fonksiyonu (bir kez kurulur).
// Asıl sunucu kodunu "slot-server" deposundan yükler. Yeni sunucu kodu yalnızca GitHub Actions
// tarafından (OIDC kimliğiyle, depodaki main dalından) yüklenebilir; sunucu kendini otomatik günceller.
import postgres from 'npm:postgres@3.4.5';
import * as jose from 'npm:jose@5.9.6';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const env = (k: string) => Deno.env.get(k) ?? '';
const SB_URL = env('SUPABASE_URL'), SB_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const JWKS = jose.createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
const H = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
let sql: any = null;
const db = () => (sql ??= postgres(env('SUPABASE_DB_URL'), { max: 1, prepare: false }));

async function verifyCi(token: string) {
  if (!token) throw new Error('no token');
  const { payload } = await jose.jwtVerify(token, JWKS, { issuer: 'https://token.actions.githubusercontent.com', audience: 'slot-salonu-release' });
  const [row] = await db()`SELECT value FROM slot.server_config WHERE key = 'CI_REPOSITORY'`;
  if (!row || String(payload.repository).toLowerCase() !== String(row.value).toLowerCase() || payload.ref !== 'refs/heads/main') throw new Error('repo');
  return payload;
}
const bearer = (req: Request) => { const h = req.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };

let app: any = null, loading: Promise<any> | null = null;
async function load() {
  const r = await fetch(`${SB_URL}/storage/v1/object/slot-server/bundle.js`, { headers: { Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error('bundle ' + r.status);
  const code = await r.text();
  const mods: Record<string, unknown> = { 'node:crypto': crypto, 'node:buffer': { Buffer } };
  const factory = new Function('require', code + '\n;return SlotServer;');
  const S = factory((m: string) => { if (m in mods) return mods[m]; throw new Error('modül yok: ' + m); });
  return S.start({ postgres, jose, env, SB_URL, SB_KEY, verifyCi });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (url.pathname.endsWith('/ci/ping')) return json({ ok: true, loaded: !!app });
  if (url.pathname.endsWith('/ci/server-bundle') && req.method === 'POST') {
    try { await verifyCi(bearer(req)); } catch { return json({ error: 'forbidden' }, 403); }
    const body = new Uint8Array(await req.arrayBuffer());
    const r = await fetch(`${SB_URL}/storage/v1/object/slot-server/bundle.js`, { method: 'POST', headers: { Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/javascript', 'x-upsert': 'true' }, body });
    if (!r.ok) return json({ error: 'storage', detail: await r.text() }, 500);
    app = null; loading = null;
    try { app = await load(); return json({ ok: true, bytes: body.length }); } catch (e) { return json({ error: 'load_failed', detail: String(e) }, 500); }
  }
  try {
    if (!app) { loading ??= load(); app = await loading; }
    return await app.handle(req, req.headers.get('x-forwarded-for')?.split(',')[0]?.trim());
  } catch (e) {
    loading = null; app = null; console.error(e);
    return json({ error: 'server_unavailable', message: 'Sunucu şu anda başlatılıyor veya güncelleniyor. Lütfen birkaç saniye sonra tekrar deneyin.' }, 503);
  }
});
