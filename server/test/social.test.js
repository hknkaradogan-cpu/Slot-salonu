import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNodeServer } from '../src/node-server.js';
import { createPgliteDb } from '../src/db.js';
import { MockVerifier } from '../src/billing.js';
import { puzzleReplay } from '../src/social.js';

let clock = Date.UTC(2026, 10, 26, 9, 0, 0);
let srv, base;
const quiet = { log() {}, warn() {}, error: console.error };
async function api(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function reg(name, ref) { const r = await api('POST', '/api/auth/register', { email: `${name}@ornek.com`, username: name, password: 'Sifre1234', ref }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
const me = async (t) => (await api('GET', '/api/me', null, t)).body;
test.before(async () => {
  srv = await startNodeServer({ env: { DATA_DIR: fs.mkdtempSync('/tmp/soctest-'), SETUP_TOKEN: 'x-kurulum-123456' }, db: await createPgliteDb(), clock: () => clock, verifier: new MockVerifier(), logger: quiet, quiet: true,
    limitOverrides: { register: 1000, login: 1000, okq: 1000, oka: 1000, okj: 1000, okp: 1000, oki: 1000, spin: 1000 } });
  await new Promise(r => srv.server.listen(0, r)); base = `http://127.0.0.1:${srv.server.address().port}`;
});
test.after(() => srv.close());

// 3x3 kaydırmalı bulmaca için BFS çözücü (test amaçlı): boşluğun gideceği konumların listesini döner
function solve(board, n) {
  const goal = board.map((_, i) => (i + 1) % (n * n)).join(','); const key = (b) => b.join(',');
  const q = [[board, []]], seen = new Set([key(board)]);
  while (q.length) { const [b, path] = q.shift(); if (key(b) === goal) return path; const e = b.indexOf(0), r = Math.floor(e / n), c = e % n;
    for (const m of [r > 0 && e - n, r < n - 1 && e + n, c > 0 && e - 1, c < n - 1 && e + 1]) { if (m === false) continue; const nb = b.slice(); nb[e] = nb[m]; nb[m] = 0; const k = key(nb); if (!seen.has(k)) { seen.add(k); q.push([nb, [...path, m]]); } } }
  return null;
}

test('bilet, günlük ödül bileti, Şans Çarkı (ücretsiz → biletle), başarım ödülü', async () => {
  const a = await reg('soc_a'); assert.equal(a.user.tickets, 5);
  const d = await api('POST', '/api/daily/claim', {}, a.token); assert.equal(d.body.tickets, 1); assert.equal(d.body.ticketBalance, 6);
  const w1 = await api('POST', '/api/wheel/spin', {}, a.token); assert.equal(w1.status, 200); assert.equal(w1.body.paidWithTicket, false);
  assert.equal((await api('POST', '/api/wheel/spin', {}, a.token)).body.error, 'not_free');
  const w2 = await api('POST', '/api/wheel/spin', { useTicket: true }, a.token); assert.equal(w2.status, 200); assert.equal(w2.body.paidWithTicket, true);
  const m = await me(a.token); assert.ok(m.user.tickets >= 5);
  clock += 24 * 3600e3 + 1000; assert.equal((await api('GET', '/api/wheel', null, a.token)).body.freeAvailable, true);
  // başarım: 10 spin
  for (let i = 0; i < 10; i++) await api('POST', '/api/spin', { game: 'vegas', bet: 100 }, a.token);
  const ach = (await api('GET', '/api/achievements', null, a.token)).body.achievements; const s10 = ach.find(x => x.id === 'spin10'); assert.equal(s10.done, true);
  assert.equal((await api('POST', '/api/achievements/spin100/claim', {}, a.token)).body.error, 'not_done');
  const c = await api('POST', '/api/achievements/spin10/claim', {}, a.token); assert.equal(c.body.coins, 2000);
  assert.equal((await api('POST', '/api/achievements/spin10/claim', {}, a.token)).body.error, 'claimed');
  const st = (await api('GET', '/api/me/stats', null, a.token)).body.stats; assert.equal(st.spins, 10); assert.equal(st.wheelSpins, 2);
});

test('Bulmaca: sunucu hamleleri yeniden oynatır, sahte çözüm reddedilir, gerçek çözüm ödül alır', async () => {
  const a = await reg('soc_pz');
  const p = (await api('POST', '/api/puzzle/start', { size: 3 }, a.token)).body; assert.equal(p.board.length, 9);
  assert.equal((await api('POST', `/api/puzzle/${p.id}/solve`, { moves: [] }, a.token)).body.error, 'not_solved');
  assert.equal((await api('POST', `/api/puzzle/${p.id}/solve`, { moves: [0, 8, 4] }, a.token)).body.error, 'not_solved'); // geçersiz hamle
  const path = solve(p.board, 3); assert.ok(path);
  const r = await api('POST', `/api/puzzle/${p.id}/solve`, { moves: path }, a.token); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.reward, 2000);
  assert.equal((await api('POST', `/api/puzzle/${p.id}/solve`, { moves: path }, a.token)).body.error, 'solved');
  const b = await reg('soc_pz2'); assert.equal((await api('POST', `/api/puzzle/${p.id}/solve`, { moves: path }, b.token)).status, 404); // başkasının bulmacası
  assert.equal(puzzleReplay([1, 2, 3, 4, 5, 6, 7, 8, 0], 3, [7]).join(','), '1,2,3,4,5,6,7,0,8');
});

test('Turnuva: günlük/haftalık oluşur, katılım (bilet), spin puanı, bitişte ödül ve bildirim', async () => {
  const a = await reg('soc_tr'), b = await reg('soc_tr2');
  const list = (await api('GET', '/api/tournaments', null, a.token)).body.tournaments;
  const daily = list.find(t => t.kind === 'daily' && t.game === 'slots'), weekly = list.find(t => t.kind === 'weekly' && t.game === 'slots');
  assert.ok(daily && weekly && list.some(t => t.game === 'okey'));
  assert.equal((await api('POST', `/api/tournaments/${daily.id}/join`, {}, a.token)).status, 200);
  assert.equal((await api('POST', `/api/tournaments/${daily.id}/join`, {}, a.token)).body.error, 'joined');
  const t0 = (await me(b.token)).user.tickets; assert.equal((await api('POST', `/api/tournaments/${weekly.id}/join`, {}, b.token)).status, 200); assert.equal((await me(b.token)).user.tickets, t0 - 1);
  await api('POST', `/api/tournaments/${daily.id}/join`, {}, b.token);
  let won = 0; for (let i = 0; i < 40 && !won; i++) { const s = await api('POST', '/api/spin', { game: 'altin', bet: 100 }, a.token); won += s.body.win || 0; }
  assert.ok(won > 0, 'en az bir kazanç');
  const lb = (await api('GET', `/api/tournaments/${daily.id}`, null, a.token)).body; assert.ok(lb.me.score > 0); assert.equal(lb.top[0].username, 'soc_tr');
  const before = (await me(a.token)).user.balance;
  clock += 2 * 86400e3; await api('GET', '/api/tournaments', null, a.token);
  const after = (await me(a.token)).user.balance; assert.ok(after > before, 'turnuva ödülü yattı');
  const n = (await api('GET', '/api/notifications', null, a.token)).body.notifications; assert.ok(n.some(x => x.kind === 'tournament'));
});

test('Mesaj (sadece arkadaş), canlı sohbet kuralları, bildirimler, çevrim içi arkadaş, arkadaş daveti bonusu', async () => {
  const a = await reg('soc_m1'), b = await reg('soc_m2'), c = await reg('soc_m3', 'soc_m1');
  assert.equal((await me(c.token)).user.tickets, 7); // 5 + davet bonusu 2
  const na = (await api('GET', '/api/notifications', null, a.token)).body.notifications; assert.ok(na.some(x => x.kind === 'referral'));
  assert.equal((await api('POST', `/api/messages/${b.user.id}`, { body: 'selam' }, a.token)).status, 403);
  await api('POST', '/api/friends/request', { username: 'soc_m2' }, a.token);
  assert.ok((await api('GET', '/api/notifications', null, b.token)).body.notifications.some(x => x.kind === 'friend'));
  await api('POST', '/api/friends/request', { username: 'soc_m1' }, b.token);
  assert.equal((await api('POST', `/api/messages/${b.user.id}`, { body: 'selam dostum' }, a.token)).status, 200);
  assert.equal((await me(b.token)).badges.messages, 1);
  const th = (await api('GET', `/api/messages/${a.user.id}`, null, b.token)).body; assert.equal(th.messages[0].body, 'selam dostum');
  assert.equal((await me(b.token)).badges.messages, 0);
  const fr = (await api('GET', '/api/friends', null, a.token)).body.friends; assert.equal(fr[0].online, true);
  assert.equal((await api('POST', '/api/chat', { body: 'herkese merhaba' }, a.token)).status, 200);
  assert.equal((await api('POST', '/api/chat', { body: 'tekrar' }, a.token)).status, 429);
  clock += 5000; assert.equal((await api('POST', '/api/chat', { body: 'bak https://x.com' }, a.token)).body.error, 'no_links');
  const ch = (await api('GET', '/api/chat', null, b.token)).body; assert.equal(ch.messages.at(-1).body, 'herkese merhaba');
  await api('POST', '/api/notifications/read', {}, b.token); assert.equal((await me(b.token)).badges.notifications, 0);
});

test('Yönetici: hediye (jeton+bilet+bildirim), turnuva oluştur/bitir, sohbet sil/sustur; oyuncu yetkisiz', async () => {
  const st = await api('POST', '/api/setup/admin', { setupToken: 'x-kurulum-123456', username: 'patron', email: 'patron@ornek.com', password: 'GucluSifre99' });
  const adm = st.body.token; const p = await reg('soc_gift');
  assert.equal((await api('POST', '/api/admin/gift', { userId: p.user.id, coins: 5000 }, p.token)).status, 403);
  const b0 = (await me(p.token)).user;
  assert.equal((await api('POST', '/api/admin/gift', { userId: p.user.id, coins: 5000, tickets: 3, message: 'Bayram hediyesi' }, adm)).status, 200);
  const b1 = (await me(p.token)).user; assert.equal(b1.balance, b0.balance + 5000); assert.equal(b1.tickets, b0.tickets + 3);
  const t = await api('POST', '/api/admin/tournaments', { title: 'Hafta Sonu Kupası', game: 'slots', hours: 2, prizes: [7000] }, adm); assert.equal(t.status, 200);
  await api('POST', `/api/tournaments/${t.body.id}/join`, {}, p.token);
  let w = 0; for (let i = 0; i < 40 && !w; i++) w += (await api('POST', '/api/spin', { game: 'altin', bet: 100 }, p.token)).body.win || 0;
  const bb = (await me(p.token)).user.balance;
  assert.equal((await api('POST', `/api/admin/tournaments/${t.body.id}/end`, {}, adm)).status, 200);
  assert.equal((await me(p.token)).user.balance, bb + 7000);
  const c = await api('POST', '/api/chat', { body: 'deneme' }, p.token);
  assert.equal((await api('DELETE', `/api/admin/chat/${c.body.id}`, null, adm)).status, 200);
  assert.ok(!(await api('GET', '/api/chat', null, p.token)).body.messages.some(x => x.id === c.body.id));
  await api('POST', `/api/admin/users/${p.user.id}/mute`, { minutes: 10 }, adm); clock += 5000;
  assert.equal((await api('POST', '/api/chat', { body: 'susturuldum mu' }, p.token)).body.error, 'muted');
});

test('101 Okey: şifreli özel masa, doluluk listesi, davet edilen şifresiz girer', async () => {
  const a = await reg('soc_ok1'), b = await reg('soc_ok2'), c = await reg('soc_ok3');
  await api('POST', '/api/friends/request', { username: 'soc_ok3' }, a.token); await api('POST', '/api/friends/request', { username: 'soc_ok1' }, c.token);
  const p = await api('POST', '/api/okey/private', { mode: 'tekli', stake: 0, rounds: 2, katlamali: false, password: 'gizli1' }, a.token); assert.equal(p.status, 200);
  assert.equal((await api('POST', '/api/okey/join', { code: p.body.code }, b.token)).body.error, 'bad_password');
  assert.equal((await api('POST', '/api/okey/join', { code: p.body.code, password: 'yanlis' }, b.token)).body.error, 'bad_password');
  assert.equal((await api('POST', '/api/okey/join', { code: p.body.code, password: 'gizli1' }, b.token)).status, 200);
  await api('POST', `/api/okey/${p.body.tableId}/invite`, { friendId: c.user.id }, a.token);
  assert.ok((await api('GET', '/api/notifications', null, c.token)).body.notifications.some(x => x.kind === 'okey_invite'));
  assert.equal((await api('POST', '/api/okey/join', { tableId: p.body.tableId }, c.token)).status, 200);
  const list = (await api('GET', '/api/okey/tables', null, b.token)).body.tables; const t = list.find(x => x.id === p.body.tableId);
  assert.equal(t.filled, 3); assert.equal(t.locked, true);
});
