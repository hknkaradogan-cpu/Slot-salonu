'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'); const fs = require('fs'); const path = require('path');
const { createApp } = require('../src/app');
const { MockVerifier } = require('../src/billing');
const { buildGames, ORDER } = require('../src/games/engine');
const { FairRng, hashSeed } = require('../src/games/rng');
const C = require('../src/core');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-'));
let clock = Date.UTC(2026, 10, 26, 9, 0, 0);
const quietLog = { log() {}, warn() {}, error: console.error };
function mk(dbName = 'main.db', verifier = new MockVerifier()) {
  return createApp({ dbFile: path.join(dir, dbName), secret: 'test-secret', publicUrl: 'http://t', clock: () => clock, verifier, quiet: true, logger: quietLog, rtdnSecret: 'rt', limitOverrides: { register: 1000, login: 1000, verify: 1000, spin: 1000, resend: 1000 }, admin: { email: 'admin@slot.test', username: 'yonetici', password: 'Admin12345' } });
}
let app, base;
async function start(a) { app = a; await new Promise(r => app.server.listen(0, r)); base = `http://127.0.0.1:${app.server.address().port}`; }
async function api(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
}
const lastCode = (email) => /kodun: ([A-Z0-9]{8})/.exec(app.db.prepare('SELECT body FROM outbox WHERE to_addr=? ORDER BY id DESC LIMIT 1').get(email).body)[1];
let ipN = 1; // her test grubunda farklı hız sınırı anahtarı için yeni kullanıcı
async function register(name) {
  const r = await api('POST', '/api/auth/register', { email: `${name}@ornek.com`, username: name, password: 'Sifre1234' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, user: r.body.user };
}
async function verify(name, token) { const r = await api('POST', '/api/auth/verify-email', { code: lastCode(`${name}@ornek.com`) }, token); assert.equal(r.status, 200); }
const ledgerSum = (uid) => app.db.prepare('SELECT COALESCE(SUM(delta),0) s FROM ledger WHERE user_id=?').get(uid).s;

test.before(() => start(mk()));
test.after(() => app.close());

test('seviye tablosu: 1→2 için 500 XP, her seviyede +100, 100. seviyede sınır', () => {
  assert.equal(C.cumXp(2) - C.cumXp(1), 500);
  assert.equal(C.cumXp(3) - C.cumXp(2), 600);
  assert.equal(C.cumXp(100) - C.cumXp(99), 500 + 100 * 98);
  assert.equal(C.levelFromXp(0), 1); assert.equal(C.levelFromXp(499), 1); assert.equal(C.levelFromXp(500), 2);
  assert.equal(C.levelFromXp(C.XP_MAX + 10_000), 100);
  assert.equal(C.levelInfo(C.XP_MAX).max, true);
});

test('günlük ödül miktarı seviyeye göre hesaplanır', () => {
  const a = JSON.parse(app.db.prepare("SELECT value FROM settings WHERE key='daily_anchors'").get().value);
  assert.deepEqual([1, 5, 10, 15, 20, 55, 90, 100].map(l => C.dailyAmount(l, a)), [500, 720, 1000, 1500, 2000, 5500, 9000, 10000]);
});

test('kayıt, benzersiz kullanıcı adı, şifre kuralları ve iki tür giriş', async () => {
  const { user } = await register('ayse');
  assert.equal(user.balance, 50000); assert.equal(user.level, 1); assert.equal(user.emailVerified, false);
  assert.equal((await api('POST', '/api/auth/register', { email: 'baska@ornek.com', username: 'AYSE', password: 'Sifre1234' })).body.error, 'username_taken');
  assert.equal((await api('POST', '/api/auth/register', { email: 'AYSE@ornek.com', username: 'ayse2', password: 'Sifre1234' })).body.error, 'email_taken');
  assert.equal((await api('POST', '/api/auth/register', { email: 'x@ornek.com', username: 'xx_1', password: 'kisa' })).body.error, 'weak_password');
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'ayse', password: 'Sifre1234' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'ayse@ornek.com', password: 'Sifre1234' })).status, 200);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'ayse', password: 'Yanlis123' })).status, 401);
  const row = app.db.prepare("SELECT pass_hash FROM users WHERE username='ayse'").get();
  assert.match(row.pass_hash, /^scrypt\$/); assert.ok(!row.pass_hash.includes('Sifre1234'));
});

test('e-posta doğrulama ve şifremi unuttum akışı', async () => {
  const { token } = await register('mehmet');
  await verify('mehmet', token);
  assert.equal((await api('GET', '/api/me', null, token)).body.user.emailVerified, true);
  assert.equal((await api('POST', '/api/auth/forgot', { email: 'yok@ornek.com' })).status, 200); // varlık sızdırmaz
  await api('POST', '/api/auth/forgot', { email: 'mehmet@ornek.com' });
  const code = lastCode('mehmet@ornek.com');
  assert.equal((await api('POST', '/api/auth/reset', { code: 'YANLIS99', password: 'YeniSifre1' })).status, 400);
  assert.equal((await api('POST', '/api/auth/reset', { code, password: 'YeniSifre1' })).status, 200);
  assert.equal((await api('GET', '/api/me', null, token)).status, 401, 'eski oturumlar kapatılmalı');
  assert.equal((await api('POST', '/api/auth/reset', { code, password: 'YeniSifre2' })).status, 400, 'kod tek kullanımlık');
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'mehmet', password: 'YeniSifre1' })).status, 200);
});

test('spin: bahis düşer, kazanç eklenir, XP verilir, defter tutarlı, tekrar isteği çift işlem yapmaz', async () => {
  const { token, user } = await register('spinci');
  let bal = user.balance, xp = 0;
  for (let i = 0; i < 40; i++) {
    const bet = [100, 200, 1000][i % 3];
    const r = await api('POST', '/api/spin', { game: ORDER[i % 7], bet, key: 'k' + i }, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.balance, bal - bet + r.body.win);
    assert.equal(r.body.win, Math.round(r.body.result.win * bet));
    bal = r.body.balance; xp += bet / 100;
    assert.equal(r.body.xp.xp, xp);
  }
  const again = await api('POST', '/api/spin', { game: ORDER[39 % 7], bet: 1000, key: 'k39' }, token);
  assert.equal(again.body.replay, true); assert.equal(again.body.balance, bal);
  assert.equal(ledgerSum(user.id), bal);
  assert.equal((await api('GET', '/api/me', null, token)).body.user.balance, bal);
  assert.equal((await api('POST', '/api/spin', { game: 'zeus', bet: 123 }, token)).body.error, 'bad_bet');
  assert.equal((await api('POST', '/api/spin', { game: 'yok', bet: 100 }, token)).status, 404);
});

test('yetersiz bakiyede spin reddedilir ve bakiye eksiye düşmez', async () => {
  const { token, user } = await register('fakir');
  app.db.prepare('UPDATE users SET balance=150 WHERE id=?').run(user.id);
  const r = await api('POST', '/api/spin', { game: 'vegas', bet: 200 }, token);
  assert.equal(r.status, 402);
  assert.equal(app.db.prepare('SELECT balance FROM users WHERE id=?').get(user.id).balance, 150);
});

test('7 oyunun tümü API üzerinden oynanabilir ve sonuç tohumdan yeniden üretilebilir (denetlenebilir RNG)', async () => {
  const { token } = await register('denetci');
  const fair = (await api('GET', '/api/fair', null, token)).body;
  const done = [];
  for (const g of ORDER) { const r = await api('POST', '/api/spin', { game: g, bet: 1000 }, token); assert.equal(r.status, 200); assert.equal(r.body.fair.serverSeedHash, fair.serverSeedHash); done.push(r.body); }
  const rot = (await api('POST', '/api/fair/rotate', {}, token)).body;
  assert.equal(hashSeed(rot.revealed.serverSeed), fair.serverSeedHash);
  const games = buildGames();
  for (const s of done) {
    const re = games[s.game].play(new FairRng(rot.revealed.serverSeed, s.fair.clientSeed, s.fair.nonce), true);
    assert.equal(Math.round(re.win * 1000), s.win, s.game);
  }
});

test('seviye ödülleri: seviye şartı, tek seferlik alım, toplam 550.000, 100. seviye kutlaması', async () => {
  const { token, user } = await register('seviyeci');
  const adm = (await api('POST', '/api/auth/login', { identifier: 'yonetici', password: 'Admin12345' })).body.token;
  assert.equal((await api('POST', '/api/level-rewards/10/claim', {}, token)).body.error, 'level_too_low');
  await api('POST', `/api/admin/users/${user.id}/progress`, { level: 100 }, adm);
  let total = 0, celebrate = false;
  for (let L = 10; L <= 100; L += 10) { const r = await api('POST', `/api/level-rewards/${L}/claim`, {}, token); assert.equal(r.status, 200); total += r.body.coins; celebrate = r.body.celebrate; }
  assert.equal(total, 550000); assert.equal(celebrate, true);
  assert.equal((await api('POST', '/api/level-rewards/50/claim', {}, token)).body.error, 'already_claimed');
  assert.equal((await api('GET', '/api/me', null, token)).body.user.balance, 50000 + 550000);
  // 100. seviyede XP artmaz
  const r = await api('POST', '/api/spin', { game: 'zeus', bet: 1000 }, token);
  assert.equal(r.body.xp.level, 100); assert.equal(r.body.xp.xp, C.XP_MAX);
});

test('günlük ödül 24 saatte bir, sunucu saatine göre', async () => {
  const { token } = await register('gunluk');
  const a = await api('POST', '/api/daily/claim', {}, token); assert.equal(a.status, 200); assert.equal(a.body.amount, 500);
  assert.equal((await api('POST', '/api/daily/claim', {}, token)).body.error, 'not_yet');
  clock += 23 * 3600e3; assert.equal((await api('POST', '/api/daily/claim', {}, token)).body.error, 'not_yet');
  clock += 3600e3; assert.equal((await api('POST', '/api/daily/claim', {}, token)).status, 200);
});

test('ödeme: doğrulanmamış e-posta, satın alındı, tekrar, bekleyen, iptal, hesap uyuşmazlığı, iade', async () => {
  const { token, user } = await register('alici');
  const me = (await api('GET', '/api/me', null, token)).body.user;
  const tk = (state, n) => `mock:${state}:${me.billingAccountId}:${n}`;
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, token)).body.error, 'email_not_verified');
  await verify('alici', token);
  const ok = await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, token);
  assert.equal(ok.body.status, 'purchased'); assert.equal(ok.body.coins, 1000000); assert.equal(ok.body.balance, 1050000);
  assert.ok(app.verifier.consumedTokens.has(tk('purchased', 1)));
  const dup = await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, token);
  assert.equal(dup.body.alreadyCredited, true); assert.equal(dup.body.balance, 1050000);
  // bekleyen -> jeton verilmez; ödeme tamamlanınca RTDN ile verilir
  const pend = tk('pending', 2);
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_medium', purchaseToken: pend }, token)).body.status, 'pending');
  assert.equal((await api('GET', '/api/me', null, token)).body.user.balance, 1050000);
  app.verifier.overrides.set(pend, { state: 'purchased', orderId: 'GPA.P2', obfuscatedAccountId: me.billingAccountId, quantity: 1 });
  const msg = (o) => ({ message: { data: Buffer.from(JSON.stringify(o)).toString('base64') } });
  assert.equal((await api('POST', '/api/billing/rtdn?secret=yanlis', msg({}))).status, 403);
  const rt = await api('POST', '/api/billing/rtdn?secret=rt', msg({ oneTimeProductNotification: { notificationType: 1, purchaseToken: pend, sku: 'coins_medium' } }));
  assert.equal(rt.body.status, 'purchased'); assert.equal(rt.body.balance, 3050000);
  // iptal
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_large', purchaseToken: tk('canceled', 3) }, token)).body.status, 'canceled');
  // başka hesabın belirteci
  const other = await register('baskasi'); await verify('baskasi', other.token);
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_small', purchaseToken: tk('purchased', 1) }, other.token)).status, 403);
  // iade (voided) -> jetonlar geri alınır
  const rf = await api('POST', '/api/billing/rtdn?secret=rt', msg({ voidedPurchaseNotification: { purchaseToken: tk('purchased', 1) } }));
  assert.equal(rf.body.status, 'refunded'); assert.equal(rf.body.debited, 1000000);
  assert.equal((await api('GET', '/api/me', null, token)).body.user.balance, 2050000);
  const hist = (await api('GET', '/api/shop/history', null, token)).body.purchases;
  assert.deepEqual(hist.map(h => h.state).sort(), ['canceled', 'purchased', 'refunded']);
  assert.equal(ledgerSum(user.id), 2050000);
  // başlangıç paketi tek seferlik
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_starter', purchaseToken: tk('purchased', 9) }, token)).body.status, 'purchased');
  assert.equal((await api('POST', '/api/shop/verify', { productId: 'coins_starter', purchaseToken: tk('purchased', 10) }, token)).body.error, 'one_time');
});

test('yönetici yetkileri: oyuncu erişemez; yönetici jeton/seviye düzenler, kayıt tutulur, sınırsız jeton', async () => {
  const { token, user } = await register('normal');
  for (const p of ['/api/admin/users', '/api/admin/stats', '/api/admin/audit']) assert.equal((await api('GET', p, null, token)).status, 403);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: 1e9 }, token)).status, 403);
  assert.equal((await api('GET', '/api/admin/users')).status, 401);
  const adm = (await api('POST', '/api/auth/login', { identifier: 'admin@slot.test', password: 'Admin12345' })).body;
  assert.equal(adm.user.role, 'admin'); assert.equal(adm.user.unlimited, true);
  const found = (await api('GET', '/api/admin/users?q=normal', null, adm.token)).body.users;
  assert.equal(found[0].username, 'normal');
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: 25000, reason: 'test' }, adm.token)).body.balance, 75000);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: -5000, reason: 'düzeltme' }, adm.token)).body.balance, 70000);
  assert.equal((await api('POST', `/api/admin/users/${user.id}/coins`, { delta: -999999 }, adm.token)).status, 402);
  const pr = await api('POST', `/api/admin/users/${user.id}/progress`, { level: 25 }, adm.token); assert.equal(pr.body.level, 25);
  const audit = (await api('GET', '/api/admin/audit', null, adm.token)).body.audit;
  assert.ok(audit.some(a => a.action === 'coins' && a.target_user === user.id));
  // sınırsız jeton: yönetici büyük bahiste bakiyesi düşmeden oynar
  const before = app.db.prepare("SELECT balance FROM users WHERE username='yonetici'").get().balance;
  for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/spin', { game: 'altin', bet: 100000 }, adm.token)).status, 200);
  assert.ok(app.db.prepare("SELECT balance FROM users WHERE username='yonetici'").get().balance >= before);
  // ayar yönetimi
  assert.equal((await api('PUT', '/api/admin/config/daily', { anchors: [[1, 1000], [100, 20000]] }, adm.token)).status, 200);
  assert.equal((await api('GET', '/api/me', null, token)).body.daily.amount, Math.round((1000 + 19000 * 24 / 99) / 10) * 10);
  await api('PUT', '/api/admin/config/daily', { anchors: [[1, 500], [10, 1000], [20, 2000], [30, 3000], [40, 4000], [50, 5000], [60, 6000], [70, 7000], [80, 8000], [90, 9000], [100, 10000]] }, adm.token);
  assert.equal((await api('PUT', '/api/admin/packages/coins_mega', { name: 'Mega Paket', coins: 12000000, priceLabel: '₺499,99', sort: 5 }, adm.token)).status, 200);
  assert.equal((await api('GET', '/api/shop', null, token)).body.packages.find(p => p.productId === 'coins_mega').coins, 12000000);
  // askıya alma
  await api('POST', `/api/admin/users/${user.id}/status`, { banned: true }, adm.token);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'normal', password: 'Sifre1234' })).status, 403);
  assert.equal((await api('GET', '/api/me', null, token)).status, 401);
  // yönetici rolü API ile başka hesaba verilemez (böyle bir uç yok)
  assert.equal((await api('POST', `/api/admin/users/${user.id}/role`, { role: 'admin' }, adm.token)).status, 404);
});

test('görevler, etkinlik XP çarpanı, arkadaşlar ve hediyeler', async () => {
  const a = await register('ali'); const b = await register('veli');
  await verify('ali', a.token);
  for (const g of ['zeus', 'misir', 'vegas']) await api('POST', '/api/spin', { game: g, bet: 100 }, a.token);
  const qs = (await api('GET', '/api/quests', null, a.token)).body.quests;
  const games = qs.find(q => q.type === 'games'); assert.equal(games.progress, 3);
  const before = (await api('GET', '/api/me', null, a.token)).body.user.balance;
  const c = await api('POST', `/api/quests/${games.id}/claim`, {}, a.token); assert.equal(c.body.reward, 3000); assert.equal(c.body.balance, before + 3000);
  assert.equal((await api('POST', `/api/quests/${games.id}/claim`, {}, a.token)).status, 409);
  // etkinlik: 2x XP
  const adm = (await api('POST', '/api/auth/login', { identifier: 'yonetici', password: 'Admin12345' })).body.token;
  const ev = (await api('POST', '/api/admin/events', { title: 'Hafta sonu 2x XP', startsAt: clock - 1000, endsAt: clock + 3600e3, xpMult: 2, bonusCoins: 5000 }, adm)).body.id;
  const s = await api('POST', '/api/spin', { game: 'zeus', bet: 1000 }, a.token); assert.equal(s.body.xp.gained, 20);
  assert.equal((await api('POST', `/api/events/${ev}/claim`, {}, a.token)).body.reward, 5000);
  assert.equal((await api('POST', `/api/events/${ev}/claim`, {}, a.token)).status, 409);
  await api('POST', '/api/admin/events', { id: ev, title: 'Hafta sonu 2x XP', startsAt: clock - 1000, endsAt: clock - 500, xpMult: 2, bonusCoins: 5000 }, adm);
  // arkadaşlık
  assert.equal((await api('POST', '/api/gifts/send', { to: b.user.id, amount: 1000 }, a.token)).body.error, 'not_friends');
  assert.equal((await api('POST', '/api/friends/request', { username: 'veli' }, a.token)).body.status, 'pending');
  assert.equal((await api('GET', '/api/friends', null, b.token)).body.incoming[0].username, 'ali');
  assert.equal((await api('POST', `/api/friends/${a.user.id}/accept`, {}, b.token)).status, 200);
  const g = await api('POST', '/api/gifts/send', { to: b.user.id, amount: 5000 }, a.token); assert.equal(g.status, 200);
  const inbox = (await api('GET', '/api/friends', null, b.token)).body.gifts; assert.equal(inbox[0].amount, 5000);
  const cl = await api('POST', `/api/gifts/${inbox[0].id}/claim`, {}, b.token); assert.equal(cl.body.balance, 55000);
  assert.equal((await api('POST', `/api/gifts/${inbox[0].id}/claim`, {}, b.token)).status, 404);
  assert.equal((await api('POST', '/api/gifts/send', { to: b.user.id, amount: 777 }, a.token)).body.error, 'bad_amount');
});

test('destek talebi ve yönetici yanıtı', async () => {
  const { token } = await register('destekci');
  const id = (await api('POST', '/api/support', { subject: 'Jeton', message: 'Satın aldığım jetonlar gelmedi' }, token)).body.id;
  const adm = (await api('POST', '/api/auth/login', { identifier: 'yonetici', password: 'Admin12345' })).body.token;
  await api('POST', `/api/admin/tickets/${id}/reply`, { reply: 'Kontrol edildi, yüklendi.' }, adm);
  assert.equal((await api('GET', '/api/support', null, token)).body.tickets[0].status, 'yanitlandi');
});

test('kalıcılık: sunucu kapatılıp açıldığında bakiye, seviye ve oturum korunur', async () => {
  await app.close();
  const a2 = mk('persist.db'); await start(a2);
  const { token, user } = await register('kalici');
  await api('POST', '/api/spin', { game: 'zeus', bet: 1000 }, token);
  const before = (await api('GET', '/api/me', null, token)).body.user;
  await app.close();
  await start(mk('persist.db'));
  const after = (await api('GET', '/api/me', null, token)).body.user;
  assert.equal(after.balance, before.balance); assert.equal(after.xp, before.xp); assert.equal(after.id, user.id);
});

test('bozuk istekler ve hız sınırı', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', body: '{bozuk' }); assert.equal(r.status, 400);
  let last;
  for (let i = 0; i < 7; i++) last = await api('POST', '/api/auth/forgot', { email: 'kimse@ornek.com' });
  assert.equal(last.status, 429);
});

test('bonus satın alma: fiyat %95 RTP katsayısıyla düşer, desteklenmeyen oyunda reddedilir', async () => {
  await app.close(); await start(mk('buy.db'));
  const { token, user } = await register('alici2');
  const cost = Math.round(100 * app.games.zeus.buyCost.fs);
  const r = await api('POST', '/api/spin', { game: 'zeus', bet: 100, buy: 'fs' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.cost, cost);
  assert.equal(r.body.balance, 50000 - cost + r.body.win);
  assert.ok(r.body.result.fs && r.body.result.fs.spins.length >= 15);
  assert.equal(r.body.xp.xp, Math.floor(cost / 100));
  assert.equal((await api('POST', '/api/spin', { game: 'vegas', bet: 100, buy: 'fs' }, token)).body.error, 'no_buy');
  assert.equal((await api('POST', '/api/spin', { game: 'zeus', bet: 100000, buy: 'super' }, token)).status, 402);
  assert.equal(ledgerSum(user.id), r.body.balance);
});
