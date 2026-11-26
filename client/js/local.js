/* YEREL MOD — sunucu adresi tanımlı değilken (APK tek başına) oyunun cihazda çalışması için
 * sunucu API'sinin bir alt kümesini taklit eder. Veriler bu cihazda (localStorage) saklanır.
 * Gerçek satın alma, arkadaşlar/hediye, destek ve yönetici paneli sunucu gerektirir.
 * Sunucu adresi verildiğinde (SLOT_CONFIG.apiBase) bu dosya devre dışı kalır. */
(function () {
  'use strict';
  const BETS = [100, 200, 400, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const THEME = {
    zeus: ['Şimşek tanrısı · X çarpanları', 'SICAK'], misir: ['Firavun mezarı · genişleyen semboller', ''], vegas: ['Klasik meyveler · 777 wild', 'YENİ'],
    peri: ['Çarpan topları · zincirleme patlamalar', 'POPÜLER'], ejderha: ['243 yol · ateş wild çarpanları', ''], korsan: ['Sandık altını · tut ve döndür', ''], altin: ['Altın makine · jackpot çarkı', 'VIP'],
  };
  const PACKS = [['coins_starter', 'Başlangıç Paketi', 500000, '₺49,99', 'Tek seferlik', 1], ['coins_small', 'Küçük Paket', 1000000, '₺79,99', null, 0], ['coins_medium', 'Orta Paket', 2000000, '₺149,99', null, 0], ['coins_large', 'Büyük Paket', 5000000, '₺299,99', '+%25 değer', 0], ['coins_mega', 'Mega Paket', 10000000, '₺499,99', '+%50 değer', 0], ['coins_vip', 'VIP Paket', 20000000, '₺799,99', 'En iyi değer', 0]];
  const ANCH = [[1, 500], [10, 1000], [20, 2000], [30, 3000], [40, 4000], [50, 5000], [60, 6000], [70, 7000], [80, 8000], [90, 9000], [100, 10000]];
  const QUESTS = [{ id: 1, title: '50 spin yap', type: 'spins', target: 50, reward: 2500 }, { id: 2, title: '500.000 jeton bahis yap', type: 'wager', target: 500000, reward: 5000 }, { id: 3, title: 'Bahsinin 20 katı kazan', type: 'bigwin', target: 1, reward: 4000 }, { id: 4, title: '3 farklı oyun oyna', type: 'games', target: 3, reward: 3000 }];
  const DAY = 864e5, MAXL = 100;
  const cumXp = (L) => 500 * (L - 1) + 50 * (L - 1) * (L - 2); const XPMAX = cumXp(MAXL);
  const lvl = (xp) => { let L = 1; while (L < MAXL && cumXp(L + 1) <= xp) L++; return L; };
  const daily = (L) => { if (L <= 1) return 500; for (let i = 1; i < ANCH.length; i++) if (L <= ANCH[i][0]) { const [a, b] = ANCH[i - 1], [c, d] = ANCH[i]; return Math.round((b + (d - b) * (L - a) / (c - a)) / 10) * 10; } return 10000; };
  const dayKey = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  let games = null; const G = () => (games = games || window.SlotEngine.buildGames());
  class Rng { constructor() { const b = new Uint32Array(4); crypto.getRandomValues(b); [this.a, this.b, this.c, this.d] = b; if (!(this.a | this.b | this.c | this.d)) this.a = 1; }
    next() { const rotl = (x, k) => (x << k) | (x >>> (32 - k)); const r = Math.imul(rotl(Math.imul(this.b, 5), 7), 9), t = this.b << 9; this.c ^= this.a; this.d ^= this.b; this.b ^= this.c; this.a ^= this.d; this.c ^= t; this.d = rotl(this.d, 11); return (r >>> 0) / 4294967296; } }

  const KEY = 'slot_local_db';
  let db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  db = db || { users: {}, next: 1, sessions: {}, spins: [] };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  function err(status, code, message) { const e = new Error(message || code); e.status = status; e.code = code; throw e; }
  async function hash(pw, salt) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw)); return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join(''); }
  const tokenOf = () => { try { return localStorage.getItem('slot_token'); } catch (e) { return null; } };
  function me() { const u = db.users[db.sessions[tokenOf()]]; if (!u) err(401, 'unauthorized', 'Lütfen giriş yapın.'); return u; }
  function pub(u) { const L = lvl(u.xp), mx = L >= MAXL; return { id: u.id, username: u.username, email: u.email, emailVerified: true, role: 'player', unlimited: false, balance: u.balance, level: L, xp: u.xp, xpInto: mx ? 0 : u.xp - cumXp(L), xpNeed: mx ? 0 : cumXp(L + 1) - cumXp(L), maxLevel: mx, avatar: u.avatar || 0, spins: u.spins, totalWagered: u.wagered, totalWon: u.won, biggestWin: u.big, createdAt: u.created, billingAccountId: 'local-' + u.id }; }
  const dailyState = (u) => { const next = u.lastDaily ? u.lastDaily + DAY : 0; return { amount: daily(lvl(u.xp)), available: Date.now() >= next, nextAt: next, serverTime: Date.now() }; };
  const lr = (u) => Array.from({ length: 10 }, (_, k) => { const L = (k + 1) * 10, c = !!(u.claims || {})[L]; return { level: L, coins: L * 1000, claimed: c, available: lvl(u.xp) >= L && !c }; });
  function qp(u) { const d = dayKey(); if (!u.q || u.q.day !== d) u.q = { day: d, p: {}, c: {}, g: [] }; return u.q; }
  const R = {
    'POST /api/auth/register': async (b) => {
      const email = String(b.email || '').trim().toLowerCase(), username = String(b.username || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err(400, 'bad_email', 'Geçerli bir e-posta girin.');
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) err(400, 'bad_username', 'Kullanıcı adı 3-16 karakter; harf, rakam ve _ içerebilir.');
      const pw = String(b.password || ''); if (pw.length < 8 || !/\d/.test(pw) || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw)) err(400, 'weak_password', 'Şifre en az 8 karakter, bir harf ve bir rakam içermeli.');
      if (Object.values(db.users).some(u => u.username.toLowerCase() === username.toLowerCase())) err(409, 'username_taken', 'Bu kullanıcı adı alınmış.');
      if (Object.values(db.users).some(u => u.email === email)) err(409, 'email_taken', 'Bu e-posta ile kayıtlı bir hesap var.');
      const id = db.next++, salt = Math.random().toString(36).slice(2);
      db.users[id] = { id, email, username, salt, hash: await hash(pw, salt), balance: 50000, xp: 0, rem: 0, spins: 0, wagered: 0, won: 0, big: 0, created: Date.now(), claims: {} };
      const t = 'L' + crypto.getRandomValues(new Uint32Array(4)).join(''); db.sessions[t] = id; save(); return { token: t, user: pub(db.users[id]), local: true };
    },
    'POST /api/auth/login': async (b) => {
      const idf = String(b.identifier || '').trim(); const u = Object.values(db.users).find(x => x.email === idf.toLowerCase() || x.username.toLowerCase() === idf.toLowerCase());
      if (!u || (await hash(String(b.password || ''), u.salt)) !== u.hash) err(401, 'bad_credentials', 'Kullanıcı adı/e-posta veya şifre hatalı.');
      const t = 'L' + crypto.getRandomValues(new Uint32Array(4)).join(''); db.sessions[t] = u.id; save(); return { token: t, user: pub(u) };
    },
    'POST /api/auth/logout': () => { delete db.sessions[tokenOf()]; save(); return { ok: true }; },
    'POST /api/auth/forgot': () => err(400, 'local', 'Yerel modda şifre sıfırlama e-postası gönderilemez. Sunucu bağlantılı sürümde kullanılabilir.'),
    'POST /api/auth/resend-verification': () => ({ ok: true, already: true }),
    'POST /api/auth/verify-email': () => ({ ok: true }),
    'POST /api/auth/change-password': async (b) => { const u = me(); if ((await hash(String(b.current || ''), u.salt)) !== u.hash) err(401, 'bad_credentials', 'Mevcut şifre hatalı.'); u.hash = await hash(String(b.password), u.salt); save(); return { ok: true }; },
    'GET /api/me': () => { const u = me(); return { user: pub(u), daily: dailyState(u), levelRewards: lr(u), events: [], badges: { gifts: 0, friendRequests: 0 }, serverTime: Date.now(), local: true }; },
    'POST /api/me/avatar': (b) => { me().avatar = +b.avatar || 0; save(); return { ok: true }; },
    'GET /api/games': () => ({ bets: BETS, games: window.SlotEngine.ORDER.map(id => { const g = G()[id]; return { id, name: g.name, family: g.family, tag: THEME[id][0], rib: THEME[id][1], info: g.info, rtp: 0.95, volatility: 'yüksek' }; }) }),
    'POST /api/spin': (b) => {
      const u = me(), g = G()[b.game]; if (!g) err(404, 'unknown_game'); const bet = +b.bet; if (!BETS.includes(bet)) err(400, 'bad_bet', 'Geçersiz bahis.');
      const bk = b.buy || null; if (bk && !g.buyCost[bk]) err(400, 'no_buy', 'Bu oyunda bu bonus satın alınamaz.');
      const cost = bk ? Math.round(bet * g.buyCost[bk]) : bet;
      if (u.balance < cost) err(402, 'insufficient_funds', 'Yetersiz jeton. Mağazadan jeton alabilir veya günlük ödülünü toplayabilirsin.');
      const result = bk ? g.buy(new Rng(), true, bk) : g.play(new Rng(), true), win = Math.round(result.win * bet), old = lvl(u.xp);
      u.balance += win - cost; const acc = u.rem + cost; u.xp = Math.min(XPMAX, u.xp + Math.floor(acc / 100)); u.rem = acc % 100; u.spins++; u.wagered += cost; u.won += win; u.big = Math.max(u.big, win);
      const q = qp(u); q.p[1] = (q.p[1] || 0) + 1; q.p[2] = (q.p[2] || 0) + cost; if (!bk && win >= bet * 20) q.p[3] = (q.p[3] || 0) + 1; if (!q.g.includes(b.game)) q.g.push(b.game); q.p[4] = q.g.length;
      const L = lvl(u.xp), mx = L >= MAXL; db.spins.unshift({ id: Date.now(), game: b.game, bet, win, nonce: u.spins, created_at: Date.now(), server_seed_hash: 'yerel' }); db.spins.length = Math.min(db.spins.length, 50); save();
      return { game: b.game, bet, cost, buy: bk, win, winX: result.win, result, balance: u.balance, xp: { gained: Math.floor(acc / 100), xp: u.xp, level: L, into: mx ? 0 : u.xp - cumXp(L), need: mx ? 0 : cumXp(L + 1) - cumXp(L), max: mx, levelUp: L > old ? L : null }, fair: { serverSeedHash: 'yerel mod', clientSeed: '-', nonce: u.spins } };
    },
    'GET /api/spins': () => ({ spins: db.spins }),
    'GET /api/fair': () => ({ serverSeedHash: 'Yerel modda denetlenebilir RNG sunucuda çalışır', clientSeed: '-', nonce: me().spins, revealed: [] }),
    'POST /api/fair/rotate': () => err(400, 'local', 'Denetlenebilir RNG sunucu bağlantılı sürümde kullanılır.'),
    'POST /api/daily/claim': () => { const u = me(), st = dailyState(u); if (!st.available) err(409, 'not_yet', 'Günlük ödül henüz hazır değil.'); u.lastDaily = Date.now(); u.balance += st.amount; save(); return { amount: st.amount, balance: u.balance, daily: dailyState(u) }; },
    'GET /api/quests': () => { const u = me(), q = qp(u); return { day: q.day, quests: QUESTS.map(x => ({ ...x, progress: Math.min(x.target, q.p[x.id] || 0), claimed: q.c[x.id] ? 1 : 0 })) }; },
    'GET /api/events': () => ({ events: [] }),
    'GET /api/shop': () => { const u = me(); return { packages: PACKS.map(p => ({ productId: p[0], name: p[1], coins: p[2], priceLabel: p[3], bonusLabel: p[4], oneTime: !!p[5], available: !(p[5] && u.starter) })), billingAccountId: 'local-' + u.id, emailVerified: true, testMode: false, notice: 'Ödemeler Google Play üzerinden yapılır. Jetonlar yalnızca oyun içinde kullanılır; nakde çevrilemez, para veya ödül olarak çekilemez.' }; },
    // Yerel mod: Google Play'in cihaza verdiği satın alma onayına güvenilir (sunucu bağlanınca doğrulama sunucuya geçer)
    'POST /api/shop/verify': (b) => {
      const u = me(); const p = PACKS.find(x => x[0] === b.productId); if (!p) err(404, 'unknown_product', 'Ürün bulunamadı.');
      db.purchases = db.purchases || [];
      const ex = db.purchases.find(x => x.token === b.purchaseToken);
      if (b.state === 'pending') { if (!ex) db.purchases.unshift({ id: Date.now(), token: b.purchaseToken, uid: u.id, product_id: p[0], name: p[1], state: 'pending', coins: 0, order_id: b.orderId || '', created_at: Date.now() }); save(); return { status: 'pending', balance: u.balance }; }
      if (ex && ex.state === 'purchased') return { status: 'purchased', coins: 0, balance: u.balance, alreadyCredited: true };
      if (p[5] && u.starter) err(409, 'one_time', 'Başlangıç paketi yalnızca bir kez alınabilir.');
      u.balance += p[2]; if (p[5]) u.starter = 1;
      if (ex) Object.assign(ex, { state: 'purchased', coins: p[2] }); else db.purchases.unshift({ id: Date.now(), token: b.purchaseToken, uid: u.id, product_id: p[0], name: p[1], state: 'purchased', coins: p[2], order_id: b.orderId || '', created_at: Date.now() });
      save(); return { status: 'purchased', coins: p[2], balance: u.balance, credited: true };
    },
    'GET /api/shop/history': () => { const u = me(); return { purchases: (db.purchases || []).filter(x => x.uid === u.id) }; },
    'GET /api/friends': () => ({ friends: [], incoming: [], outgoing: [], gifts: [], giftAmounts: [1000, 5000, 10000], giftDailyLimit: 5 }),
    'POST /api/friends/request': () => err(400, 'local', 'Arkadaş sistemi sunucu bağlantısı gerektirir.'),
    'GET /api/support': () => ({ tickets: [] }),
    'POST /api/support': () => err(400, 'local', 'Destek talebi sunucu bağlantısı gerektirir.'),
    'GET /api/health': () => ({ ok: true }),
  };
  async function handle(method, path, body) {
    const p = path.split('?')[0];
    let m = /^\/api\/level-rewards\/(\d+)\/claim$/.exec(p);
    if (m) { const u = me(), L = +m[1]; if (lvl(u.xp) < L) err(409, 'level_too_low', 'Bu ödül için seviyen yetersiz.'); if (u.claims[L]) err(409, 'already_claimed', 'Bu ödül zaten alındı.'); u.claims[L] = 1; u.balance += L * 1000; save(); return { level: L, coins: L * 1000, balance: u.balance, celebrate: L === 100 }; }
    m = /^\/api\/quests\/(\d+)\/claim$/.exec(p);
    if (m) { const u = me(), q = qp(u), x = QUESTS.find(y => y.id === +m[1]); if (!x || (q.p[x.id] || 0) < x.target) err(409, 'not_complete', 'Görev henüz tamamlanmadı.'); if (q.c[x.id]) err(409, 'already_claimed', 'Ödül zaten alındı.'); q.c[x.id] = 1; u.balance += x.reward; save(); return { reward: x.reward, balance: u.balance }; }
    if (p.startsWith('/api/admin')) err(403, 'forbidden', 'Yönetici paneli sunucu bağlantısı gerektirir.');
    const f = R[method + ' ' + p]; if (!f) err(400, 'local', 'Bu özellik sunucu bağlantısı gerektirir.');
    return f(body || {});
  }
  window.LocalApi = { handle };
})();
