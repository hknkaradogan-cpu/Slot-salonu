import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNodeServer } from '../src/node-server.js';
import { createPgliteDb } from '../src/db.js';
import { MockVerifier } from '../src/billing.js';
import * as R from '../src/okey/rules.js';
import * as TB from '../src/okey/table.js';

/* ---------- yardımcı: taş kimliği ---------- */
const T_ = (c, n, copy = 0) => (c * 13 + (n - 1)) * 2 + copy; // c: 0 kırmızı 1 sarı 2 mavi 3 siyah
const KIRMIZI = 0, SARI = 1, MAVI = 2, SIYAH = 3;

test('kurallar: gösterge/okey, seriler (12-13-1 geçersiz), aynı sayılar, çiftler, sahte okey', () => {
  assert.deepEqual(R.okeyOf(T_(MAVI, 13)), { c: MAVI, n: 1 });
  const K = R.kit(R.okeyOf(T_(KIRMIZI, 4))); // okey = kırmızı 5
  const J = T_(KIRMIZI, 5);
  assert.ok(K.isJoker(J) && !K.isJoker(104)); assert.deepEqual(K.face(104), { c: KIRMIZI, n: 5 });
  assert.equal(R.analyze([T_(SARI, 1), T_(SARI, 2), T_(SARI, 3)], K).value, 6);
  assert.equal(R.analyze([T_(SARI, 12), T_(SARI, 13), T_(SARI, 1)], K), null);
  assert.equal(R.analyze([T_(SARI, 9), J, T_(SARI, 11)], K).value, 30);             // okey boşluğu doldurur
  assert.equal(R.analyze([T_(SARI, 7), T_(MAVI, 7), T_(SIYAH, 7)], K).value, 21);
  assert.equal(R.analyze([T_(SARI, 7), T_(SARI, 7, 1), T_(SIYAH, 7)], K), null);     // aynı renk iki kez olmaz
  assert.equal(R.analyze([T_(KIRMIZI, 4), 104, T_(KIRMIZI, 6)], K).value, 15);       // sahte okey = kırmızı 5
  assert.equal(R.analyze([T_(MAVI, 3), T_(MAVI, 3, 1)], K).kind, 'pair');
  assert.equal(R.analyze([T_(MAVI, 3), T_(MAVI, 4)], K), null);
  const run = { kind: 'run', tiles: R.analyze([T_(SARI, 4), T_(SARI, 5), T_(SARI, 6)], K).tiles };
  assert.ok(R.addToMeld(run, T_(SARI, 7), K)); assert.ok(R.addToMeld(run, T_(SARI, 3), K)); assert.equal(R.addToMeld(run, T_(MAVI, 7), K), null);
  assert.ok(R.isCommittable(T_(SARI, 7), [run], K)); assert.ok(!R.isCommittable(J, [run], K));
  const set3 = { kind: 'set', tiles: R.analyze([T_(SARI, 9), T_(MAVI, 9), J], K, 'set').tiles };
  const jx = set3.tiles.findIndex(t => t.j);
  assert.equal(R.canRetrieve(set3, jx, T_(set3.tiles[jx].c, 9), K), false); // 4 renk tamamlanmadan okey alınamaz
  const runJ = { kind: 'run', tiles: R.analyze([T_(SARI, 9), J, T_(SARI, 11)], K).tiles };
  assert.equal(R.canRetrieve(runJ, 1, T_(SARI, 10), K), true);
  assert.equal(R.canRetrieve(runJ, 1, T_(MAVI, 10), K), false);
});

test('en iyi diziliş çözücüsü geçerli perler üretir ve puanı doğru hesaplar', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) {
    const d = R.shuffle(R.fullDeck(), rnd); const ind = d.find(x => x < 104); const K = R.kit(R.okeyOf(ind));
    const hand = d.filter(x => x !== ind).slice(0, 22); const b = R.bestMelds(hand, K);
    let sum = 0; for (const m of b.melds) { const a = R.analyze(m, K); assert.ok(a, 'geçersiz per'); sum += a.value; }
    assert.equal(sum, b.value);
  }
});

function scenario(mode = 'tekli') {
  const T = TB.newTable({ mode, rounds: 1, katlamali: true }, 0); TB.fillBots(T); TB.startRound(T, 0);
  return T;
}
test('puanlama: normal bitiş, açmayan 202, açanın eli, çift açana ×2, okeyle bitiş katlar, eşlide eş 0', () => {
  const T = scenario(); const H = T.hand; const K = R.kit(H.okey);
  const plain = (c, n, cp = 0) => { const id = T_(c, n, cp); return K.isJoker(id) ? T_(c, n, 1 - cp) : id; };
  H.opened = [{ route: 'points', value: 120 }, { route: 'pairs', value: 5 }, null, { route: 'points', value: 110 }];
  H.racks = [[plain(SARI, 2)], [plain(MAVI, 3), plain(MAVI, 4)], [plain(SIYAH, 9)], [plain(SARI, 11), plain(SIYAH, 1)]];
  H.turn = 0; H.phase = 'play'; H.took = null; H.melds = [];
  TB.act(T, 0, { type: 'discard', tile: H.racks[0][0] }, 1);
  const sc = H.result.scores;
  assert.equal(sc[0], -101); assert.equal(sc[1], (3 + 4) * 2); assert.equal(sc[2], 202); assert.equal(sc[3], 12);
  assert.equal(T.status, 'finished'); assert.deepEqual(T.final.ranking[0], 0);

  const E = scenario('esli'); const H2 = E.hand; const K2 = R.kit(H2.okey);
  const ok = H2.racks.flat().concat(H2.pile).find(id => K2.isJoker(id));
  H2.opened = [{ route: 'pairs', value: 6 }, null, { route: 'points', value: 101 }, { route: 'points', value: 130 }];
  H2.racks = [[ok], [], [plain(SARI, 5)], [plain(MAVI, 6)]]; H2.turn = 0; H2.phase = 'play'; H2.melds = [];
  TB.act(E, 0, { type: 'discard', tile: ok }, 1);
  const s2 = H2.result.scores;
  assert.equal(s2[0], -404);           // çiftle + okey atarak bitti
  assert.equal(s2[2], 0);              // eşi
  assert.equal(s2[1], 808);            // açmayan: 202 × 2 (okey) × 2 (çift)
  assert.equal(s2[3], 6);
});

test('hamle doğrulama: sıra, eşik, yandan alınan taş, okey atma cezası, işlek taş cezası', () => {
  const T = scenario(); const H = T.hand; const s = H.turn;
  assert.throws(() => TB.act(T, (s + 1) % 4, { type: 'draw' }, 1), /Sıra sende değil/);
  assert.throws(() => TB.act(T, s, { type: 'draw' }, 1), /Önce taş çekmelisin|ortadan/);
  assert.throws(() => TB.act(T, s, { type: 'discard', tile: 999 }, 1));
  const K = R.kit(H.okey);
  // açma eşiği: 101'in altı reddedilir
  const small = R.bestMelds(H.racks[s], K).melds.slice(0, 1);
  if (small.length && R.analyze(small[0], K).value < 101) assert.throws(() => TB.act(T, s, { type: 'open', groups: small }, 1), /en az 101/);
  // okey atma: 101 ceza
  const joker = H.racks[s].find(K.isJoker);
  if (joker != null) { TB.act(T, s, { type: 'discard', tile: joker }, 1); assert.equal(H.penalties[s], 101); assert.equal(H.okeyBlocked, true);
    assert.throws(() => TB.act(T, (s + 1) % 4, { type: 'take' }, 2), /okey alınamaz/); }
});

test('bot-bot: 60 oyun kilitlenmeden biter, taş sayısı korunur, tüm perler geçerli', () => {
  let seed = 99; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let g = 0; g < 60; g++) {
    const T = TB.newTable({ mode: g % 2 ? 'esli' : 'tekli', rounds: 2, katlamali: g % 3 > 0 }, 0); TB.fillBots(T, rnd); TB.startRound(T, 0, rnd);
    let now = 0; for (let i = 0; i < 3000 && T.status !== 'finished'; i++) {
      now += 3000; TB.tick(T, now, rnd);
      const H = T.hand; const all = [...H.pile, ...H.racks.flat(), ...H.discards.flat(), ...H.melds.flatMap(m => m.tiles.map(t => t.id)), H.indicator];
      assert.equal(new Set(all).size, 106);
    }
    assert.equal(T.status, 'finished');
  }
});

/* ---------------- API ---------------- */
let clock = Date.UTC(2026, 10, 26, 9, 0, 0);
const quiet = { log() {}, warn() {}, error: console.error };
let srv, base;
async function api(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function register(name) { const r = await api('POST', '/api/auth/register', { email: `${name}@ornek.com`, username: name, password: 'Sifre1234' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
const bal = async (t) => (await api('GET', '/api/me', null, t)).body.user.balance;
test.before(async () => {
  srv = await startNodeServer({ env: { DATA_DIR: fs.mkdtempSync('/tmp/okeytest-'), SETUP_TOKEN: 'x-kurulum-123456' }, db: await createPgliteDb(), clock: () => clock, verifier: new MockVerifier(), logger: quiet, quiet: true,
    limitOverrides: { register: 1000, login: 1000, okq: 1000, oka: 1000, okj: 1000, okp: 1000, oki: 1000, okc: 1000 } });
  await new Promise(r => srv.server.listen(0, r)); base = `http://127.0.0.1:${srv.server.address().port}`;
});
test.after(() => srv.close());

test('online: iki gerçek oyuncu aynı masaya eşleşir, 20 sn sonra botlar oturur, oyun biter, havuz dağıtılır', async () => {
  const a = await register('okeyci_a'), b = await register('okeyci_b');
  const a0 = await bal(a.token), b0 = await bal(b.token);
  const q1 = await api('POST', '/api/okey/quick', { mode: 'tekli', stake: 1000, rounds: 1 }, a.token); assert.equal(q1.status, 200, JSON.stringify(q1.body));
  const q2 = await api('POST', '/api/okey/quick', { mode: 'tekli', stake: 1000, rounds: 1 }, b.token);
  assert.equal(q2.body.tableId, q1.body.tableId);
  assert.equal(await bal(a.token), a0 - 1000);
  const id = q1.body.tableId;
  let v = (await api('GET', `/api/okey/${id}`, null, a.token)).body; assert.equal(v.status, 'waiting'); assert.equal(v.seats.filter(Boolean).length, 2);
  // aynı ayarla tekrar hızlı oyna: aynı masayı döndürür
  assert.equal((await api('POST', '/api/okey/quick', { mode: 'tekli', stake: 1000, rounds: 1 }, a.token)).body.tableId, id);
  clock += 21000;
  v = (await api('GET', `/api/okey/${id}`, null, a.token)).body; assert.equal(v.status, 'playing'); assert.equal(v.seats.filter(x => x.bot).length, 2);
  assert.ok(Array.isArray(v.hand.rack) && v.hand.rack.length >= 21); assert.ok(!('racks' in v.hand));
  assert.equal(JSON.stringify(v).includes('"pile":['), false); // deste içeriği gizli
  // sırası gelen gerçek oyuncu hamle yapabilir; diğeri yapamaz
  const seatA = v.me, turn = v.hand.turn;
  const tokOf = (s) => (s === seatA ? a.token : b.token);
  const vb = (await api('GET', `/api/okey/${id}`, null, b.token)).body;
  const humanSeats = [seatA, vb.me];
  if (humanSeats.includes(turn)) {
    const other = humanSeats.find(x => x !== turn);
    assert.equal((await api('POST', `/api/okey/${id}/act`, { type: 'draw' }, tokOf(other))).status, 409);
    const me = (await api('GET', `/api/okey/${id}`, null, tokOf(turn))).body;
    const r = await api('POST', `/api/okey/${id}/act`, { type: 'discard', tile: me.hand.rack[0] }, tokOf(turn)); // başlayan 22 taşla atar
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal((await api('POST', `/api/okey/${id}/act`, { type: 'auto' }, a.token)).status, 400); // istemci "auto" gönderemez
  // süreler dolsun: insanlar zaman aşımıyla oynanır, botlar oynar
  for (let i = 0; i < 400 && v.status !== 'finished'; i++) { clock += 31000; v = (await api('GET', `/api/okey/${id}`, null, i % 2 ? a.token : b.token)).body; }
  assert.equal(v.status, 'finished');
  const pa = v.payouts.reduce((x, y) => x + y, 0); assert.ok(pa <= 4000);
  const a1 = await bal(a.token), b1 = await bal(b.token);
  assert.equal(a1 + b1, a0 + b0 - 2000 + pa);
  const lob = (await api('GET', '/api/okey/lobby', null, a.token)).body; assert.equal(lob.active, null); assert.equal(lob.stats.played, 1);
});

test('özel masa: kod, arkadaş daveti, koltuk seçimi (eşli), masa sahibi başlatır, ayrılan yerine bot oynar', async () => {
  const a = await register('okey_sahip'), b = await register('okey_dost'), c = await register('okey_yabanci');
  await api('POST', '/api/friends/request', { username: 'okey_dost' }, a.token); await api('POST', '/api/friends/request', { username: 'okey_sahip' }, b.token);
  const p = await api('POST', '/api/okey/private', { mode: 'esli', stake: 0, rounds: 3 }, a.token); assert.equal(p.status, 200, JSON.stringify(p.body)); assert.match(p.body.code, /^[A-Z0-9]{6}$/);
  const id = p.body.tableId;
  assert.equal((await api('POST', `/api/okey/${id}/invite`, { friendId: c.user.id }, a.token)).status, 403); // arkadaş değil
  assert.equal((await api('POST', `/api/okey/${id}/invite`, { friendId: b.user.id }, a.token)).status, 200);
  const lb = (await api('GET', '/api/okey/lobby', null, b.token)).body; assert.equal(lb.invites.length, 1); assert.equal(lb.invites[0].code, p.body.code);
  const j = await api('POST', '/api/okey/join', { code: p.body.code.toLowerCase() }, b.token); assert.equal(j.status, 200, JSON.stringify(j.body));
  assert.equal((await api('POST', `/api/okey/${id}/seat`, { seat: 2 }, b.token)).status, 200); // eşi karşıya oturur
  clock += 60000; let v = (await api('GET', `/api/okey/${id}`, null, a.token)).body; assert.equal(v.status, 'waiting'); // özel masa kendiliğinden başlamaz
  assert.equal((await api('POST', `/api/okey/${id}/start`, {}, b.token)).status, 403);
  assert.equal((await api('POST', `/api/okey/${id}/start`, {}, a.token)).status, 200);
  v = (await api('GET', `/api/okey/${id}`, null, b.token)).body; assert.equal(v.status, 'playing'); assert.equal(v.me, 2); assert.equal(v.cfg.mode, 'esli');
  assert.equal((await api('POST', `/api/okey/${id}/chat`, { msg: 0 }, b.token)).status, 200);
  assert.equal((await api('POST', `/api/okey/${id}/leave`, {}, b.token)).status, 200);
  v = (await api('GET', `/api/okey/${id}`, null, a.token)).body; assert.equal(v.seats[2].left, true); assert.equal(v.chat.length, 1);
  const lb2 = (await api('GET', '/api/okey/lobby', null, b.token)).body; assert.equal(lb2.active, null); assert.equal(lb2.rejoin.id, id);
  // geri dönüş: aynı koltuk, aynı taşlar; bot yerine tekrar kendisi
  const rj = await api('POST', '/api/okey/join', { tableId: id }, b.token); assert.equal(rj.status, 200, JSON.stringify(rj.body)); assert.equal(rj.body.rejoined, true);
  const vb = (await api('GET', `/api/okey/${id}`, null, b.token)).body; assert.equal(vb.me, 2); assert.equal(vb.seats[2].left, false); assert.ok(vb.hand.rack.length >= 21);
  assert.equal((await api('GET', '/api/me', null, b.token)).body.okeyActive.id, id);
  // başka bir oyuncu bu masaya oturamaz, hamle yapamaz, taşlarını göremez
  const vc = (await api('GET', `/api/okey/${id}`, null, c.token)).body; assert.equal(vc.me, null); assert.equal(vc.hand.rack, null);
  assert.equal((await api('POST', `/api/okey/${id}/act`, { type: 'draw' }, c.token)).status, 403);
  assert.equal((await api('POST', '/api/okey/join', { tableId: id }, c.token)).status, 409);
});

test('jeton: yetersiz bakiyeyle yüksek masaya girilemez, beklerken ayrılınca giriş iade edilir', async () => {
  const a = await register('okey_fakir');
  assert.equal((await api('POST', '/api/okey/quick', { mode: 'tekli', stake: 1000000, rounds: 1 }, a.token)).status, 402);
  const b0 = await bal(a.token);
  const q = await api('POST', '/api/okey/quick', { mode: 'esli', stake: 10000, rounds: 1 }, a.token); assert.equal(await bal(a.token), b0 - 10000);
  const l = await api('POST', `/api/okey/${q.body.tableId}/leave`, {}, a.token); assert.equal(l.body.refunded, 10000);
  assert.equal(await bal(a.token), b0);
});

test('TOPLA: bu tur açılan perler ıstakaya geri döner; 1-4 el seçenekleri; katlamasız eşik sabit 101', () => {
  const T = TB.newTable({ mode: 'tekli', rounds: 2, katlamali: false }, 0); TB.fillBots(T); TB.startRound(T, 0);
  const H = T.hand, s = H.turn, K = R.kit(H.okey);
  // başlayanın eline 101+ açılış hazırla
  const pick = (c, n) => { for (const cp of [0, 1]) { const id = T_(c, n, cp); for (let o = 0; o < 4; o++) { const i = H.racks[o].indexOf(id); if (i >= 0) { H.racks[o].splice(i, 1); return id; } } const pi = H.pile.indexOf(id); if (pi >= 0) { H.pile.splice(pi, 1); return id; } } return null; };
  const okeyColor = H.okey.c; const c1 = (okeyColor + 1) % 4, c2 = (okeyColor + 2) % 4;
  const g1 = [11, 12, 13].map(n => pick(c1, n)), g2 = [11, 12, 13].map(n => pick(c2, n)), g3 = [9, 10, 11].map(n => pick(c1, n));
  if ([...g1, ...g2, ...g3].some(x => x == null)) return; // nadir: taşlar göstergede
  H.racks[s].push(...g1, ...g2, ...g3);
  H.phase = 'draw'; TB.act(T, s, { type: 'draw' }, 1); // gerçek akış: taş çekildiğinde tur yedeği alınır
  const before = H.racks[s].slice().sort();
  TB.act(T, s, { type: 'open', route: 'points', groups: [g1, g2, g3] }, 1);
  assert.ok(H.opened[s] && H.melds.length === 3);
  assert.equal(TB.openThreshold(T, (s + 1) % 4, 'points'), 101); // katlamasız
  TB.act(T, s, { type: 'undo' }, 2);
  assert.equal(H.opened[s], null); assert.equal(H.melds.length, 0); assert.deepEqual(H.racks[s].slice().sort(), before);
  assert.throws(() => TB.act(T, s, { type: 'undo' }, 3), /koyduğun taş yok/);
  const K2 = TB.newTable({ mode: 'tekli', rounds: 2, katlamali: true }, 0); K2.hand = { opened: [{ route: 'points', value: 130 }, null, null, null] }; assert.equal(TB.openThreshold(K2, 1, 'points'), 131);
});
