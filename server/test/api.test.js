import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNodeServer } from '../src/node-server.js';
import { createPgliteDb } from '../src/db.js';
import { MockVerifier } from '../src/billing.js';
import { buildGames, ORDER, DEFAULT_RTP } from '../src/games/engine.js';
import { FairRng, hashSeed } from '../src/games/rng.js';
import * as C from '../src/core.js';

const cal = JSON.parse(fs.readFileSync(new URL('../src/games/calibration.json', import.meta.url), 'utf8'));
let clock = Date.UTC(2026, 10, 26, 9, 0, 0);
const quiet = { log() {}, warn() {}, error: console.error };
const ENV = { SETUP_TOKEN: 'kurulum-anahtari-123456', RTDN_SECRET: 'rt', DATA_DIR: fs.mkdtempSync('/tmp/slottest-') };
let srv, base;
async function start(db) {
  srv = await startNodeServer({ env: ENV, db: db || await createPgliteDb(), clock: () => clock, verifier: new MockVerifier(), logger: quiet, quiet: true, allowDevMail: true,
    limitOverrides: { register: 1000, login: 1000, spin: 1000, adminlogin: 1000, setup: 1000 } });
  await new Promise(r => srv.server.listen(0, r)); base = `http://127.0.0.1:${srv.server.address().port}`;
}
async function api(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function register(name) { const r = await api('POST', '/api/auth/register', { email: `${name}@ornek.com`, username: name, password: 'Sifre1234' }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }
const ledgerSum = async (uid) => (await srv.db.q('SELECT COALESCE(SUM(delta),0)::bigint s FROM slot.ledger WHERE user_id=$1', [uid]))[0].s;
let adminTok;
const freshAdmin = async () => { adminTok = (await api('POST', '/api/auth/admin-login', { identifier: 'patron', password: 'Admin12345' })).body.token; };

test.before(() => start());
test.after(() => srv.close());

test('1M seviye: XP formülü, sınırlar, taşma yok', () => {
  assert.equal(C.MAX_LEVEL, 1000000);
  assert.equal(C.cumXp(1), 0); assert.equal(C.cumXp(2), 60);
  assert.ok(Number.isSafeInteger(C.XP_MAX) && C.XP_MAX > 6e15 && C.XP_MAX < 9e15);
  for (const L of [1, 2, 10, 99, 100, 101, 1000, 54321, 999999, 1000000]) { assert.equal(C.levelFromXp(C.cumXp(L)), L); if (L > 1) assert.equal(C.levelFromXp(C.cumXp(L) - 1), L - 1); }
  assert.equal(C.levelFromXp(C.XP_MAX * 2), 1000000);
  let prev = 0; for (const L of [1, 10, 100, 1000, 10000, 100000, 999999]) { const n = C.cumXp(L + 1) - C.cumXp(L); assert.ok(n > prev); prev = n; }
  assert.equal(C.levelInfo(C.XP_MAX).max, true);
  const cfg = { every: 10, perLevel: 1000, special: {} };
  assert.equal(C.levelRewardRange(0, 100, cfg).coins, 550000);
  const all = C.levelRewardRange(0, 1000000, cfg); assert.ok(Number.isSafeInteger(all.coins) && all.count === 100000 && all.upto === 1000000);
});

test('hızlı seviye atlama engeli: dev bahisle bile bir seviye en az ~25 spin sürer', () => {
  for (const L of [1, 10, 100, 5000]) assert.ok(C.maxXpPerSpin(L) * 25 >= C.needXp(L) && C.maxXpPerSpin(L) * 24 < C.needXp(L) + 25);
});

test('ilk kurulum: kurulum anahtarı olmadan yönetici oluşturulamaz, sonra kurulum kapanır', async () => {
  assert.equal((await api('GET', '/api/setup/status')).body.needsSetup, true);
  assert.equal((await api('POST', '/api/setup/admin', { setupToken: 'yanlis-anahtar-12345678', email: 'a@b.com', username: 'patron', password: 'Admin12345' })).status, 403);
  const ok = await api('POST', '/api/setup/admin', { setupToken: ENV.SETUP_TOKEN, email: 'patron@slot.test', username: 'patron', password: 'Admin12345' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.user.role, 'admin'); assert.equal(ok.body.user.unlimited, true);
  adminTok = ok.body.token;
  assert.equal((await api('GET', '/api/setup/status')).body.needsSetup, false);
  assert.equal((await api('POST', '/api/setup/admin', { setupToken: ENV.SETUP_TOKEN, email: 'x@b.com', username: 'ikinci', password: 'Admin12345' })).status, 409);
});

test('kayıt: e-posta doğrulaması yok, kullanıcı adı benzersiz, kullanıcı adı veya e-postayla giriş', async () => {
  const { user } = await register('ayse');
  assert.equal(user.balance, 50000); assert.equal(user.level, 1);
  assert.equal((await api('POST', '/api/auth/register', { email: 'baska@ornek.com', username: 'AYSE', password: 'Sifre1234' })).body.error, 'username_taken');
  assert.equal((await api('POST', '/api/auth/register', { email: 'AYSE@ornek.com', username: 'ayse2', password: 'Sifre1234' })).body.error, 'email_taken');
  assert.equal((await api('POST', '/api/auth/register', { email: 'x@ornek.com', username: 'xx_1', password: 'kisa' })).body.error, 'weak_password');
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'Ayse', password: 'Sifre1234' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'ayse@ornek.com', password: 'Sifre1234' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'ayse', password: 'Yanlis123' })).status, 401);
  const row = (await srv.db.q("SELECT pass_hash FROM slot.users WHERE username='ayse'"))[0]; assert.match(row.pass_hash, /^scrypt\$/);
});

test('yönetici girişi: oyuncu yönetici girişi yapamaz; normal girişle açılan yönetici oturumu panele erişemez', async () => {
  const p = await register('normal1');
  assert.equal((await api('POST', '/api/auth/admin-login', { identifier: 'normal1', password: 'Sifre1234' })).body.error, 'not_admin');
  for (const path of ['/api/admin/users', '/api/admin/stats', '/api/admin/games', '/api/admin/perf']) assert.equal((await api('GET', path, null, p.token)).status, 403);
  const plain = (await api('POST', '/api/auth/login', { identifier: 'patron', password: 'Admin12345' })).body.token;
  assert.equal((await api('GET', '/api/admin/users', null, plain)).status, 403, 'normal giriş oturumu yönetici paneline giremez');
  const adm = await api('POST', '/api/auth/admin-login', { identifier: 'patron@slot.test', password: 'Admin12345' });
  assert.equal(adm.status, 200); assert.equal((await api('GET', '/api/admin/users?q=normal1', null, adm.body.token)).body.users[0].username, 'normal1');
  assert.equal((await api('GET', '/api/admin/users')).status, 401);
  clock += 13 * 3600e3; assert.equal((await api('GET', '/api/admin/users', null, adm.body.token)).status, 401, 'yönetici oturumu 12 saatte sona erer');
  adminTok = (await api('POST', '/api/auth/admin-login', { identifier: 'patron', password: 'Admin12345' })).body.token;
});

test('spin: bahis düşer, kazanç eklenir, XP sınırlı, defter tutarlı, tekrar isteği çift işlem yapmaz', async () => {
  const { token, user } = await register('spinci');
  let bal = user.balance, xp = 0;
  for (let i = 0; i < 28; i++) {
    const bet = [100, 200, 1000, 2000][i % 4];
    const r = await api('POST', '/api/spin', { game: ORDER[i % 7], bet, key: 'k' + i }, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.balance, bal - bet + r.body.win);
    assert.equal(r.body.win, Math.round(r.body.result.win * bet));
    assert.ok(r.body.xp.gained <= C.maxXpPerSpin(C.levelFromXp(xp)));
    bal = r.body.balance; xp = r.body.xp.xp;
  }
  const again = await api('POST', '/api/spin', { game: ORDER[27 % 7], bet: 2000, key: 'k27' }, token);
  assert.equal(again.body.replay, true); assert.equal(again.body.balance, bal);
  assert.equal(await ledgerSum(user.id), bal);
  assert.equal((await api('POST', '/api/spin', { game: 'zeus', bet: 123 }, token)).body.error, 'bad_bet');
});

test('oyun bazlı RTP: profiller farklı, yönetici değiştirir, kayıt tutulur, sonuç tohumdan yeniden üretilebilir', async () => {
  const g = (await api('GET', '/api/admin/games', null, adminTok)).body;
  assert.ok(new Set(g.games.map(x => x.rtp)).size >= 3, 'oyunların RTP değerleri birbirinden bağımsız');
  assert.ok(new Set(g.games.map(x => x.vol)).size === 3, 'oyunlar farklı volatilite karakterinde (düşük/orta/yüksek)');
  assert.equal((await api('PUT', '/api/admin/games/zeus', { vol: 'cok' }, adminTok)).body.error, 'bad_vol');
  assert.equal((await api('PUT', '/api/admin/games/misir', { vol: 'yuksek', note: 'vol test' }, adminTok)).body.vol, 'yuksek');
  assert.equal((await api('GET', '/api/games')).body.games.find(x => x.id === 'misir').info.vol, 'yuksek');
  const hv = (await api('GET', '/api/admin/games', null, adminTok)).body.history[0]; assert.equal(hv.old_vol, 'orta'); assert.equal(hv.new_vol, 'yuksek');
  await api('PUT', '/api/admin/games/misir', { vol: 'orta' }, adminTok);
  assert.equal((await api('PUT', '/api/admin/games/zeus', { rtp: 0.99 }, adminTok)).body.error, 'bad_rtp');
  assert.equal((await api('PUT', '/api/admin/games/zeus', { rtp: 0.92, note: 'test' }, adminTok)).body.rtp, 0.92);
  const h = (await api('GET', '/api/admin/games', null, adminTok)).body.history; assert.equal(h[0].game, 'zeus'); assert.equal(Number(h[0].new_rtp), 0.92);
  const { token } = await register('denetci');
  const fair = (await api('GET', '/api/fair', null, token)).body;
  const done = []; for (const id of ORDER) { const r = await api('POST', '/api/spin', { game: id, bet: 1000 }, token); assert.equal(r.status, 200); done.push(r.body); }
  const rot = (await api('POST', '/api/fair/rotate', {}, token)).body; assert.equal(hashSeed(rot.revealed.serverSeed), fair.serverSeedHash);
  const G = buildGames(cal, { ...DEFAULT_RTP, zeus: 0.92 });
  const stR = await api('GET', '/api/admin/game-stats?days=0', null, adminTok); assert.equal(stR.status, 200, JSON.stringify(stR.body)); const st = stR.body;
  assert.ok(st.games.every(x => x.spins >= 1 && x.theoreticalRtp > 0.85), JSON.stringify(st.games.map(x => [x.id, x.spins]))); assert.ok(st.players.total >= 1 && st.players.online5m >= 1, JSON.stringify(st.players));
  for (const x of st.games) assert.equal(x.house, x.wagered - x.won);
  assert.equal((await api('GET', '/api/admin/game-stats', null, token)).status, 403);
  for (const s of done) assert.equal(Math.round(G[s.game].play(new FairRng(rot.revealed.serverSeed, s.fair.clientSeed, s.fair.nonce), true).win * 1000), s.win, s.game);
  await api('PUT', '/api/admin/games/vegas', { active: false }, adminTok);
  assert.ok(!(await api('GET', '/api/games')).body.games.some(x => x.id === 'vegas'));
  assert.equal((await api('POST', '/api/spin', { game: 'vegas', bet: 100 }, token)).body.error, 'game_disabled');
  await api('PUT', '/api/admin/games/vegas', { active: true }, adminTok);
  await api('PUT', '/api/admin/games/zeus', { rtp: DEFAULT_RTP.zeus }, adminTok);
});

test('bonus satın alma ve yetersiz bakiye', async () => {
  const { token, user } = await register('alici2');
  const cost = Math.round(100 * buildGames(cal).zeus.buyCost.fs);
  const r = await api('POST', '/api/spin', { game: 'zeus', bet: 100, buy: 'fs' }, token);
  assert.equal(r.body.cost, cost); assert.equal(r.body.balance, 50000 - cost + r.body.win); assert.ok(r.body.result.fs.spins.length >= 15);
  assert.equal((await api('POST', '/api/spin', { game: 'vegas', bet: 100, buy: 'fs' }, token)).body.error, 'no_buy');
  assert.equal((await api('POST', '/api/spin', { game: 'zeus', bet: 100000, buy: 'super' }, token)).status, 402);
  assert.equal(await ledgerSum(user.id), r.body.balance);
});

test('seviye ödülleri toplu alınır, bir kez; yüksek seviyelerde taşma yok', async () => {
  const { token, user } = await register('seviyeci');
  assert.equal((await api('POST', '/api/level-rewards/claim', {}, token)).body.error, 'nothing');
  await api('POST', `/api/admin/users/${user.id}/progress`, { level: 100 }, adminTok);
  const a = await api('POST', '/api/level-rewards/claim', {}, token); assert.equal(a.body.coins, 550000); assert.equal(a.body.celebrate, true);
  assert.equal((await api('POST', '/api/level-rewards/claim', {}, token)).body.error, 'nothing');
  await api('POST', `/api/admin/users/${user.id}/progress`, { level: 1000000 }, adminTok);
  const me = (await api('GET', '/api/me', null, token)).body; assert.equal(me.user.level, 1000000); assert.equal(me.user.maxLevel, true);
  const b = await api('POST', '/api/level-rewards/claim', {}, token);
  assert.equal(b.body.coins, C.levelRewardRange(100, 1000000, { every: 10, perLevel: 1000, special: {} }).coins);
  assert.equal(b.body.balance, 50000 + 550000 + b.body.coins); assert.ok(Number.isSafeInteger(b.body.balance));
  const s = await api('POST', '/api/spin', { game: 'altin', bet: 1000 }, token); assert.equal(s.body.xp.level, 1000000);
});

test('günlük ödül 24 saatte bir; 100. seviye üstünde de ölçeklenir', async () => {
  const { token, user } = await register('gunluk');
  assert.equal((await api('POST', '/api/daily/claim', {}, token)).body.amount, 500);
  assert.equal((await api('POST', '/api/daily/claim', {}, token)).body.error, 'not_yet');
  clock += 23 * 3600e3; assert.equal((await api('POST', '/api/daily/claim', {}, token)).body.error, 'not_yet');
  clock += 3600e3; assert.equal((await api('POST', '/api/daily/claim', {}, token)).status, 200);
  await freshAdmin();
  await api('POST', `/api/admin/users/${user.id}/progress`, { level: 600 }, adminTok);
  assert.equal((await api('GET', '/api/me', null, token)).body.daily.amount, 10000 + 500 * 10);
});

test('ödeme: satın alındı, tekrar, bekleyen, iptal, başka hesap, iade (e-posta doğrulaması gerekmez)', async () => {
  const { token, user } = await register('alici');
  const acct = (await api('GET', '/api/me', null, token)).body.user.billingAccountId;
  const tk = (s, n) => `mock:${s}:${acct}:${n}`;
  const ok = await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, token);
  assert.equal(ok.body.status, 'purchased'); assert.equal(ok.body.balance, 1050000);
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, token)).body.alreadyCredited, true);
  const pend = tk('pending', 2); assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_medium', purchaseToken: pend }, token)).body.status, 'pending');
  srv.api.verifier.overrides.set(pend, { state: 'purchased', orderId: 'GPA.P2', obfuscatedAccountId: acct, quantity: 1 });
  const msg = (o) => ({ message: { data: Buffer.from(JSON.stringify(o)).toString('base64') } });
  assert.equal((await api('POST', '/api/billing/rtdn?secret=rt', msg({ oneTimeProductNotification: { notificationType: 1, purchaseToken: pend, sku: 'coins_medium' } }))).body.balance, 3050000);
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_large', purchaseToken: tk('canceled', 3) }, token)).body.status, 'canceled');
  const other = await register('baskasi');
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, other.token)).status, 403);
  assert.equal((await api('POST', '/api/billing/rtdn?secret=rt', msg({ voidedPurchaseNotification: { purchaseToken: tk('purchased', 1) } }))).body.debited, 1000000);
  assert.equal(await ledgerSum(user.id), 2050000);
  assert.ok((await api('GET', '/api/admin/purchases', null, adminTok)).body.purchases.length >= 3);
});

test('yönetici işlemleri: jeton, seviye, şifre sıfırlama, askıya alma, işlem geçmişi, sınırsız jeton, performans raporu', async () => {
  const { token, user } = await register('normal2');
  await api('POST', '/api/telemetry', { fps: 58.5, worstMs: 40, game: 'zeus', device: 'test', appVersion: '3.0.0' }, token);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: 25000, reason: 'test' }, adminTok)).body.balance, 75000);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: -999999 }, adminTok)).status, 402);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/progress`, { level: 250 }, adminTok)).body.level, 250);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/status`, { unlimited: true }, adminTok)).body.error, 'admin_only');
  await api('POST', `/api/admin/users/${user.id}/password`, { password: 'YeniSifre9' }, adminTok);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'normal2', password: 'YeniSifre9' })).status, 200);
  const before = (await srv.db.q("SELECT balance FROM slot.users WHERE username='patron'"))[0].balance;
  for (let i = 0; i < 3; i++) assert.equal((await api('POST', '/api/spin', { game: 'altin', bet: 100000 }, adminTok)).status, 200);
  assert.ok((await srv.db.q("SELECT balance FROM slot.users WHERE username='patron'"))[0].balance >= before);
  const perf = (await api('GET', '/api/admin/perf', null, adminTok)).body; assert.ok(perf.api.length > 5); assert.equal(perf.clients[0].game, 'zeus');
  const audit = (await api('GET', '/api/admin/audit', null, adminTok)).body.audit; assert.ok(audit.some(a => a.action === 'coins') && audit.some(a => a.action === 'game_config') && audit.some(a => a.action === 'password_reset'));
  await api('POST', `/api/admin/users/${user.id}/status`, { banned: true }, adminTok);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'normal2', password: 'YeniSifre9' })).status, 403);
});

test('şifremi unuttum: e-posta koduyla sıfırlama, kod tek kullanımlık', async () => {
  await register('mehmet');
  assert.equal((await api('POST', '/api/auth/forgot', { email: 'yok@ornek.com' })).status, 200);
  await api('POST', '/api/auth/forgot', { email: 'mehmet@ornek.com' });
  const body = (await srv.db.q("SELECT body FROM slot.outbox WHERE to_addr='mehmet@ornek.com' ORDER BY id DESC LIMIT 1"))[0].body;
  const code = /kodun: ([A-Z0-9]{8})/.exec(body)[1];
  assert.equal((await api('POST', '/api/auth/reset', { code, password: 'YeniSifre1' })).status, 200);
  assert.equal((await api('POST', '/api/auth/reset', { code, password: 'YeniSifre2' })).status, 400);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'mehmet', password: 'YeniSifre1' })).status, 200);
});

test('görevler, etkinlik, arkadaş ve hediye', async () => {
  const a = await register('ali'), b = await register('veli');
  for (const g of ['zeus', 'misir', 'vegas']) await api('POST', '/api/spin', { game: g, bet: 100 }, a.token);
  const gq = (await api('GET', '/api/quests', null, a.token)).body.quests.find(q => q.type === 'games'); assert.equal(Number(gq.progress), 3);
  assert.equal((await api('POST', `/api/quests/${gq.id}/claim`, {}, a.token)).body.reward, 3000);
  const ev = (await api('POST', '/api/admin/events', { title: '2x XP', startsAt: clock - 1000, endsAt: clock + 3600e3, xpMult: 2, bonusCoins: 5000 }, adminTok)).body.id;
  assert.equal((await api('POST', `/api/events/${ev}/claim`, {}, a.token)).body.reward, 5000);
  assert.equal((await api('POST', `/api/events/${ev}/claim`, {}, a.token)).status, 409);
  await api('POST', '/api/admin/events', { id: ev, title: '2x XP', startsAt: clock - 1000, endsAt: clock - 500 }, adminTok);
  assert.equal((await api('POST', '/api/friends/request', { username: 'veli' }, a.token)).body.status, 'pending');
  assert.equal((await api('POST', `/api/friends/${a.user.id}/accept`, {}, b.token)).status, 200);
  assert.equal((await api('POST', '/api/gifts/send', { to: b.user.id, amount: 5000 }, a.token)).status, 200);
  const inbox = (await api('GET', '/api/friends', null, b.token)).body.gifts;
  assert.equal((await api('POST', `/api/gifts/${inbox[0].id}/claim`, {}, b.token)).body.balance, 55000);
});

test('uygulama sürümü: CI kimliği olmadan sürüm yüklenemez', async () => {
  assert.equal((await api('GET', '/api/app/version')).body.latest, null);
  assert.equal((await fetch(base + '/api/release?code=5&name=3.0.0', { method: 'POST', body: new Uint8Array(200000) })).status, 403);
  assert.equal((await api('GET', '/api/release/signing')).status, 403);
});

test('kalıcılık: sunucu kapatılıp açıldığında bakiye, seviye ve oturum korunur', async () => {
  await srv.close();
  const dir = fs.mkdtempSync('/tmp/slotpersist-');
  await start(await createPgliteDb(dir));
  const { token } = await register('kalici');
  await api('POST', '/api/spin', { game: 'zeus', bet: 1000 }, token);
  const before = (await api('GET', '/api/me', null, token)).body.user;
  await srv.close();
  await start(await createPgliteDb(dir));
  const after = (await api('GET', '/api/me', null, token)).body.user;
  assert.equal(after.balance, before.balance); assert.equal(after.xp, before.xp);
});
