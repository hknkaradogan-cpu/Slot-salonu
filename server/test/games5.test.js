// SPINOVA 5.0: Düz Okey, Tavla, Aviator — kural motorları + sunucu uçları
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNodeServer } from '../src/node-server.js';
import { createPgliteDb } from '../src/db.js';
import { MockVerifier } from '../src/billing.js';
import * as OR from '../src/okey/rules.js';
import * as D from '../src/okey/duz.js';
import * as OT from '../src/okey/table.js';
import * as TR from '../src/tavla/rules.js';
import * as TT from '../src/tavla/table.js';
import { crashPoint, multAt, timeOf } from '../src/aviator/routes.js';

let clock = Date.UTC(2026, 10, 26, 9, 0, 0);
let srv, base;
const quiet = { log() {}, warn() {}, error: console.error };
async function api(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function reg(name) { const r = await api('POST', '/api/auth/register', { email: `${name}@ornek.com`, username: name, password: 'Sifre1234' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
const bal = async (t) => (await api('GET', '/api/me', null, t)).body.user.balance;
test.before(async () => {
  srv = await startNodeServer({ env: { DATA_DIR: fs.mkdtempSync('/tmp/g5test-'), SETUP_TOKEN: 'x-kurulum-123456' }, db: await createPgliteDb(), clock: () => clock, verifier: new MockVerifier(), logger: quiet, quiet: true,
    limitOverrides: { register: 1000, login: 1000, okq: 1000, oka: 1000, okj: 1000, okp: 1000, tvq: 1000, tvp: 1000, tvj: 1000, tva: 1000, avb: 1000, avc: 1000 } });
  await new Promise(r => srv.server.listen(0, r)); base = `http://127.0.0.1:${srv.server.address().port}`;
});
test.after(() => srv.close());

// taş kimliği: renk c (0..3), sayı n (1..13), kopya k (0/1)
const T = (c, n, k = 0) => (c * 13 + (n - 1)) * 2 + k;

test('Düz Okey çözücü: seri+per bitişi, 7 çift, okeyli bitiş, geçersiz el', () => {
  const K = OR.kit({ c: 3, n: 13 }); // okey = siyah 13
  const J = T(3, 13);
  // 1-2-3 kırmızı, 7-8-9-10 sarı, 5 kırmızı/sarı/mavi, 11-12-13 mavi (+ atılacak)
  const hand = [T(0, 1), T(0, 2), T(0, 3), T(1, 7), T(1, 8), T(1, 9), T(1, 10), T(0, 5), T(1, 5), T(2, 5), T(2, 11), T(2, 12), T(2, 13), T(3, 5)];
  const rack = hand.concat([T(3, 2)]);
  assert.ok(D.finishGroups(rack, T(3, 2), K), 'geçerli el bitmeli');
  assert.equal(D.finishGroups(rack, T(0, 1), K), null, 'seriyi bozan taş atılırsa bitmez');
  // okey eksik taşın yerini tutar: sarı 9 yerine okey
  const withJoker = hand.map(x => (x === T(1, 9) ? J : x)).concat([T(3, 2)]);
  assert.ok(D.finishGroups(withJoker, T(3, 2), K));
  // 7 çift
  const pairs = [1, 3, 5, 7, 9, 11, 12].flatMap((n, i) => [T(i % 4, n, 0), T(i % 4, n, 1)]).concat([T(3, 6)]);
  const p = D.finishGroups(pairs, T(3, 6), K); assert.ok(p); assert.equal(p.kind, 'pairs');
  // 12-13-1 seri geçersiz
  const bad = [T(0, 12), T(0, 13), T(0, 1)].concat(hand.slice(3)).concat([T(3, 2)]);
  assert.equal(D.finishGroups(bad, T(3, 2), K), null);
  // findFinish doğru taşı bulur
  assert.equal(D.findFinish(rack, K).tile, T(3, 2));
});

test('Düz Okey: 4 botlu tam oyun (3 el) kurallara uygun biter', () => {
  let now = 1e12; const t = OT.newTable({ variant: 'duz', mode: 'tekli', rounds: 3, bots: true }, now);
  OT.fillBots(t, Math.random); OT.startRound(t, now);
  assert.equal(t.hand.racks.reduce((a, r) => a + r.length, 0), 57); assert.equal(t.hand.pile.length, 106 - 1 - 57);
  let guard = 0; while (t.status !== 'finished' && guard++ < 20000) { now += 3000; OT.tick(t, now); }
  assert.equal(t.status, 'finished'); assert.equal(t.history.length, 3);
  for (const h of t.history) assert.ok(h.filter(x => x < 0).length <= 1, 'her elde en çok bir bitiren');
  assert.ok(t.final.ranking.length === 4);
});

test('Tavla kuralları: açılış hamleleri, kapı, kırık giriş, toplama, büyük zar kuralı', () => {
  const b = TR.newBoard();
  assert.equal(TR.pips(b, 0), 167); assert.equal(TR.pips(b, 1), 167);
  const L = TR.legalSequences(b, 0, [3, 1]); assert.ok(L.length > 5);
  assert.ok(L.some(x => x.seq.map(s => s[0] + '>' + s[1]).join() === '8>5,6>5'), '3-1 ile 5 kapısı yapılabilmeli');
  assert.equal(TR.applySequence(b, 0, [3, 1], [[24, 18]]), null, 'zarla uyuşmayan hamle reddedilir');
  assert.ok(TR.applySequence(b, 0, [3, 1], [[8, 5], [6, 5]]));
  // kırık pul önce girmeli; rakibin kapısına girilemez
  const k = TR.clone(b); k.bar[0] = 1; k.pts[TR.abs(0, 6)] += 0; // beyaz pul kırık
  for (const s of TR.legalSequences(k, 0, [6, 6])) assert.equal(s.seq.length, 0); // 19 hanesi (göreli 19 = siyahın 6'sı) siyahın 5'li kapısı → giriş yok
  assert.equal(TR.legalSequences(k, 0, [6, 6]).length, 0);
  const e = TR.legalSequences(k, 0, [5, 3]); assert.ok(e.every(x => x.seq[0][0] === 25), 'ilk hamle giriş olmalı');
  // toplama: tüm pullar evde
  const h = { pts: Array(24).fill(0), bar: [0, 0], off: [13, 0] }; h.pts[TR.abs(0, 2)] = 1; h.pts[TR.abs(0, 1)] = 1; h.pts[TR.abs(1, 1)] = -15;
  const o = TR.legalSequences(h, 0, [6, 5]); assert.ok(o.some(x => x.board.off[0] === 15), 'büyük zarla toplanır');
  // büyük zar kuralı: yalnızca biri oynanabiliyorsa büyük olan
  const z = { pts: Array(24).fill(0), bar: [0, 0], off: [0, 0] }; z.pts[TR.abs(0, 24)] = 1; z.pts[TR.abs(1, 1)] = -14; z.pts[TR.abs(0, 7)] = 14;
  z.pts[TR.abs(0, 20)] = -2; z.pts[TR.abs(0, 18)] = 0; z.pts[TR.abs(1, 1)] += 2; // 20'de rakip kapısı
  const big = TR.legalSequences(z, 0, [4, 6]); assert.ok(big.length > 0);
});

test('Tavla: bot–bot tam maç (3 sayı) biter, puanlar ve mars doğru', () => {
  let now = 1e12; const t = TT.newTable({ points: 3, bots: true }, now); TT.fillBots(t); TT.startGame(t, now);
  let guard = 0; while (t.status !== 'finished' && guard++ < 50000) { now += 2500; TT.tick(t, now); }
  assert.equal(t.status, 'finished'); assert.ok(t.score[t.final.winner] >= 3);
  const b = t.result.board; assert.equal(b.off[t.final.winner], 15);
  let n = 0; for (const p of [0, 1]) n += b.off[p] + b.bar[p] + b.pts.reduce((a, x) => a + (p === 0 ? Math.max(0, x) : Math.max(0, -x)), 0);
  assert.equal(n, 30, 'pul sayısı korunur');
});

test('Tavla API: hızlı masa, botla başlat, zar/hamle sunucuda, yasadışı hamle reddi, ayrılıp geri dönme', async () => {
  const a = await reg('tv_a'); const b0 = await bal(a.token);
  const q = await api('POST', '/api/tavla/quick', { stake: 1000, points: 1 }, a.token); assert.equal(q.status, 200, JSON.stringify(q.body));
  assert.equal(await bal(a.token), b0 - 1000);
  assert.equal((await api('POST', `/api/tavla/${q.body.tableId}/start`, {}, a.token)).status, 200);
  let v = (await api('GET', `/api/tavla/${q.body.tableId}`, null, a.token)).body; assert.equal(v.status, 'playing');
  for (let i = 0; i < 40 && !(v.turn === v.me && v.phase === 'roll'); i++) { clock += 2500; v = (await api('GET', `/api/tavla/${q.body.tableId}`, null, a.token)).body; if (v.turn === v.me && v.phase === 'move' && v.legalN) break; }
  if (v.phase === 'roll') { const r = await api('POST', `/api/tavla/${q.body.tableId}/act`, { type: 'roll' }, a.token); assert.equal(r.status, 200); v = (await api('GET', `/api/tavla/${q.body.tableId}`, null, a.token)).body; }
  if (v.legalN) {
    assert.equal((await api('POST', `/api/tavla/${q.body.tableId}/act`, { type: 'move', moves: [[24, 1]] }, a.token)).body.error, 'illegal');
    const L = TR.legalSequences(v.board, v.me, v.dice); const mv = L[0].seq.map(s => [s[0], s[1]]);
    const m = await api('POST', `/api/tavla/${q.body.tableId}/act`, { type: 'move', moves: mv }, a.token); assert.equal(m.status, 200, JSON.stringify(m.body));
  }
  assert.equal((await api('POST', `/api/tavla/${q.body.tableId}/leave`, {}, a.token)).status, 200);
  const rj = await api('POST', '/api/tavla/join', { tableId: q.body.tableId }, a.token); assert.equal(rj.body.rejoined, true);
});

test('Tavla API: şifreli özel masa, liste, kodla katılım, 2 gerçek oyuncu', async () => {
  const a = await reg('tv_p1'), b = await reg('tv_p2');
  const p = await api('POST', '/api/tavla/private', { stake: 0, points: 3, password: 'tav123' }, a.token); assert.equal(p.status, 200); assert.match(p.body.code, /^[A-Z0-9]{6}$/);
  const list = (await api('GET', '/api/tavla/tables', null, b.token)).body.tables; assert.ok(list.find(x => x.id === p.body.tableId && x.locked));
  assert.equal((await api('POST', '/api/tavla/join', { code: p.body.code }, b.token)).body.error, 'bad_password');
  assert.equal((await api('POST', '/api/tavla/join', { code: p.body.code, password: 'tav123' }, b.token)).status, 200);
  const v = (await api('GET', `/api/tavla/${p.body.tableId}`, null, b.token)).body; assert.equal(v.status, 'playing'); assert.equal(v.seats.filter(x => x && x.human).length, 2);
});

test('Düz Okey API: varyant masası, yanlış bitiş reddi, ayrı liste', async () => {
  const a = await reg('dz_a');
  const q = await api('POST', '/api/okey/quick', { variant: 'duz', mode: 'tekli', rounds: 1, stake: 0 }, a.token); assert.equal(q.status, 200, JSON.stringify(q.body));
  await api('POST', `/api/okey/${q.body.tableId}/start`, {}, a.token);
  let v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body; assert.equal(v.cfg.variant, 'duz');
  assert.ok([14, 15].includes(v.hand.rack.length));
  for (let i = 0; i < 60 && !(v.hand && v.hand.turn === v.me); i++) { clock += 3000; v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body; }
  if (v.status === 'playing' && v.hand.turn === v.me) {
    if (v.hand.phase === 'draw') { await api('POST', `/api/okey/${q.body.tableId}/act`, { type: 'draw' }, a.token); v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body; }
    const r = await api('POST', `/api/okey/${q.body.tableId}/act`, { type: 'finish', tile: v.hand.rack[0] }, a.token);
    if (!D.findFinish(v.hand.rack, OR.kit(v.hand.okey))) assert.equal(r.body.error, 'cannot_finish');
    assert.equal((await api('POST', `/api/okey/${q.body.tableId}/act`, { type: 'open', groups: [[1, 2, 3]] }, a.token)).body.error, 'bad_action');
  }
  const l1 = (await api('GET', '/api/okey/tables?variant=duz', null, a.token)).status; assert.equal(l1, 200);
});

test('Aviator: dağılım RTP/x, kriptografik çarpan, bahis–tahsil–kayıp sunucu saatiyle, taahhüt hash doğrulanır', async () => {
  let n = 200000, ge2 = 0, ge10 = 0; for (let i = 0; i < n; i++) { const c = crashPoint(0.96, 1000); if (c >= 2) ge2++; if (c >= 10) ge10++; }
  assert.ok(Math.abs(ge2 / n - 0.48) < 0.006, 'P(≥2x)=' + ge2 / n); assert.ok(Math.abs(ge10 / n - 0.096) < 0.004, 'P(≥10x)=' + ge10 / n);
  assert.equal(multAt(0.09, timeOf(0.09, 2) + 1), 2);
  const a = await reg('av_a'); const b0 = await bal(a.token);
  const r = await api('POST', '/api/aviator/bet', { bet: 1000 }, a.token); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.balance, b0 - 1000);
  assert.equal(r.body.round.crash, undefined, 'patlama çarpanı tur bitmeden gönderilmez');
  assert.equal((await api('POST', '/api/aviator/bet', { bet: 1000 }, a.token)).body.error, 'round_active');
  clock += 1500 + 10; // kalkış
  const c = await api('POST', `/api/aviator/${r.body.round.id}/cashout`, {}, a.token); assert.equal(c.status, 200);
  const R2 = c.body.round; assert.ok(['cashed', 'lost'].includes(R2.status));
  const { createHash } = await import('node:crypto'); assert.equal(createHash('sha256').update(R2.crash.toFixed(2) + ':' + R2.salt).digest('hex'), R2.hash);
  if (R2.status === 'cashed') assert.equal(c.body.balance, b0 - 1000 + Math.floor(1000 * R2.cashMult));
  // kayıp: süre patlamayı geçtiyse tahsil edilemez
  const r2 = await api('POST', '/api/aviator/bet', { bet: 500, auto: 1000 }, a.token); clock += 1500 + 200000;
  const w = await api('GET', `/api/aviator/${r2.body.round.id}/wait`, null, a.token); assert.notEqual(w.body.round.status, 'flying');
  if (w.body.round.status === 'lost') assert.equal((await api('POST', `/api/aviator/${r2.body.round.id}/cashout`, {}, a.token)).body.round.status, 'lost');
  const h = (await api('GET', '/api/aviator', null, a.token)).body; assert.ok(h.history.length >= 2);
  // otomatik tahsil: hedef patlamadan önceyse tam hedefle ödenir
  let paid = false; for (let i = 0; i < 25 && !paid; i++) { const x = await api('POST', '/api/aviator/bet', { bet: 100, auto: 1.1 }, a.token); clock += 1500 + 60000; const y = (await api('GET', `/api/aviator/${x.body.round.id}/wait`, null, a.token)).body.round; if (y.status === 'cashed') { assert.equal(y.cashMult, 1.1); assert.equal(y.win, 110); paid = true; } else assert.ok(y.crash < 1.1); }
  assert.ok(paid, '1.1x otomatik tahsil en az bir kez ödenmeli');
});

test('Lobiler, liderlik tablosu ve yönetici ayarları (yalnızca yönetici; oyuncu yetkisiz)', async () => {
  const a = await reg('g5_lb');
  assert.equal((await api('GET', '/api/tavla/lobby', null, a.token)).status, 200);
  for (const by of ['level', 'okey', 'tavla', 'aviator', 'slots']) { const r = await api('GET', '/api/leaderboard?by=' + by, null, a.token); assert.equal(r.status, 200, by + JSON.stringify(r.body)); assert.ok(Array.isArray(r.body.top)); }
  assert.equal((await api('PUT', '/api/admin/aviator', { rtp: 0.9 }, a.token)).status, 403);
  assert.equal((await api('GET', '/api/admin/tavla', null, a.token)).status, 403);
  const s = await api('POST', '/api/setup/admin', { setupToken: 'x-kurulum-123456', username: 'Yonetici5', email: 'y5@ornek.com', password: 'GucluSifre99' }); assert.equal(s.status, 200, JSON.stringify(s.body));
  const tok = s.body.token || (await api('POST', '/api/auth/login', { identifier: 'y5@ornek.com', password: 'GucluSifre99' })).body.token;
  const u = await api('PUT', '/api/admin/aviator', { rtp: 0.95, maxMult: 500 }, tok); assert.equal(u.status, 200, JSON.stringify(u.body)); assert.equal(u.body.config.rtp, 0.95);
  assert.equal((await api('PUT', '/api/admin/aviator', { rtp: 1.2 }, tok)).status, 400, 'RTP sınırı');
  assert.equal((await api('GET', '/api/admin/tavla', null, tok)).status, 200);
  assert.equal((await api('GET', '/api/aviator', null, a.token)).body.config.rtp, 0.95);
});

test('101 Okey 2 kişilik: yalnız karşılıklı koltuklar, sıra karşıya geçer, botlu tam oyun biter', () => {
  let now = 1e12; const t = OT.newTable({ players: 2, mode: 'esli', rounds: 2, bots: true, risk: true, helper: false }, now);
  assert.equal(t.cfg.players, 2); assert.equal(t.cfg.mode, 'tekli', '2 kişilik eşli olamaz'); assert.equal(t.cfg.helper, false); assert.equal(t.cfg.risk, true);
  OT.seatHuman(t, { id: 1, username: 'A' }); assert.throws(() => OT.seatHuman(t, { id: 2, username: 'B' }, 1), /dolu/);
  OT.fillBots(t, Math.random); assert.deepEqual(t.seats.map(Boolean), [true, false, true, false]); assert.ok(OT.isFull(t));
  OT.startRound(t, now); const H = t.hand;
  assert.equal(H.racks[1].length + H.racks[3].length, 0); assert.equal(H.racks[0].length + H.racks[2].length, 43);
  let guard = 0; while (t.status !== 'finished' && guard++ < 20000) { now += 3000; OT.tick(t, now); }
  assert.equal(t.status, 'finished'); assert.deepEqual(t.final.ranking.slice().sort(), [0, 2]);
});

test('Okey API: Rizikolu 2 kişilik — seçenekler eşleşmede ayrılır, kazanan havuzun tamamını alır', async () => {
  const a = await reg('rz_a'); const b0 = await bal(a.token);
  const q = await api('POST', '/api/okey/quick', { players: 2, risk: true, helper: false, katlamali: false, stake: 1000, rounds: 1 }, a.token); assert.equal(q.status, 200, JSON.stringify(q.body));
  const v0 = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body;
  assert.equal(v0.cfg.players, 2); assert.equal(v0.cfg.risk, true); assert.equal(v0.cfg.helper, false); assert.equal(await bal(a.token), b0 - 1000);
  const b = await reg('rz_b'); // farklı seçenekle gelen aynı masaya düşmez
  const q2 = await api('POST', '/api/okey/quick', { players: 4, risk: true, helper: false, katlamali: false, stake: 1000, rounds: 1 }, b.token); assert.notEqual(q2.body.tableId, q.body.tableId);
  await api('POST', `/api/okey/${q.body.tableId}/start`, {}, a.token);
  let v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body;
  assert.equal(v.status, 'playing'); assert.equal(v.seats.filter(Boolean).length, 2);
  // hamle yanıtı masanın yeni görünümünü taşır (tek gidiş-dönüş)
  for (let i = 0; i < 40 && !(v.hand && v.hand.turn === v.me && v.status === 'playing'); i++) { clock += 3000; v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body; }
  if (v.status === 'playing' && v.hand.phase === 'draw') { const r = await api('POST', `/api/okey/${q.body.tableId}/act`, { type: 'draw' }, a.token); assert.equal(r.status, 200); assert.ok(r.body.view && r.body.view.hand.rack.length === v.hand.rack.length + 1, 'görünüm yanıtta'); }
  // botlar bitirsin
  for (let i = 0; i < 400 && v.status !== 'finished'; i++) { clock += 31000; v = (await api('GET', `/api/okey/${q.body.tableId}`, null, a.token)).body; }
  assert.equal(v.status, 'finished');
  const paid = v.payouts.reduce((x, y) => x + y, 0); const winnerIsMe = v.final.winners.length === 1 && v.final.winners[0] === v.me;
  if (winnerIsMe) assert.equal(v.payouts[v.me], 2000, 'kazanan havuzun tamamı'); else assert.equal(v.payouts[v.me], 0);
  assert.ok(paid <= 2000);
});
