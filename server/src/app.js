'use strict';
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Router, HttpError, err, readBody, serveStatic, RateLimiter } = require('./http');
const C = require('./core');
const { openDb } = require('./db');
const { buildGames, ORDER } = require('./games/engine');
const { FairRng, newServerSeed, hashSeed } = require('./games/rng');
const { createVerifier } = require('./billing');
const { createMailer } = require('./mailer');

const BETS = [100, 200, 400, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const THEME = {
  zeus: { tag: 'Şimşek tanrısı · X çarpanları', rib: 'SICAK' },
  misir: { tag: 'Firavun mezarı · genişleyen semboller', rib: '' },
  vegas: { tag: 'Klasik meyveler · 777 wild', rib: 'YENİ' },
  peri: { tag: 'Çarpan topları · zincirleme patlamalar', rib: 'POPÜLER' },
  ejderha: { tag: '243 yol · ateş wild çarpanları', rib: '' },
  korsan: { tag: 'Sandık altını · tut ve döndür', rib: '' },
  altin: { tag: 'Altın makine · jackpot çarkı', rib: 'VIP' },
};

function createApp(cfg) {
  const now = cfg.clock || (() => Date.now());
  const db = openDb(cfg.dbFile);
  const games = buildGames();
  const verifier = cfg.verifier || createVerifier(cfg);
  const mailer = createMailer(db, cfg, cfg.logger || console);
  const rl = new RateLimiter();
  const r = new Router();
  const tz = cfg.tzOffsetMin ?? 180;

  /* ---------- yönetici hesabını hazırla (yalnızca ortam değişkenlerinden) ---------- */
  if (cfg.admin && cfg.admin.email && cfg.admin.password) {
    const ex = db.prepare('SELECT id FROM users WHERE email=? OR username=?').get(cfg.admin.email, cfg.admin.username);
    if (!ex) {
      db.prepare('INSERT INTO users(email,username,pass_hash,role,unlimited,email_verified,balance,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(cfg.admin.email, cfg.admin.username, C.hashPassword(cfg.admin.password), 'admin', 1, 1, 0, now());
    } else {
      db.prepare("UPDATE users SET role='admin', unlimited=1 WHERE id=?").run(ex.id);
    }
  }

  /* ---------- yardımcılar ---------- */
  const obfId = (uid) => crypto.createHmac('sha256', cfg.secret).update('acct:' + uid).digest('hex').slice(0, 40);
  function pub(u) {
    const li = C.levelInfo(u.xp);
    return {
      id: u.id, username: u.username, email: u.email, emailVerified: !!u.email_verified, role: u.role,
      unlimited: !!u.unlimited, balance: u.balance, level: li.level, xp: u.xp, xpInto: li.into, xpNeed: li.need, maxLevel: li.max,
      avatar: u.avatar, spins: u.spins, totalWagered: u.total_wagered, totalWon: u.total_won, biggestWin: u.biggest_win,
      createdAt: u.created_at, billingAccountId: obfId(u.id),
    };
  }
  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  function limit(ctx, name, max, win) { const o = cfg.limitOverrides && cfg.limitOverrides[name.split(':')[0]]; if (o) max = o; if (!rl.hit(name + ':' + ctx.ip, max, win, now())) throw err(429, 'rate_limited', 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.'); }
  function str(v, name, max = 200) { if (typeof v !== 'string' || !v.trim()) throw err(400, 'missing_' + name); return v.trim().slice(0, max); }
  function int(v, name, min = -Infinity, max = Infinity) { const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > max) throw err(400, 'bad_' + name); return n; }
  function audit(ctx, action, target, details) { db.prepare('INSERT INTO audit(admin_id,action,target_user,details,created_at) VALUES(?,?,?,?,?)').run(ctx.user.id, action, target ?? null, JSON.stringify(details || {}), now()); }
  function activeEvents() { const t = now(); return db.prepare('SELECT * FROM events WHERE active=1 AND starts_at<=? AND ends_at>? ORDER BY ends_at').all(t, t); }

  async function issueToken(user, type, ttlMs) {
    const code = C.randomCode(8);
    db.prepare('UPDATE tokens SET used=1 WHERE user_id=? AND type=? AND used=0').run(user.id, type);
    db.prepare('INSERT INTO tokens(token_hash,user_id,type,expires_at) VALUES(?,?,?,?)').run(C.sha256(type + ':' + code), user.id, type, now() + ttlMs);
    return code;
  }
  function useToken(type, code) {
    const t = db.prepare('SELECT * FROM tokens WHERE token_hash=?').get(C.sha256(type + ':' + String(code || '').trim().toUpperCase()));
    if (!t || t.used || t.expires_at < now()) throw err(400, 'invalid_code', 'Kod geçersiz veya süresi dolmuş.');
    db.prepare('UPDATE tokens SET used=1 WHERE token_hash=?').run(t.token_hash);
    return t;
  }
  async function sendVerify(user) {
    const code = await issueToken(user, 'verify', 48 * 3600e3);
    await mailer.send(user.email, 'SLOT SALONU e-posta doğrulama', `Merhaba ${user.username},\n\nDoğrulama kodun: ${code}\nYa da bağlantıya tıkla: ${cfg.publicUrl}/api/auth/verify-email?code=${code}\n\nKod 48 saat geçerlidir.`);
  }
  function createSession(user) {
    const tok = C.randomToken();
    db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(C.sha256(tok), user.id, now(), now() + 60 * C.DAY_MS);
    db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(now(), user.id);
    return tok;
  }

  /* ---------- ara katmanlar ---------- */
  const auth = (ctx) => {
    const h = ctx.req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) throw err(401, 'unauthorized');
    const s = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(C.sha256(tok));
    if (!s || s.expires_at < now()) throw err(401, 'unauthorized', 'Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    const u = getUser(s.user_id);
    if (!u) throw err(401, 'unauthorized');
    if (u.banned) throw err(403, 'banned', 'Hesabınız askıya alınmış. Destek ile iletişime geçin.');
    ctx.user = u; ctx.sessionHash = s.token_hash;
  };
  const admin = (ctx) => { auth(ctx); if (ctx.user.role !== 'admin') throw err(403, 'forbidden', 'Bu alan yalnızca yöneticiye açıktır.'); };
  const verified = (ctx) => { if (!ctx.user.email_verified) throw err(403, 'email_not_verified', 'Bu işlem için e-postanızı doğrulayın.'); };

  /* ================= ÜYELİK ================= */
  r.post('/api/auth/register', async (ctx) => {
    limit(ctx, 'register', 8, 10 * 60e3);
    const email = str(ctx.body.email, 'email', 254).toLowerCase();
    const username = str(ctx.body.username, 'username', 16);
    if (!C.EMAIL_RE.test(email)) throw err(400, 'bad_email', 'Geçerli bir e-posta girin.');
    if (!C.USER_RE.test(username)) throw err(400, 'bad_username', 'Kullanıcı adı 3-16 karakter; harf, rakam ve _ içerebilir.');
    C.checkPassword(ctx.body.password);
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) throw err(409, 'username_taken', 'Bu kullanıcı adı alınmış.');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw err(409, 'email_taken', 'Bu e-posta ile kayıtlı bir hesap var.');
    const hash = C.hashPassword(ctx.body.password);
    const start = db.setting('starting_coins') || 0;
    const user = db.tx(() => {
      const id = db.prepare('INSERT INTO users(email,username,pass_hash,balance,created_at) VALUES(?,?,?,0,?)').run(email, username, hash, now()).lastInsertRowid;
      if (start > 0) C.applyCoins(db, id, start, 'welcome', null, now());
      return getUser(id);
    });
    await sendVerify(user);
    return { token: createSession(user), user: pub(getUser(user.id)) };
  });

  r.post('/api/auth/login', (ctx) => {
    limit(ctx, 'login', 10, 60e3);
    const id = str(ctx.body.identifier ?? ctx.body.email ?? ctx.body.username, 'identifier', 254);
    const u = db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(id.toLowerCase(), id);
    const okPw = u ? C.verifyPassword(String(ctx.body.password || ''), u.pass_hash) : (C.verifyPassword('x', 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '=='), false);
    if (!u || !okPw) throw err(401, 'bad_credentials', 'Kullanıcı adı/e-posta veya şifre hatalı.');
    if (u.banned) throw err(403, 'banned', 'Hesabınız askıya alınmış. Destek ile iletişime geçin.');
    return { token: createSession(u), user: pub(u) };
  });

  r.post('/api/auth/logout', auth, (ctx) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(ctx.sessionHash); return { ok: true }; });

  r.post('/api/auth/resend-verification', auth, async (ctx) => {
    limit(ctx, 'resend', 3, 10 * 60e3);
    if (ctx.user.email_verified) return { ok: true, already: true };
    await sendVerify(ctx.user); return { ok: true };
  });
  const doVerify = (code) => { const t = useToken('verify', code); db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(t.user_id); return t.user_id; };
  r.post('/api/auth/verify-email', (ctx) => { limit(ctx, 'verify', 15, 10 * 60e3); const uid = doVerify(ctx.body.code); return { ok: true, user: pub(getUser(uid)) }; });
  r.get('/api/auth/verify-email', (ctx) => {
    limit(ctx, 'verify', 15, 10 * 60e3);
    let msg; try { doVerify(ctx.query.get('code')); msg = 'E-posta adresin doğrulandı! Uygulamaya dönebilirsin.'; } catch (e) { msg = e.message; }
    return { __html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;background:#1b0b3a;color:#fff;text-align:center;padding:60px 20px"><h1 style="color:#ffcf5a">SLOT SALONU</h1><p>${msg}</p></body>` };
  });

  r.post('/api/auth/forgot', async (ctx) => {
    limit(ctx, 'forgot', 5, 10 * 60e3);
    const id = str(ctx.body.email ?? ctx.body.identifier, 'email', 254);
    const u = db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(id.toLowerCase(), id);
    if (u) {
      const code = await issueToken(u, 'reset', 30 * 60e3);
      await mailer.send(u.email, 'SLOT SALONU şifre sıfırlama', `Merhaba ${u.username},\n\nŞifre sıfırlama kodun: ${code}\nKod 30 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.`);
    }
    return { ok: true }; // hesabın var olup olmadığını açığa vurmaz
  });
  r.post('/api/auth/reset', (ctx) => {
    limit(ctx, 'reset', 10, 10 * 60e3);
    C.checkPassword(ctx.body.password);
    const t = useToken('reset', ctx.body.code);
    db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(C.hashPassword(ctx.body.password), t.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.user_id);
    return { ok: true };
  });
  r.post('/api/auth/change-password', auth, (ctx) => {
    if (!C.verifyPassword(String(ctx.body.current || ''), ctx.user.pass_hash)) throw err(401, 'bad_credentials', 'Mevcut şifre hatalı.');
    C.checkPassword(ctx.body.password);
    db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(C.hashPassword(ctx.body.password), ctx.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(ctx.user.id, ctx.sessionHash);
    return { ok: true };
  });

  /* ================= PROFİL / DURUM ================= */
  function dailyState(u) {
    const amount = C.dailyAmount(C.levelFromXp(u.xp), db.setting('daily_anchors'));
    const next = u.last_daily_at ? u.last_daily_at + C.DAY_MS : 0;
    return { amount, available: now() >= next, nextAt: next, serverTime: now() };
  }
  function levelRewardsState(u) {
    const lvl = C.levelFromXp(u.xp);
    const claimed = new Set(db.prepare('SELECT level FROM level_claims WHERE user_id=?').all(u.id).map(x => x.level));
    return db.prepare('SELECT * FROM level_rewards ORDER BY level').all().map(x => ({ level: x.level, coins: x.coins, claimed: claimed.has(x.level), available: lvl >= x.level && !claimed.has(x.level) }));
  }
  r.get('/api/me', auth, (ctx) => {
    const u = ctx.user;
    const gifts = db.prepare('SELECT COUNT(*) c FROM gifts WHERE to_id=? AND claimed_at IS NULL').get(u.id).c;
    const reqs = db.prepare("SELECT COUNT(*) c FROM friends WHERE friend_id=? AND status='pending'").get(u.id).c;
    return { user: pub(u), daily: dailyState(u), levelRewards: levelRewardsState(u), events: activeEvents(), badges: { gifts, friendRequests: reqs }, serverTime: now() };
  });
  r.post('/api/me/avatar', auth, (ctx) => { db.prepare('UPDATE users SET avatar=? WHERE id=?').run(int(ctx.body.avatar, 'avatar', 0, 11), ctx.user.id); return { ok: true }; });
  r.get('/api/levels', (ctx) => ({ maxLevel: C.MAX_LEVEL, table: Array.from({ length: C.MAX_LEVEL }, (_, i) => ({ level: i + 1, totalXp: C.cumXp(i + 1) })), xpPer: 100 }));

  r.post('/api/daily/claim', auth, (ctx) => db.tx(() => {
    const u = getUser(ctx.user.id); const st = dailyState(u);
    if (!st.available) throw err(409, 'not_yet', 'Günlük ödül henüz hazır değil.');
    db.prepare('UPDATE users SET last_daily_at=? WHERE id=?').run(now(), u.id);
    const w = C.applyCoins(db, u, st.amount, 'daily', null, now());
    return { amount: st.amount, balance: w.balance, daily: dailyState(getUser(u.id)) };
  }));

  r.post('/api/level-rewards/:level/claim', auth, (ctx) => db.tx(() => {
    const L = int(ctx.params.level, 'level', 1, C.MAX_LEVEL);
    const u = getUser(ctx.user.id);
    const rw = db.prepare('SELECT * FROM level_rewards WHERE level=?').get(L);
    if (!rw) throw err(404, 'no_reward');
    if (C.levelFromXp(u.xp) < L) throw err(409, 'level_too_low', 'Bu ödül için seviyen yetersiz.');
    if (db.prepare('SELECT 1 FROM level_claims WHERE user_id=? AND level=?').get(u.id, L)) throw err(409, 'already_claimed', 'Bu ödül zaten alındı.');
    db.prepare('INSERT INTO level_claims(user_id,level,coins,claimed_at) VALUES(?,?,?,?)').run(u.id, L, rw.coins, now());
    const w = C.applyCoins(db, u, rw.coins, 'level_reward', L, now());
    return { level: L, coins: rw.coins, balance: w.balance, celebrate: L === C.MAX_LEVEL };
  }));

  /* ================= OYUNLAR ================= */
  r.get('/api/games', () => ({
    bets: BETS,
    games: ORDER.map(id => { const g = games[id]; return { id, name: g.name, family: g.family, ...THEME[id], info: g.info, rtp: 0.95, volatility: 'yüksek' }; }),
  }));

  function seedRow(uid) {
    let s = db.prepare('SELECT * FROM seeds WHERE user_id=?').get(uid);
    if (!s) { const ss = newServerSeed(); db.prepare('INSERT INTO seeds(user_id,server_seed,server_seed_hash,client_seed,nonce) VALUES(?,?,?,?,0)').run(uid, ss, hashSeed(ss), crypto.randomBytes(8).toString('hex')); s = db.prepare('SELECT * FROM seeds WHERE user_id=?').get(uid); }
    return s;
  }
  r.get('/api/fair', auth, (ctx) => { const s = seedRow(ctx.user.id); return { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce, revealed: db.prepare('SELECT server_seed,server_seed_hash,client_seed,last_nonce,revealed_at FROM revealed_seeds WHERE user_id=? ORDER BY id DESC LIMIT 20').all(ctx.user.id) }; });
  r.post('/api/fair/rotate', auth, (ctx) => db.tx(() => {
    const s = seedRow(ctx.user.id);
    const cs = ctx.body.clientSeed ? str(ctx.body.clientSeed, 'clientSeed', 64) : crypto.randomBytes(8).toString('hex');
    db.prepare('INSERT INTO revealed_seeds(user_id,server_seed,server_seed_hash,client_seed,last_nonce,revealed_at) VALUES(?,?,?,?,?,?)').run(ctx.user.id, s.server_seed, s.server_seed_hash, s.client_seed, s.nonce - 1, now());
    const ss = newServerSeed();
    db.prepare('UPDATE seeds SET server_seed=?,server_seed_hash=?,client_seed=?,nonce=0 WHERE user_id=?').run(ss, hashSeed(ss), cs, ctx.user.id);
    return { revealed: { serverSeed: s.server_seed, serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, lastNonce: s.nonce - 1 }, next: { serverSeedHash: hashSeed(ss), clientSeed: cs } };
  }));

  function questTick(uid, ev) {
    const day = C.dayKey(now(), tz);
    for (const q of db.prepare('SELECT * FROM quests WHERE active=1').all()) {
      let row = db.prepare('SELECT * FROM quest_progress WHERE user_id=? AND quest_id=? AND day=?').get(uid, q.id, day);
      if (!row) { db.prepare('INSERT INTO quest_progress(user_id,quest_id,day,progress,meta) VALUES(?,?,?,0,?)').run(uid, q.id, day, '[]'); row = { progress: 0, meta: '[]' }; }
      let p = row.progress, meta = row.meta;
      if (q.type === 'spins') p += 1;
      else if (q.type === 'wager') p += ev.bet;
      else if (q.type === 'bigwin') { if (ev.win >= ev.bet * 20) p += 1; }
      else if (q.type === 'games') { const set = new Set(JSON.parse(meta || '[]')); set.add(ev.game); meta = JSON.stringify([...set]); p = set.size; }
      p = Math.min(p, q.target);
      db.prepare('UPDATE quest_progress SET progress=?, meta=? WHERE user_id=? AND quest_id=? AND day=?').run(p, meta, uid, q.id, day);
    }
  }

  r.post('/api/spin', auth, (ctx) => {
    const gid = str(ctx.body.game, 'game', 20);
    const game = games[gid]; if (!game) throw err(404, 'unknown_game');
    const bet = int(ctx.body.bet, 'bet'); if (!BETS.includes(bet)) throw err(400, 'bad_bet', 'Geçersiz bahis.');
    const key = ctx.body.key ? str(ctx.body.key, 'key', 64) : crypto.randomUUID();
    limit(ctx, 'spin:' + ctx.user.id, 20, 1000);
    const prev = db.prepare('SELECT response FROM spins WHERE user_id=? AND client_key=?').get(ctx.user.id, key);
    if (prev) { if (!prev.response) throw err(409, 'spin_expired'); return { ...JSON.parse(prev.response), replay: true }; }
    return db.tx(() => {
      const u = getUser(ctx.user.id);
      if (!u.unlimited && u.balance < bet) throw err(402, 'insufficient_funds', 'Yetersiz jeton. Mağazadan jeton alabilir veya günlük ödülünü toplayabilirsin.');
      const s = seedRow(u.id);
      db.prepare('UPDATE seeds SET nonce=nonce+1 WHERE user_id=?').run(u.id);
      C.applyCoins(db, u, -bet, 'bet', gid, now());
      const rng = new FairRng(s.server_seed, s.client_seed, s.nonce);
      const result = game.play(rng, true);
      const win = Math.round(result.win * bet);
      let w = { balance: getUser(u.id).balance };
      if (win > 0) w = C.applyCoins(db, u, win, 'win', gid, now());
      // XP: her 100 jeton bahis = 1 XP (etkinlik çarpanı uygulanabilir)
      const xpMult = Math.max(1, ...activeEvents().map(e => e.xp_mult));
      const acc = u.wager_rem + bet;
      const gained = Math.floor(acc / 100) * xpMult;
      const oldLevel = C.levelFromXp(u.xp);
      const xp = Math.min(C.XP_MAX, u.xp + gained);
      const level = C.levelFromXp(xp);
      db.prepare('UPDATE users SET xp=?, level=?, wager_rem=?, total_wagered=total_wagered+?, total_won=total_won+?, spins=spins+1, biggest_win=MAX(biggest_win,?) WHERE id=?').run(xp, level, acc % 100, bet, win, win, u.id);
      questTick(u.id, { bet, win, game: gid });
      const li = C.levelInfo(xp);
      const resp = {
        game: gid, bet, win, winX: result.win, result, balance: w.balance,
        xp: { gained, xp, level, into: li.into, need: li.need, max: li.max, levelUp: level > oldLevel ? level : null },
        fair: { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce },
      };
      db.prepare('INSERT INTO spins(user_id,game,bet,win,client_key,server_seed_hash,client_seed,nonce,response,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(u.id, gid, bet, win, key, s.server_seed_hash, s.client_seed, s.nonce, JSON.stringify(resp), now());
      return resp;
    });
  });
  r.get('/api/spins', auth, (ctx) => ({ spins: db.prepare('SELECT id,game,bet,win,server_seed_hash,client_seed,nonce,created_at FROM spins WHERE user_id=? ORDER BY id DESC LIMIT 50').all(ctx.user.id) }));

  /* ================= GÖREVLER / ETKİNLİKLER ================= */
  r.get('/api/quests', auth, (ctx) => {
    const day = C.dayKey(now(), tz);
    return { day, quests: db.prepare('SELECT q.*, COALESCE(p.progress,0) progress, COALESCE(p.claimed,0) claimed FROM quests q LEFT JOIN quest_progress p ON p.quest_id=q.id AND p.user_id=? AND p.day=? WHERE q.active=1 ORDER BY q.id').all(ctx.user.id, day) };
  });
  r.post('/api/quests/:id/claim', auth, (ctx) => db.tx(() => {
    const day = C.dayKey(now(), tz); const qid = int(ctx.params.id, 'id', 1);
    const q = db.prepare('SELECT * FROM quests WHERE id=? AND active=1').get(qid); if (!q) throw err(404, 'no_quest');
    const p = db.prepare('SELECT * FROM quest_progress WHERE user_id=? AND quest_id=? AND day=?').get(ctx.user.id, qid, day);
    if (!p || p.progress < q.target) throw err(409, 'not_complete', 'Görev henüz tamamlanmadı.');
    if (p.claimed) throw err(409, 'already_claimed', 'Ödül zaten alındı.');
    db.prepare('UPDATE quest_progress SET claimed=1 WHERE user_id=? AND quest_id=? AND day=?').run(ctx.user.id, qid, day);
    return { reward: q.reward, balance: C.applyCoins(db, ctx.user, q.reward, 'quest', qid, now()).balance };
  }));
  r.get('/api/events', auth, (ctx) => ({ events: activeEvents().map(e => ({ ...e, claimed: !!db.prepare('SELECT 1 FROM event_claims WHERE user_id=? AND event_id=?').get(ctx.user.id, e.id) })) }));
  r.post('/api/events/:id/claim', auth, (ctx) => db.tx(() => {
    const e = activeEvents().find(x => x.id === int(ctx.params.id, 'id', 1));
    if (!e || e.bonus_coins <= 0) throw err(404, 'no_event');
    if (db.prepare('SELECT 1 FROM event_claims WHERE user_id=? AND event_id=?').get(ctx.user.id, e.id)) throw err(409, 'already_claimed', 'Etkinlik ödülü zaten alındı.');
    db.prepare('INSERT INTO event_claims VALUES(?,?,?)').run(ctx.user.id, e.id, now());
    return { reward: e.bonus_coins, balance: C.applyCoins(db, ctx.user, e.bonus_coins, 'event', e.id, now()).balance };
  }));

  /* ================= ARKADAŞLAR / HEDİYE ================= */
  r.get('/api/friends', auth, (ctx) => {
    const id = ctx.user.id;
    const q = (sql) => db.prepare(sql).all(id);
    return {
      friends: q("SELECT u.id,u.username,u.level,u.avatar FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='accepted' ORDER BY u.username"),
      incoming: q("SELECT u.id,u.username,u.level,u.avatar FROM friends f JOIN users u ON u.id=f.user_id WHERE f.friend_id=? AND f.status='pending'"),
      outgoing: q("SELECT u.id,u.username,u.level,u.avatar FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND f.status='pending'"),
      gifts: db.prepare('SELECT g.id,g.amount,g.created_at,u.username FROM gifts g JOIN users u ON u.id=g.from_id WHERE g.to_id=? AND g.claimed_at IS NULL ORDER BY g.id').all(id),
      giftAmounts: db.setting('gift_amounts'), giftDailyLimit: db.setting('gift_daily_limit'),
    };
  });
  r.post('/api/friends/request', auth, (ctx) => {
    limit(ctx, 'freq:' + ctx.user.id, 20, 60 * 60e3);
    const t = db.prepare('SELECT id FROM users WHERE username=?').get(str(ctx.body.username, 'username', 16));
    if (!t) throw err(404, 'user_not_found', 'Kullanıcı bulunamadı.');
    if (t.id === ctx.user.id) throw err(400, 'self', 'Kendini ekleyemezsin.');
    return db.tx(() => {
      const back = db.prepare('SELECT * FROM friends WHERE user_id=? AND friend_id=?').get(t.id, ctx.user.id);
      if (back && back.status === 'pending') { // karşı taraf zaten istek göndermiş -> kabul et
        db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run(t.id, ctx.user.id);
        db.prepare("INSERT OR REPLACE INTO friends VALUES(?,?,'accepted',?)").run(ctx.user.id, t.id, now());
        return { status: 'accepted' };
      }
      if (db.prepare('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?').get(ctx.user.id, t.id)) return { status: 'exists' };
      db.prepare("INSERT INTO friends VALUES(?,?,'pending',?)").run(ctx.user.id, t.id, now());
      return { status: 'pending' };
    });
  });
  r.post('/api/friends/:id/accept', auth, (ctx) => db.tx(() => {
    const fid = int(ctx.params.id, 'id', 1);
    const req = db.prepare("SELECT * FROM friends WHERE user_id=? AND friend_id=? AND status='pending'").get(fid, ctx.user.id);
    if (!req) throw err(404, 'no_request');
    db.prepare("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?").run(fid, ctx.user.id);
    db.prepare("INSERT OR REPLACE INTO friends VALUES(?,?,'accepted',?)").run(ctx.user.id, fid, now());
    return { ok: true };
  }));
  r.post('/api/friends/:id/remove', auth, (ctx) => { const fid = int(ctx.params.id, 'id', 1); db.prepare('DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)').run(ctx.user.id, fid, fid, ctx.user.id); return { ok: true }; });

  r.post('/api/gifts/send', auth, verified, (ctx) => db.tx(() => {
    const to = int(ctx.body.to, 'to', 1); const amount = int(ctx.body.amount, 'amount', 1);
    if (!db.setting('gift_amounts').includes(amount)) throw err(400, 'bad_amount');
    if (!db.prepare("SELECT 1 FROM friends WHERE user_id=? AND friend_id=? AND status='accepted'").get(ctx.user.id, to)) throw err(403, 'not_friends', 'Sadece arkadaşlarına hediye gönderebilirsin.');
    const since = now() - C.DAY_MS;
    const sent = db.prepare('SELECT COUNT(*) c FROM gifts WHERE from_id=? AND created_at>?').get(ctx.user.id, since).c;
    if (sent >= db.setting('gift_daily_limit')) throw err(429, 'gift_limit', 'Günlük hediye limitine ulaştın.');
    const w = C.applyCoins(db, ctx.user, -amount, 'gift_sent', to, now());
    db.prepare('INSERT INTO gifts(from_id,to_id,amount,created_at) VALUES(?,?,?,?)').run(ctx.user.id, to, amount, now());
    return { balance: w.balance };
  }));
  r.post('/api/gifts/:id/claim', auth, (ctx) => db.tx(() => {
    const g = db.prepare('SELECT * FROM gifts WHERE id=? AND to_id=? AND claimed_at IS NULL').get(int(ctx.params.id, 'id', 1), ctx.user.id);
    if (!g) throw err(404, 'no_gift');
    db.prepare('UPDATE gifts SET claimed_at=? WHERE id=?').run(now(), g.id);
    return { amount: g.amount, balance: C.applyCoins(db, ctx.user, g.amount, 'gift_received', g.from_id, now()).balance };
  }));

  /* ================= MAĞAZA / ÖDEME ================= */
  r.get('/api/shop', auth, (ctx) => ({
    packages: db.prepare('SELECT * FROM packages WHERE active=1 ORDER BY sort').all().map(p => ({ productId: p.product_id, name: p.name, coins: p.coins, priceLabel: p.price_label, bonusLabel: p.bonus_label, oneTime: !!p.one_time, available: !(p.one_time && ctx.user.starter_bought) })),
    billingAccountId: obfId(ctx.user.id), emailVerified: !!ctx.user.email_verified, testMode: cfg.billingMode !== 'google',
    notice: 'Jetonlar yalnızca uygulama içinde eğlence amaçlı kullanılır; nakde çevrilemez, para veya ödül olarak çekilemez.',
  }));

  async function processPurchase(userId, productId, token, source) {
    const pkg = db.prepare('SELECT * FROM packages WHERE product_id=?').get(productId);
    if (!pkg) throw err(404, 'unknown_product');
    const v = await verifier.verify(productId, token);
    if (v.state === 'invalid') throw err(400, 'invalid_purchase', 'Satın alma doğrulanamadı.');
    if (userId != null && v.obfuscatedAccountId && v.obfuscatedAccountId !== obfId(userId)) throw err(403, 'account_mismatch', 'Bu satın alma başka bir hesaba ait.');
    const res = db.tx(() => {
      let row = db.prepare('SELECT * FROM purchases WHERE purchase_token=?').get(token);
      if (row && userId != null && row.user_id !== userId) throw err(409, 'token_used', 'Bu satın alma başka bir hesapta kullanılmış.');
      const uid = row ? row.user_id : userId;
      if (uid == null) return { status: 'unknown' };
      if (!row) {
        db.prepare('INSERT INTO purchases(user_id,product_id,purchase_token,order_id,state,coins,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(uid, productId, token, v.orderId, v.state, 0, now(), now());
        row = db.prepare('SELECT * FROM purchases WHERE purchase_token=?').get(token);
      }
      if (row.state === 'refunded') return { status: 'refunded' };
      if (v.state === 'purchased' && !row.credited) {
        const coins = pkg.coins * (v.quantity || 1);
        db.prepare("UPDATE purchases SET state='purchased', credited=1, coins=?, order_id=?, updated_at=? WHERE id=?").run(coins, v.orderId, now(), row.id);
        if (pkg.one_time) db.prepare('UPDATE users SET starter_bought=1 WHERE id=?').run(uid);
        const w = C.applyCoins(db, uid, coins, 'purchase', row.id, now());
        return { status: 'purchased', coins, balance: w.balance, credited: true };
      }
      if (v.state === 'purchased') return { status: 'purchased', coins: 0, balance: getUser(uid).balance, alreadyCredited: true };
      db.prepare('UPDATE purchases SET state=?, updated_at=? WHERE id=?').run(v.state, now(), row.id);
      return { status: v.state, balance: getUser(uid).balance };
    });
    if (res.status === 'purchased') {
      try { if (await verifier.consume(productId, token)) db.prepare('UPDATE purchases SET consumed=1 WHERE purchase_token=?').run(token); }
      catch (e) { (cfg.logger || console).warn('[billing] consume başarısız', e.message); }
    }
    return res;
  }
  function revoke(token, reason) {
    return db.tx(() => {
      const p = db.prepare('SELECT * FROM purchases WHERE purchase_token=?').get(token);
      if (!p || p.state === 'refunded') return { status: 'noop' };
      let debited = 0;
      if (p.credited) {
        const w = C.applyCoins(db, p.user_id, -p.coins, 'refund', p.id, now(), { clamp: true });
        debited = -w.applied;
        if (debited < p.coins) db.prepare('UPDATE users SET refund_debt=refund_debt+? WHERE id=?').run(p.coins - debited, p.user_id);
      }
      db.prepare("UPDATE purchases SET state='refunded', updated_at=? WHERE id=?").run(now(), p.id);
      return { status: 'refunded', debited, reason };
    });
  }
  r.post('/api/shop/verify', auth, verified, async (ctx) => {
    limit(ctx, 'buy:' + ctx.user.id, 30, 60e3);
    const productId = str(ctx.body.productId, 'productId', 64);
    const token = str(ctx.body.purchaseToken, 'purchaseToken', 4096);
    const pkg = db.prepare('SELECT * FROM packages WHERE product_id=? AND active=1').get(productId);
    if (!pkg) throw err(404, 'unknown_product');
    if (pkg.one_time && ctx.user.starter_bought && !db.prepare('SELECT 1 FROM purchases WHERE purchase_token=?').get(token)) throw err(409, 'one_time', 'Başlangıç paketi yalnızca bir kez alınabilir.');
    return processPurchase(ctx.user.id, productId, token, 'client');
  });
  r.get('/api/shop/history', auth, (ctx) => ({ purchases: db.prepare('SELECT p.id,p.product_id,k.name,p.order_id,p.state,p.coins,p.created_at,p.updated_at FROM purchases p LEFT JOIN packages k ON k.product_id=p.product_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100').all(ctx.user.id) }));
  // Google Play Gerçek Zamanlı Geliştirici Bildirimleri (Pub/Sub push)
  r.post('/api/billing/rtdn', async (ctx) => {
    if (!cfg.rtdnSecret || ctx.query.get('secret') !== cfg.rtdnSecret) throw err(403, 'forbidden');
    const data = JSON.parse(Buffer.from(ctx.body?.message?.data || '', 'base64').toString('utf8') || '{}');
    if (data.voidedPurchaseNotification) return revoke(data.voidedPurchaseNotification.purchaseToken, 'voided');
    const o = data.oneTimeProductNotification;
    if (o && o.purchaseToken) {
      if (o.notificationType === 2) { const p = db.prepare('SELECT * FROM purchases WHERE purchase_token=?').get(o.purchaseToken); if (p && !p.credited) db.prepare("UPDATE purchases SET state='canceled', updated_at=? WHERE id=?").run(now(), p.id); return { ok: true }; }
      try { return await processPurchase(null, o.sku, o.purchaseToken, 'rtdn'); } catch (e) { return { ok: false, error: e.code }; }
    }
    return { ok: true };
  });
  async function syncVoided(sinceMs) { const list = await verifier.voided(sinceMs); return list.map(v => revoke(v.purchaseToken, 'voided_sync')); }

  /* ================= DESTEK ================= */
  r.post('/api/support', auth, (ctx) => {
    limit(ctx, 'ticket:' + ctx.user.id, 5, 60 * 60e3);
    const id = db.prepare('INSERT INTO tickets(user_id,subject,message,created_at,updated_at) VALUES(?,?,?,?,?)').run(ctx.user.id, str(ctx.body.subject, 'subject', 120), str(ctx.body.message, 'message', 2000), now(), now()).lastInsertRowid;
    return { id };
  });
  r.get('/api/support', auth, (ctx) => ({ tickets: db.prepare('SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC').all(ctx.user.id) }));

  /* ================= YÖNETİCİ ================= */
  r.get('/api/admin/stats', admin, () => ({
    users: db.prepare("SELECT COUNT(*) c FROM users WHERE role='player'").get().c,
    coins: db.prepare("SELECT COALESCE(SUM(balance),0) s FROM users WHERE role='player'").get().s,
    purchases: db.prepare("SELECT COUNT(*) c, COALESCE(SUM(coins),0) s FROM purchases WHERE state='purchased'").get(),
    games: db.prepare('SELECT game, COUNT(*) spins, SUM(bet) wagered, SUM(win) won FROM spins GROUP BY game').all(),
    openTickets: db.prepare("SELECT COUNT(*) c FROM tickets WHERE status='acik'").get().c,
  }));
  r.get('/api/admin/users', admin, (ctx) => {
    const q = '%' + (ctx.query.get('q') || '') + '%';
    return { users: db.prepare('SELECT id,email,username,role,balance,xp,level,banned,email_verified,unlimited,created_at,last_login_at FROM users WHERE username LIKE ? OR email LIKE ? OR CAST(id AS TEXT)=? ORDER BY id DESC LIMIT 100').all(q, q, ctx.query.get('q') || '') };
  });
  r.get('/api/admin/users/:id', admin, (ctx) => {
    const u = getUser(int(ctx.params.id, 'id', 1)); if (!u) throw err(404, 'user_not_found');
    return {
      user: { ...pub(u), banned: !!u.banned, refundDebt: u.refund_debt, lastLoginAt: u.last_login_at },
      ledger: db.prepare('SELECT * FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u.id),
      purchases: db.prepare('SELECT * FROM purchases WHERE user_id=? ORDER BY id DESC LIMIT 50').all(u.id),
      spins: db.prepare('SELECT id,game,bet,win,nonce,created_at FROM spins WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id),
    };
  });
  r.post('/api/admin/users/:id/coins', admin, (ctx) => db.tx(() => {
    const uid = int(ctx.params.id, 'id', 1); const delta = int(ctx.body.delta, 'delta', -1e12, 1e12);
    const reason = str(ctx.body.reason || 'manuel', 'reason', 200);
    const w = C.applyCoins(db, uid, delta, 'admin', `${ctx.user.id}:${reason}`, now(), { clamp: !!ctx.body.clamp });
    audit(ctx, 'coins', uid, { delta, reason, balance: w.balance });
    return w;
  }));
  r.post('/api/admin/users/:id/progress', admin, (ctx) => db.tx(() => {
    const uid = int(ctx.params.id, 'id', 1); const u = getUser(uid); if (!u) throw err(404, 'user_not_found');
    let xp = u.xp;
    if (ctx.body.level != null) xp = C.cumXp(int(ctx.body.level, 'level', 1, C.MAX_LEVEL));
    if (ctx.body.xp != null) xp = int(ctx.body.xp, 'xp', 0, C.XP_MAX);
    db.prepare('UPDATE users SET xp=?, level=? WHERE id=?').run(xp, C.levelFromXp(xp), uid);
    audit(ctx, 'progress', uid, { from: u.xp, to: xp });
    return { xp, level: C.levelFromXp(xp) };
  }));
  r.post('/api/admin/users/:id/status', admin, (ctx) => {
    const uid = int(ctx.params.id, 'id', 1); const u = getUser(uid); if (!u) throw err(404, 'user_not_found');
    if (u.role === 'admin') throw err(400, 'cannot_modify_admin');
    const fields = {};
    if (ctx.body.banned != null) { fields.banned = ctx.body.banned ? 1 : 0; if (fields.banned) db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid); }
    if (ctx.body.emailVerified != null) fields.email_verified = ctx.body.emailVerified ? 1 : 0;
    for (const [k, v] of Object.entries(fields)) db.prepare(`UPDATE users SET ${k}=? WHERE id=?`).run(v, uid);
    audit(ctx, 'status', uid, fields); return { ok: true };
  });
  r.get('/api/admin/config', admin, () => ({ daily: db.setting('daily_anchors'), startingCoins: db.setting('starting_coins'), giftAmounts: db.setting('gift_amounts'), giftDailyLimit: db.setting('gift_daily_limit'), levelRewards: db.prepare('SELECT * FROM level_rewards ORDER BY level').all() }));
  r.put('/api/admin/config/daily', admin, (ctx) => {
    const a = ctx.body.anchors; if (!Array.isArray(a) || !a.length || !a.every(x => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 1 && x[0] <= 100 && Number.isInteger(x[1]) && x[1] >= 0)) throw err(400, 'bad_anchors');
    db.setSetting('daily_anchors', a); audit(ctx, 'config_daily', null, a); return { ok: true };
  });
  r.put('/api/admin/config/general', admin, (ctx) => {
    if (ctx.body.startingCoins != null) db.setSetting('starting_coins', int(ctx.body.startingCoins, 'startingCoins', 0, 1e9));
    if (ctx.body.giftDailyLimit != null) db.setSetting('gift_daily_limit', int(ctx.body.giftDailyLimit, 'limit', 0, 100));
    audit(ctx, 'config_general', null, ctx.body); return { ok: true };
  });
  r.put('/api/admin/level-rewards/:level', admin, (ctx) => {
    const L = int(ctx.params.level, 'level', 1, C.MAX_LEVEL); const coins = int(ctx.body.coins, 'coins', 0, 1e10);
    if (ctx.body.remove) db.prepare('DELETE FROM level_rewards WHERE level=?').run(L);
    else db.prepare('INSERT INTO level_rewards VALUES(?,?) ON CONFLICT(level) DO UPDATE SET coins=excluded.coins').run(L, coins);
    audit(ctx, 'level_reward', null, { level: L, coins, remove: !!ctx.body.remove }); return { ok: true };
  });
  r.get('/api/admin/packages', admin, () => ({ packages: db.prepare('SELECT * FROM packages ORDER BY sort').all() }));
  r.put('/api/admin/packages/:pid', admin, (ctx) => {
    const pid = str(ctx.params.pid, 'pid', 64); const b = ctx.body;
    if (!/^[a-z0-9_.]{2,64}$/.test(pid)) throw err(400, 'bad_product_id');
    db.prepare(`INSERT INTO packages(product_id,name,coins,price_label,bonus_label,one_time,active,sort) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(product_id) DO UPDATE SET name=excluded.name, coins=excluded.coins, price_label=excluded.price_label, bonus_label=excluded.bonus_label, one_time=excluded.one_time, active=excluded.active, sort=excluded.sort`)
      .run(pid, str(b.name, 'name', 60), int(b.coins, 'coins', 1, 1e12), str(b.priceLabel, 'priceLabel', 30), b.bonusLabel ? String(b.bonusLabel).slice(0, 40) : null, b.oneTime ? 1 : 0, b.active === false ? 0 : 1, int(b.sort ?? 0, 'sort', 0, 1000));
    audit(ctx, 'package', null, { pid, ...b }); return { ok: true };
  });
  r.get('/api/admin/events', admin, () => ({ events: db.prepare('SELECT * FROM events ORDER BY id DESC').all() }));
  r.post('/api/admin/events', admin, (ctx) => {
    const b = ctx.body;
    const vals = [str(b.title, 'title', 80), String(b.description || '').slice(0, 500), int(b.startsAt, 'startsAt', 0), int(b.endsAt, 'endsAt', 0), int(b.xpMult ?? 1, 'xpMult', 1, 10), int(b.bonusCoins ?? 0, 'bonusCoins', 0, 1e9), b.active === false ? 0 : 1];
    if (vals[3] <= vals[2]) throw err(400, 'bad_dates');
    let id = b.id;
    if (id) db.prepare('UPDATE events SET title=?,description=?,starts_at=?,ends_at=?,xp_mult=?,bonus_coins=?,active=? WHERE id=?').run(...vals, int(id, 'id', 1));
    else id = db.prepare('INSERT INTO events(title,description,starts_at,ends_at,xp_mult,bonus_coins,active) VALUES(?,?,?,?,?,?,?)').run(...vals).lastInsertRowid;
    audit(ctx, 'event', null, { id, ...b }); return { id };
  });
  r.get('/api/admin/quests', admin, () => ({ quests: db.prepare('SELECT * FROM quests ORDER BY id').all() }));
  r.post('/api/admin/quests', admin, (ctx) => {
    const b = ctx.body; if (!['spins', 'wager', 'bigwin', 'games'].includes(b.type)) throw err(400, 'bad_type');
    const vals = [str(b.title, 'title', 80), b.type, int(b.target, 'target', 1, 1e12), int(b.reward, 'reward', 0, 1e9), b.active === false ? 0 : 1];
    let id = b.id;
    if (id) db.prepare('UPDATE quests SET title=?,type=?,target=?,reward=?,active=? WHERE id=?').run(...vals, int(id, 'id', 1));
    else id = db.prepare('INSERT INTO quests(title,type,target,reward,active) VALUES(?,?,?,?,?)').run(...vals).lastInsertRowid;
    audit(ctx, 'quest', null, { id, ...b }); return { id };
  });
  r.get('/api/admin/tickets', admin, () => ({ tickets: db.prepare('SELECT t.*, u.username FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 100').all() }));
  r.post('/api/admin/tickets/:id/reply', admin, (ctx) => { const id = int(ctx.params.id, 'id', 1); db.prepare("UPDATE tickets SET reply=?, status='yanitlandi', updated_at=? WHERE id=?").run(str(ctx.body.reply, 'reply', 2000), now(), id); audit(ctx, 'ticket_reply', null, { id }); return { ok: true }; });
  r.get('/api/admin/audit', admin, () => ({ audit: db.prepare('SELECT a.*, u.username admin_name, t.username target_name FROM audit a JOIN users u ON u.id=a.admin_id LEFT JOIN users t ON t.id=a.target_user ORDER BY a.id DESC LIMIT 200').all() }));
  r.post('/api/admin/purchases/:id/refund', admin, (ctx) => { const p = db.prepare('SELECT * FROM purchases WHERE id=?').get(int(ctx.params.id, 'id', 1)); if (!p) throw err(404, 'no_purchase'); const res = revoke(p.purchase_token, 'admin'); audit(ctx, 'refund', p.user_id, { purchase: p.id, ...res }); return res; });

  r.get('/api/health', () => ({ ok: true, time: now() }));
  r.get('/api/legal', () => ({ version: '2026-11-26' }));

  /* ---------- HTTP sunucusu ---------- */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    const cors = { 'Access-Control-Allow-Origin': cfg.corsOrigin || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Max-Age': '600' };
    const sec = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, ...sec }); return res.end(); }
    if (!url.pathname.startsWith('/api/')) {
      if ((req.method === 'GET' || req.method === 'HEAD') && cfg.staticDir && serveStatic(cfg.staticDir, req, res, url.pathname)) return;
      res.writeHead(404, sec); return res.end('Not found');
    }
    const ctx = { req, res, query: url.searchParams, ip: (cfg.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress, body: {} };
    let status = 200, out;
    try {
      const m = r.match(req.method, url.pathname);
      if (!m) throw err(404, 'not_found');
      ctx.params = m.params;
      if (req.method !== 'GET') { const raw = await readBody(req); if (raw.length) { try { ctx.body = JSON.parse(raw.toString('utf8')); } catch { throw err(400, 'bad_json'); } } }
      if (ctx.body === null || typeof ctx.body !== 'object') ctx.body = {};
      for (const h of m.route.handlers) out = await h(ctx);
    } catch (e) {
      if (e instanceof HttpError) { status = e.status; out = { error: e.code, message: e.message }; }
      else { status = 500; out = { error: 'server_error', message: 'Sunucu hatası.' }; (cfg.logger || console).error(e); }
    }
    if (out && out.__html) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...sec }); return res.end(out.__html); }
    const body = JSON.stringify(out ?? {});
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...sec });
    res.end(body);
  }
  const server = http.createServer((req, res) => { handle(req, res).catch(e => { try { res.writeHead(500); res.end(); } catch {} }); });
  return { server, db, games, verifier, syncVoided, close: () => new Promise(r2 => server.close(() => { db.close(); r2(); })) };
}

module.exports = { createApp, BETS };
