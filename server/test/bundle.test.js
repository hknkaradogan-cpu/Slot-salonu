// Supabase'e yüklenen tek dosyalık sunucu paketini, başlatıcının yaptığı gibi yükleyip uçtan uca dener
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { PGlite } from '@electric-sql/pglite';
import SCHEMA from '../src/schema.sql.js';

test('server-bundle.js: Function+require ile yüklenir, kurulum/kayıt/spin/yönetici çalışır', async () => {
  const code = fs.readFileSync(new URL('../dist/server-bundle.js', import.meta.url), 'utf8');
  const mods = { 'node:crypto': crypto, 'node:buffer': { Buffer } };
  const S = new Function('require', code + '\n;return SlotServer;')((m) => mods[m]);
  const pg = new PGlite(undefined, { parsers: { 20: (v) => Number(v) } }); await pg.exec(SCHEMA);
  const tokenHash = crypto.createHash('sha256').update('SS-TEST').digest('hex');
  await pg.query("INSERT INTO slot.server_config VALUES ('APP_SECRET','x'),('SETUP_TOKEN_SHA256',$1)", [tokenHash]);
  let chain = Promise.resolve();
  const fakePostgres = () => ({
    unsafe: async (t, p) => (await pg.query(t, p)).rows,
    begin: (fn) => { const run = chain.then(() => pg.transaction((tx) => fn({ unsafe: async (t, p) => (await tx.query(t, p)).rows }))); chain = run.catch(() => {}); return run; },
    end: async () => {},
  });
  const app = await S.start({ postgres: fakePostgres, env: (k) => '', SB_URL: 'http://x', SB_KEY: 'k', verifyCi: async () => { throw new Error('no'); } });
  const call = async (m, p, b, t) => { const r = await app.handle(new Request('http://x/functions/v1/slot-api' + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }), '1.1.1.1'); return { status: r.status, body: await r.json() }; };
  assert.equal((await call('GET', '/api/setup/status')).body.needsSetup, true);
  const adm = await call('POST', '/api/setup/admin', { setupToken: 'SS-TEST', email: 'a@b.com', username: 'patron', password: 'Admin12345' });
  assert.equal(adm.status, 200, JSON.stringify(adm.body));
  const p = await call('POST', '/api/auth/register', { email: 'p@b.com', username: 'oyuncu', password: 'Sifre1234' }); assert.equal(p.status, 200);
  const s = await call('POST', '/api/spin', { game: 'zeus', bet: 1000 }, p.body.token); assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await call('GET', '/api/admin/games', null, p.body.token)).status, 403);
  assert.equal((await call('GET', '/api/admin/games', null, adm.body.token)).body.games.length, 7);
  assert.equal((await call('GET', '/api/release/signing')).status, 403);
});
