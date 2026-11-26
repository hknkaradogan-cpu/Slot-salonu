// SLOT SALONU API — Web standardı Request/Response. Aynı kod Node (node-server.js) ve
// Supabase Edge Function (supabase/functions/slot-api) üzerinde çalışır.
import { registerOkey } from './okey/routes.js';
import { registerSocial } from './social.js';
import { registerTavla } from './tavla/routes.js';
import { registerAviator } from './aviator/routes.js';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as C from './core.js';
import { buildGames, ORDER, DEFAULT_RTP, DEFAULT_VOL, VOL_LEVELS, VOL_NAMES, RTP_MIN, RTP_MAX } from './games/engine.js';
import { FairRng, newServerSeed, hashSeed } from './games/rng.js';
import { createVerifier } from './billing.js';
import { createMailer } from './mailer.js';
import SCHEMA_SQL from './schema.sql.js';

const { err } = C;
export const BETS = [100, 200, 400, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const THEME = {
  zeus: ['Şimşek tanrısı · X çarpanları', 'SICAK'], misir: ['Firavun mezarı · genişleyen semboller', ''], vegas: ['Klasik meyveler · 777 wild', 'YENİ'],
  peri: ['Çarpan topları · zincirleme patlamalar', 'POPÜLER'], ejderha: ['243 yol · ateş wild çarpanları', ''], korsan: ['Sandık altını · tut ve döndür', ''], altin: ['Altın makine · jackpot çarkı', 'VIP'],
};
const DEFAULT_SETTINGS = {
  starting_coins: 50000,
  daily_anchors: [[1, 500], [10, 1000], [20, 2000], [30, 3000], [40, 4000], [50, 5000], [60, 6000], [70, 7000], [80, 8000], [90, 9000], [100, 10000]],
  daily_after: { perLevel: 10, max: 1000000 },
  level_rewards: { every: 10, perLevel: 1000, special: {} },
  gift_amounts: [1000, 5000, 10000], gift_daily_limit: 5,
};
const PACKAGES = [
  ['coins_starter', 'Başlangıç Paketi', 500000, '₺49,99', 'Tek seferlik', true, 1], ['coins_small', 'Küçük Paket', 1000000, '₺79,99', null, false, 2],
  ['coins_medium', 'Orta Paket', 2000000, '₺149,99', null, false, 3], ['coins_large', 'Büyük Paket', 5000000, '₺299,99', '+%25 değer', false, 4],
  ['coins_mega', 'Mega Paket', 10000000, '₺499,99', '+%50 değer', false, 5], ['coins_vip', 'VIP Paket', 20000000, '₺799,99', 'En iyi değer', false, 6],
];
const QUESTS = [['50 spin yap', 'spins', 50, 2500], ['500.000 jeton bahis yap', 'wager', 500000, 5000], ['Bahsinin 20 katı kazan', 'bigwin', 1, 4000], ['3 farklı oyun oyna', 'games', 3, 3000]];

export async function createApi(cfg) {
  const now = cfg.clock || (() => Date.now());
  const log = cfg.logger || console;
  const db = cfg.db;
  const tz = cfg.tzOffsetMin ?? 180;
  const verifier = cfg.verifier || createVerifier(cfg);
  const mailer = createMailer(db, cfg, log);
  const one = async (q, text, p) => (await q(text, p))[0];
  const Q = db.q;

  /* ---------- şema ve varsayılan veriler ---------- */
  async function migrate() {
    if (!cfg.skipSchema) await db.exec(SCHEMA_SQL);
    if (cfg.skipSchema && await one(Q, "SELECT 1 x FROM slot.settings WHERE key='seeded_v1'")) return; // Edge: soğuk başlangıcı hızlandır
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await Q('INSERT INTO slot.settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [k, JSON.stringify(v)]);
    if (!(await one(Q, 'SELECT 1 x FROM slot.packages LIMIT 1'))) for (const p of PACKAGES) await Q('INSERT INTO slot.packages(product_id,name,coins,price_label,bonus_label,one_time,sort) VALUES($1,$2,$3,$4,$5,$6,$7)', p);
    if (!(await one(Q, 'SELECT 1 x FROM slot.quests LIMIT 1'))) for (const q of QUESTS) await Q('INSERT INTO slot.quests(title,type,target,reward) VALUES($1,$2,$3,$4)', q);
    for (const id of ORDER) await Q('INSERT INTO slot.games_config(game,active,rtp,volatility,updated_at) VALUES($1,TRUE,$2,$3,$4) ON CONFLICT (game) DO NOTHING', [id, DEFAULT_RTP[id], DEFAULT_VOL[id], now()]);
    // Ortam değişkenleriyle ilk yönetici (isteğe bağlı; alternatif: kurulum anahtarıyla uygulama içi kurulum)
    if (cfg.admin && cfg.admin.email && cfg.admin.password) {
      const ex = await one(Q, 'SELECT id FROM slot.users WHERE lower(email)=lower($1) OR lower(username)=lower($2)', [cfg.admin.email, cfg.admin.username]);
      if (!ex) await Q("INSERT INTO slot.users(email,username,pass_hash,role,unlimited,created_at) VALUES($1,$2,$3,'admin',TRUE,$4)", [cfg.admin.email.toLowerCase(), cfg.admin.username, C.hashPassword(cfg.admin.password), now()]);
      else await Q("UPDATE slot.users SET role='admin', unlimited=TRUE WHERE id=$1", [ex.id]);
    }
    await Q("INSERT INTO slot.settings(key,value) VALUES('seeded_v1','true') ON CONFLICT (key) DO NOTHING");
  }
  const setting = async (k, q = Q) => { const r = await one(q, 'SELECT value FROM slot.settings WHERE key=$1', [k]); return r ? JSON.parse(r.value) : DEFAULT_SETTINGS[k]; };
  const setSetting = (k, v, q = Q) => q('INSERT INTO slot.settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, JSON.stringify(v)]);

  /* ---------- oyun yapılandırması (RTP ve aktiflik; örnek başına 15 sn önbellek) ---------- */
  let gcache = null, gcacheAt = 0;
  async function games(force) {
    if (!force && gcache && now() - gcacheAt < 15000) return gcache;
    const rows = await Q('SELECT game, active, rtp, volatility FROM slot.games_config');
    const rtp = {}, active = {}, vol = {}; for (const r of rows) { rtp[r.game] = Number(r.rtp); active[r.game] = r.active; if (r.volatility) vol[r.game] = r.volatility; }
    gcache = { g: buildGames(cfg.calibration, rtp, vol), active }; gcacheAt = now();
    return gcache;
  }

  /* ---------- yardımcılar ---------- */
  // Bakım: eski spin yanıtlarını (yalnızca 1 saatlik tekrar koruması için tutulur) ve bitmiş okey masalarını temizle — bellek/disk kullanımını düşük tutar
  let maintAt = 0;
  function maintenance() {
    const t = now(); if (t - maintAt < 10 * 60e3) return; maintAt = t;
    Q('UPDATE slot.spins SET response=NULL WHERE response IS NOT NULL AND created_at<$1', [t - 3600e3]).catch(() => {});
    Q("DELETE FROM slot.okey_tables WHERE status IN ('finished','abandoned') AND updated_at<$1", [t - 3 * C.DAY_MS]).catch(() => {});
    ensureTournaments().catch(() => {});
    Q("UPDATE slot.okey_tables SET status='abandoned' WHERE status IN ('waiting','playing','round_end') AND updated_at<$1", [t - 6 * 3600e3]).catch(() => {});
  }
  // platform kancaları (social.js doldurur)
  const hooks = { onSpin: async () => {}, onOkey: async () => {} };
  let notify = async () => {}, addTickets = async () => 0, ensureTournaments = async () => {};
  const rl = new Map();
  function limit(ctx, name, max, win) {
    const o = cfg.limitOverrides && cfg.limitOverrides[name.split(':')[0]]; if (o) max = o;
    const k = name + ':' + ctx.ip, t = now(), e = rl.get(k);
    if (!e || t - e.t > win) { rl.set(k, { t, n: 1 }); if (rl.size > 50000) rl.clear(); return; }
    if (++e.n > max) throw err(429, 'rate_limited', 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.');
  }
  const str = (v, name, max = 200) => { if (typeof v !== 'string' || !v.trim()) throw err(400, 'missing_' + name, 'Eksik alan: ' + name); return v.trim().slice(0, max); };
  const int = (v, name, min = -Infinity, max = Infinity) => { const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > max) throw err(400, 'bad_' + name, 'Geçersiz değer: ' + name); return n; };
  const obfId = (uid) => crypto.createHmac('sha256', cfg.secret).update('acct:' + uid).digest('hex').slice(0, 40);
  const audit = (q, ctx, action, target, details) => q('INSERT INTO slot.audit(admin_id,action,target_user,details,created_at) VALUES($1,$2,$3,$4,$5)', [ctx.user.id, action, target ?? null, JSON.stringify(details || {}), now()]);
  const activeEvents = (q = Q) => q('SELECT * FROM slot.events WHERE active AND starts_at<=$1 AND ends_at>$1 ORDER BY ends_at', [now()]);
  const getUser = (id, q = Q) => one(q, 'SELECT * FROM slot.users WHERE id=$1', [id]);

  async function applyCoins(q, uid, delta, type, ref, opts = {}) {
    delta = Math.trunc(delta); if (!Number.isSafeInteger(delta)) throw err(400, 'bad_amount');
    const u = await one(q, 'SELECT id, balance, unlimited FROM slot.users WHERE id=$1 FOR UPDATE', [uid]);
    if (!u) throw err(404, 'user_not_found', 'Kullanıcı bulunamadı.');
    let next = u.balance + delta;
    if (u.unlimited && delta < 0) next = u.balance; // sınırsız jetonlu yönetici: bakiye düşmez
    if (next < 0) { if (opts.clamp) next = 0; else throw err(402, 'insufficient_funds', 'Yetersiz jeton.'); }
    if (!Number.isSafeInteger(next)) throw err(400, 'overflow', 'Bakiye sınırı aşıldı.');
    await q('UPDATE slot.users SET balance=$1 WHERE id=$2', [next, u.id]);
    await q('INSERT INTO slot.ledger(user_id,delta,balance_after,type,ref,created_at) VALUES($1,$2,$3,$4,$5,$6)', [u.id, u.unlimited && delta < 0 ? delta : next - u.balance, next, type, ref == null ? null : String(ref), now()]);
    return { balance: next, applied: next - u.balance };
  }
  function pub(u) {
    const li = C.levelInfo(u.xp);
    return { id: u.id, username: u.username, email: u.email, role: u.role, unlimited: u.unlimited, balance: u.balance, level: li.level, xp: u.xp, xpInto: li.into, xpNeed: li.need, maxLevel: li.max, maxLevelNumber: C.MAX_LEVEL,
      avatar: u.avatar, tickets: Number(u.tickets || 0), spins: u.spins, totalWagered: u.total_wagered, totalWon: u.total_won, biggestWin: u.biggest_win, createdAt: u.created_at, billingAccountId: obfId(u.id) };
  }
  async function createSession(user, admin = false) {
    const tok = C.randomToken();
    await Q('INSERT INTO slot.sessions(token_hash,user_id,admin,created_at,expires_at) VALUES($1,$2,$3,$4,$5)', [C.sha256(tok), user.id, admin, now(), now() + (admin ? 12 * 3600e3 : 60 * C.DAY_MS)]);
    await Q('UPDATE slot.users SET last_login_at=$1 WHERE id=$2', [now(), user.id]);
    return tok;
  }

  /* ---------- ara katmanlar ---------- */
  async function auth(ctx) {
    const h = ctx.req.headers.get('authorization') || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) throw err(401, 'unauthorized', 'Lütfen giriş yapın.');
    const s = await one(Q, 'SELECT * FROM slot.sessions WHERE token_hash=$1', [C.sha256(tok)]);
    if (!s || s.expires_at < now()) throw err(401, 'unauthorized', 'Oturum süresi doldu. Lütfen tekrar giriş yapın.');
    const u = await getUser(s.user_id);
    if (!u) throw err(401, 'unauthorized');
    if (u.banned) throw err(403, 'banned', 'Hesabınız askıya alınmış. Destek ile iletişime geçin.');
    ctx.user = u; ctx.session = s; touch(u.id);
  }
  // Çevrim içi sayımı: kullanıcı başına dakikada en fazla bir yazma
  const seen = new Map();
  function touch(uid) { const t = now(), p = seen.get(uid) || 0; if (t - p < 60e3) return; seen.set(uid, t); if (seen.size > 20000) seen.clear(); Q('UPDATE slot.users SET last_seen_at=$1 WHERE id=$2', [t, uid]).catch(() => {}); }
  // Sık yoklanan uçlar (okey masası) için hafif kimlik doğrulama: oturum 10 sn önbellekte (bakiye/para işlemleri bunu kullanmaz)
  const scache = new Map();
  async function authLite(ctx) {
    const h = ctx.req.headers.get('authorization') || ''; const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) throw err(401, 'unauthorized', 'Lütfen giriş yapın.');
    const c = scache.get(tok), t = now();
    if (c && c.at > t - 10e3) { ctx.user = c.user; touch(c.user.id); return; }
    await auth(ctx); scache.set(tok, { at: t, user: { id: ctx.user.id, username: ctx.user.username, role: ctx.user.role } }); if (scache.size > 20000) scache.clear();
  }
  // Yönetici: hem rol 'admin' olmalı hem de oturum ayrıca "Yönetici Girişi" ile açılmış olmalı (12 saat geçerli)
  async function admin(ctx) { await auth(ctx); if (ctx.user.role !== 'admin' || !ctx.session.admin) throw err(403, 'forbidden', 'Bu alan yalnızca yönetici girişi yapmış yöneticiye açıktır.'); }

  const routes = [];
  const r = (method, pattern, ...handlers) => { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); routes.push({ method, re, keys, handlers, pattern }); };

  /* ================= KURULUM / ÜYELİK ================= */
  const setupHash = cfg.setupTokenHash || (cfg.setupToken ? C.sha256(cfg.setupToken) : null);
  r('GET', '/api/setup/status', async () => ({ needsSetup: !(await one(Q, "SELECT 1 x FROM slot.users WHERE role='admin' LIMIT 1")), setupEnabled: !!setupHash, mailConfigured: mailer.configured }));
  r('POST', '/api/setup/admin', async (ctx) => {
    limit(ctx, 'setup', 5, 15 * 60e3);
    if (!setupHash) throw err(403, 'setup_disabled', 'Kurulum anahtarı sunucuda tanımlı değil.');
    const given = Buffer.from(C.sha256(String(ctx.body.setupToken || '').trim()), 'hex'), want = Buffer.from(setupHash, 'hex');
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw err(403, 'bad_setup_token', 'Kurulum anahtarı hatalı.');
    const email = str(ctx.body.email, 'email', 254).toLowerCase(), username = str(ctx.body.username, 'username', 16);
    if (!C.EMAIL_RE.test(email)) throw err(400, 'bad_email', 'Geçerli bir e-posta girin.');
    if (!C.USER_RE.test(username)) throw err(400, 'bad_username', 'Kullanıcı adı 3-16 karakter; harf, rakam ve _ içerebilir.');
    C.checkPassword(ctx.body.password);
    const hash = C.hashPassword(ctx.body.password);
    const u = await db.tx(async (q) => {
      await q('LOCK TABLE slot.users IN SHARE ROW EXCLUSIVE MODE');
      if (await one(q, "SELECT 1 x FROM slot.users WHERE role='admin' LIMIT 1")) throw err(409, 'already_setup', 'Yönetici zaten oluşturulmuş.');
      if (await one(q, 'SELECT 1 x FROM slot.users WHERE lower(username)=lower($1) OR lower(email)=$2', [username, email])) throw err(409, 'taken', 'Bu kullanıcı adı veya e-posta kullanılıyor.');
      return one(q, "INSERT INTO slot.users(email,username,pass_hash,role,unlimited,created_at) VALUES($1,$2,$3,'admin',TRUE,$4) RETURNING *", [email, username, hash, now()]);
    });
    return { ok: true, token: await createSession(u, true), user: pub(u) };
  });

  r('POST', '/api/auth/register', async (ctx) => {
    limit(ctx, 'register', 8, 10 * 60e3);
    const email = str(ctx.body.email, 'email', 254).toLowerCase(), username = str(ctx.body.username, 'username', 16);
    if (!C.EMAIL_RE.test(email)) throw err(400, 'bad_email', 'Geçerli bir e-posta girin.');
    if (!C.USER_RE.test(username)) throw err(400, 'bad_username', 'Kullanıcı adı 3-16 karakter; harf, rakam ve _ içerebilir.');
    C.checkPassword(ctx.body.password);
    const hash = C.hashPassword(ctx.body.password);
    const start = await setting('starting_coins');
    let user;
    try {
      user = await db.tx(async (q) => {
        if (await one(q, 'SELECT 1 x FROM slot.users WHERE lower(username)=lower($1)', [username])) throw err(409, 'username_taken', 'Bu kullanıcı adı alınmış.');
        if (await one(q, 'SELECT 1 x FROM slot.users WHERE lower(email)=$1', [email])) throw err(409, 'email_taken', 'Bu e-posta ile kayıtlı bir hesap var.');
        const u = await one(q, 'INSERT INTO slot.users(email,username,pass_hash,balance,created_at) VALUES($1,$2,$3,0,$4) RETURNING id', [email, username, hash, now()]);
        if (start > 0) await applyCoins(q, u.id, start, 'welcome', null);
        // arkadaş daveti: davet edene 10.000 jeton + 2 bilet (davet eden başına en fazla 20 kişi), yeni oyuncuya +2 bilet
        if (ctx.body.ref) {
          const ref = await one(q, 'SELECT id, username FROM slot.users WHERE lower(username)=lower($1)', [String(ctx.body.ref).slice(0, 16)]);
          if (ref) {
            const n = (await one(q, 'SELECT COUNT(*)::int c FROM slot.users WHERE referred_by=$1', [ref.id])).c;
            await q('UPDATE slot.users SET referred_by=$1 WHERE id=$2', [ref.id, u.id]); await addTickets(q, u.id, 2, 'referral');
            if (n < 20) { await applyCoins(q, ref.id, 10000, 'referral', u.id); await addTickets(q, ref.id, 2, 'referral'); await notify(q, ref.id, 'referral', '🎉 Davetin kabul edildi!', `${username} davetinle katıldı: 10.000 jeton + 2 bilet kazandın.`); }
          }
        }
        return getUser(u.id, q);
      });
    } catch (e) { if (String(e.code) === '23505') throw err(409, 'username_taken', 'Bu kullanıcı adı veya e-posta alınmış.'); throw e; }
    return { token: await createSession(user), user: pub(user) };
  });

  async function checkLogin(ctx) {
    limit(ctx, 'login', 10, 60e3);
    const id = str(ctx.body.identifier ?? ctx.body.email ?? ctx.body.username, 'identifier', 254);
    const u = await one(Q, 'SELECT * FROM slot.users WHERE lower(email)=lower($1) OR lower(username)=lower($1)', [id]);
    const okPw = C.verifyPassword(String(ctx.body.password || ''), u ? u.pass_hash : C.DUMMY_HASH) && !!u;
    if (!u || !okPw) throw err(401, 'bad_credentials', 'Kullanıcı adı/e-posta veya şifre hatalı.');
    if (u.banned) throw err(403, 'banned', 'Hesabınız askıya alınmış. Destek ile iletişime geçin.');
    return u;
  }
  r('POST', '/api/auth/login', async (ctx) => { const u = await checkLogin(ctx); return { token: await createSession(u), user: pub(u) }; });
  r('POST', '/api/auth/admin-login', async (ctx) => {
    limit(ctx, 'adminlogin', 6, 15 * 60e3);
    const u = await checkLogin(ctx);
    if (u.role !== 'admin') throw err(403, 'not_admin', 'Bu hesap yönetici değil.');
    return { token: await createSession(u, true), user: pub(u) };
  });
  r('POST', '/api/auth/logout', auth, async (ctx) => { await Q('DELETE FROM slot.sessions WHERE token_hash=$1', [ctx.session.token_hash]); return { ok: true }; });

  async function issueToken(uid, type, ttl) {
    const code = C.randomCode(8);
    await Q('UPDATE slot.tokens SET used=TRUE WHERE user_id=$1 AND type=$2 AND NOT used', [uid, type]);
    await Q('INSERT INTO slot.tokens(token_hash,user_id,type,expires_at) VALUES($1,$2,$3,$4)', [C.sha256(type + ':' + code), uid, type, now() + ttl]);
    return code;
  }
  r('POST', '/api/auth/forgot', async (ctx) => {
    limit(ctx, 'forgot', 5, 10 * 60e3);
    if (!mailer.configured && !cfg.allowDevMail) throw err(503, 'mail_not_configured', 'E-posta servisi henüz yapılandırılmadı. Şifrenizi sıfırlamak için destek/yönetici ile iletişime geçin.');
    const id = str(ctx.body.email ?? ctx.body.identifier, 'email', 254);
    const u = await one(Q, 'SELECT * FROM slot.users WHERE lower(email)=lower($1) OR lower(username)=lower($1)', [id]);
    if (u) {
      const code = await issueToken(u.id, 'reset', 30 * 60e3);
      await mailer.send(u.email, `${cfg.brandName || 'SPINOVA 101 OKEY'} şifre sıfırlama`, `Merhaba ${u.username},\n\nŞifre sıfırlama kodun: ${code}\nUygulamada "Şifremi Unuttum" ekranına bu kodu girerek yeni şifreni belirleyebilirsin. Kod 30 dakika geçerlidir ve tek kullanımlıktır.\nBu isteği sen yapmadıysan bu e-postayı yok say.`);
    }
    return { ok: true };
  });
  r('POST', '/api/auth/reset', async (ctx) => {
    limit(ctx, 'reset', 10, 10 * 60e3);
    C.checkPassword(ctx.body.password);
    const t = await one(Q, 'SELECT * FROM slot.tokens WHERE token_hash=$1', [C.sha256('reset:' + String(ctx.body.code || '').trim().toUpperCase())]);
    if (!t || t.used || t.expires_at < now()) throw err(400, 'invalid_code', 'Kod geçersiz veya süresi dolmuş.');
    await Q('UPDATE slot.tokens SET used=TRUE WHERE token_hash=$1', [t.token_hash]);
    await Q('UPDATE slot.users SET pass_hash=$1 WHERE id=$2', [C.hashPassword(ctx.body.password), t.user_id]);
    await Q('DELETE FROM slot.sessions WHERE user_id=$1', [t.user_id]);
    return { ok: true };
  });
  r('POST', '/api/auth/change-password', auth, async (ctx) => {
    if (!C.verifyPassword(String(ctx.body.current || ''), ctx.user.pass_hash)) throw err(401, 'bad_credentials', 'Mevcut şifre hatalı.');
    C.checkPassword(ctx.body.password);
    await Q('UPDATE slot.users SET pass_hash=$1 WHERE id=$2', [C.hashPassword(ctx.body.password), ctx.user.id]);
    await Q('DELETE FROM slot.sessions WHERE user_id=$1 AND token_hash<>$2', [ctx.user.id, ctx.session.token_hash]);
    return { ok: true };
  });

  /* ================= PROFİL / ÖDÜLLER ================= */
  async function dailyState(u, q = Q) {
    const after = await setting('daily_after', q);
    const amount = C.dailyAmount(C.levelFromXp(u.xp), await setting('daily_anchors', q), after.perLevel, after.max);
    const next = u.last_daily_at ? u.last_daily_at + C.DAY_MS : 0;
    return { amount, available: now() >= next, nextAt: next, serverTime: now() };
  }
  async function rewardsState(u) {
    const cfgR = await setting('level_rewards'); const lvl = C.levelFromXp(u.xp);
    const pending = C.levelRewardRange(u.reward_claimed_upto, lvl, cfgR);
    const next = []; let L = (Math.floor(Math.max(lvl, u.reward_claimed_upto) / cfgR.every) + 1) * cfgR.every;
    for (let i = 0; i < 5 && L <= C.MAX_LEVEL; i++, L += cfgR.every) next.push({ level: L, coins: C.levelRewardAt(L, cfgR) });
    return { every: cfgR.every, perLevel: cfgR.perLevel, claimedUpto: u.reward_claimed_upto, pending, next, level: lvl, maxLevel: C.MAX_LEVEL };
  }
  r('GET', '/api/me', auth, async (ctx) => {
    const u = ctx.user;
    const gifts = (await one(Q, 'SELECT COUNT(*)::int c FROM slot.gifts WHERE to_id=$1 AND claimed_at IS NULL', [u.id])).c;
    const reqs = (await one(Q, "SELECT COUNT(*)::int c FROM slot.friends WHERE friend_id=$1 AND status='pending'", [u.id])).c;
    const okeyActive = await one(Q, "SELECT t.id, t.status FROM slot.okey_players p JOIN slot.okey_tables t ON t.id=p.table_id WHERE p.user_id=$1 AND p.active AND t.status IN ('waiting','playing','round_end') ORDER BY t.id DESC LIMIT 1", [u.id]);
    return { user: pub(u), daily: await dailyState(u), levelRewards: await rewardsState(u), events: await activeEvents(), badges: { gifts, friendRequests: reqs, notifications: (await one(Q, 'SELECT COUNT(*)::int c FROM slot.notifications WHERE user_id=$1 AND read_at IS NULL', [u.id])).c, messages: (await one(Q, 'SELECT COUNT(*)::int c FROM slot.messages WHERE to_id=$1 AND read_at IS NULL', [u.id])).c }, serverTime: now(), adminSession: !!ctx.session.admin, okeyActive: okeyActive || null };
  });
  r('POST', '/api/me/avatar', auth, async (ctx) => { await Q('UPDATE slot.users SET avatar=$1 WHERE id=$2', [int(ctx.body.avatar, 'avatar', 0, 11), ctx.user.id]); return { ok: true }; });
  r('GET', '/api/levels', async (ctx) => {
    const from = Math.max(1, int(ctx.query.get('from') || 1, 'from', 1, C.MAX_LEVEL)), n = Math.min(100, int(ctx.query.get('n') || 20, 'n', 1, 100));
    return { maxLevel: C.MAX_LEVEL, xpPerCoins: C.XP_PER_COINS, minSpinsPerLevel: C.MIN_SPINS_PER_LEVEL, table: Array.from({ length: Math.min(n, C.MAX_LEVEL - from + 1) }, (_, i) => ({ level: from + i, totalXp: C.cumXp(from + i), need: from + i < C.MAX_LEVEL ? C.cumXp(from + i + 1) - C.cumXp(from + i) : 0 })) };
  });
  r('POST', '/api/daily/claim', auth, (ctx) => db.tx(async (q) => {
    const u = await one(q, 'SELECT * FROM slot.users WHERE id=$1 FOR UPDATE', [ctx.user.id]); const st = await dailyState(u, q);
    if (!st.available) throw err(409, 'not_yet', 'Günlük ödül henüz hazır değil.');
    await q('UPDATE slot.users SET last_daily_at=$1 WHERE id=$2', [now(), u.id]);
    const w = await applyCoins(q, u.id, st.amount, 'daily'); const tickets = await addTickets(q, u.id, 1, 'daily');
    return { amount: st.amount, tickets: 1, ticketBalance: tickets, balance: w.balance, daily: await dailyState({ ...u, last_daily_at: now() }, q) };
  }));
  r('POST', '/api/level-rewards/claim', auth, (ctx) => db.tx(async (q) => {
    const u = await one(q, 'SELECT * FROM slot.users WHERE id=$1 FOR UPDATE', [ctx.user.id]);
    const cfgR = await setting('level_rewards', q); const lvl = C.levelFromXp(u.xp);
    const p = C.levelRewardRange(u.reward_claimed_upto, lvl, cfgR);
    if (!p.count) throw err(409, 'nothing', 'Alınacak seviye ödülü yok.');
    await q('UPDATE slot.users SET reward_claimed_upto=$1 WHERE id=$2', [p.upto, u.id]);
    const w = await applyCoins(q, u.id, p.coins, 'level_reward', `${u.reward_claimed_upto + 1}-${p.upto}`);
    return { coins: p.coins, count: p.count, upto: p.upto, balance: w.balance, celebrate: p.upto >= C.MAX_LEVEL || [100, 1000, 10000, 100000].some(m => u.reward_claimed_upto < m && p.upto >= m) };
  }));

  /* ================= OYUNLAR ================= */
  r('GET', '/api/games', async () => {
    const G = await games();
    return { bets: BETS, games: ORDER.filter(id => G.active[id] !== false).map(id => { const g = G.g[id]; return { id, name: g.name, family: g.family, tag: THEME[id][0], rib: THEME[id][1], info: g.info, rtp: g.rtp, volatility: g.volatility }; }) };
  });
  async function seedRow(q, uid) {
    let s = await one(q, 'SELECT * FROM slot.seeds WHERE user_id=$1 FOR UPDATE', [uid]);
    if (!s) { const ss = newServerSeed(); await q('INSERT INTO slot.seeds(user_id,server_seed,server_seed_hash,client_seed,nonce) VALUES($1,$2,$3,$4,0) ON CONFLICT DO NOTHING', [uid, ss, hashSeed(ss), crypto.randomBytes(8).toString('hex')]); s = await one(q, 'SELECT * FROM slot.seeds WHERE user_id=$1 FOR UPDATE', [uid]); }
    return s;
  }
  r('GET', '/api/fair', auth, async (ctx) => {
    const s = await db.tx(q => seedRow(q, ctx.user.id));
    return { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce, revealed: await Q('SELECT server_seed,server_seed_hash,client_seed,last_nonce,revealed_at FROM slot.revealed_seeds WHERE user_id=$1 ORDER BY id DESC LIMIT 20', [ctx.user.id]) };
  });
  r('POST', '/api/fair/rotate', auth, (ctx) => db.tx(async (q) => {
    const s = await seedRow(q, ctx.user.id);
    const cs = ctx.body.clientSeed ? str(ctx.body.clientSeed, 'clientSeed', 64) : crypto.randomBytes(8).toString('hex');
    await q('INSERT INTO slot.revealed_seeds(user_id,server_seed,server_seed_hash,client_seed,last_nonce,revealed_at) VALUES($1,$2,$3,$4,$5,$6)', [ctx.user.id, s.server_seed, s.server_seed_hash, s.client_seed, s.nonce - 1, now()]);
    const ss = newServerSeed();
    await q('UPDATE slot.seeds SET server_seed=$1,server_seed_hash=$2,client_seed=$3,nonce=0 WHERE user_id=$4', [ss, hashSeed(ss), cs, ctx.user.id]);
    return { revealed: { serverSeed: s.server_seed, serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, lastNonce: s.nonce - 1 }, next: { serverSeedHash: hashSeed(ss), clientSeed: cs } };
  }));
  async function questTick(q, uid, ev) {
    const day = C.dayKey(now(), tz);
    for (const qu of await q('SELECT * FROM slot.quests WHERE active')) {
      let row = await one(q, 'SELECT * FROM slot.quest_progress WHERE user_id=$1 AND quest_id=$2 AND day=$3', [uid, qu.id, day]);
      if (!row) { await q("INSERT INTO slot.quest_progress(user_id,quest_id,day,progress,meta) VALUES($1,$2,$3,0,'[]') ON CONFLICT DO NOTHING", [uid, qu.id, day]); row = { progress: 0, meta: '[]' }; }
      let p = row.progress, meta = row.meta;
      if (qu.type === 'spins') p += 1; else if (qu.type === 'wager') p += ev.bet; else if (qu.type === 'bigwin') { if (ev.win >= ev.bet * 20) p += 1; }
      else if (qu.type === 'games') { const set = new Set(JSON.parse(meta || '[]')); set.add(ev.game); meta = JSON.stringify([...set]); p = set.size; }
      p = Math.min(p, qu.target);
      if (p !== row.progress || meta !== row.meta) await q('UPDATE slot.quest_progress SET progress=$1, meta=$2 WHERE user_id=$3 AND quest_id=$4 AND day=$5', [p, meta, uid, qu.id, day]);
    }
  }
  r('POST', '/api/spin', auth, async (ctx) => {
    const gid = str(ctx.body.game, 'game', 20);
    const G = await games(); const game = G.g[gid];
    if (!game) throw err(404, 'unknown_game', 'Oyun bulunamadı.');
    if (G.active[gid] === false) throw err(403, 'game_disabled', 'Bu oyun şu anda bakımda.');
    const bet = int(ctx.body.bet, 'bet'); if (!BETS.includes(bet)) throw err(400, 'bad_bet', 'Geçersiz bahis.');
    const key = ctx.body.key ? str(ctx.body.key, 'key', 64) : crypto.randomUUID();
    const buyKind = ctx.body.buy ? str(ctx.body.buy, 'buy', 10) : null;
    if (buyKind && !game.buyCost[buyKind]) throw err(400, 'no_buy', 'Bu oyunda bu bonus satın alınamaz.');
    const cost = buyKind ? Math.round(bet * game.buyCost[buyKind]) : bet;
    limit(ctx, 'spin:' + ctx.user.id, 20, 1000);
    const prev = await one(Q, 'SELECT response FROM slot.spins WHERE user_id=$1 AND client_key=$2', [ctx.user.id, key]);
    if (prev) { if (!prev.response) throw err(409, 'spin_expired'); return { ...JSON.parse(prev.response), replay: true }; }
    const evs = await activeEvents();
    return db.tx(async (q) => {
      const u = await one(q, 'SELECT * FROM slot.users WHERE id=$1 FOR UPDATE', [ctx.user.id]);
      if (!u.unlimited && u.balance < cost) throw err(402, 'insufficient_funds', 'Yetersiz jeton. Mağazadan jeton alabilir veya günlük ödülünü toplayabilirsin.');
      const s = await seedRow(q, u.id);
      await q('UPDATE slot.seeds SET nonce=nonce+1 WHERE user_id=$1', [u.id]);
      await applyCoins(q, u.id, -cost, buyKind ? 'buy_' + buyKind : 'bet', gid);
      // Sonuç yalnızca tohum + nonce'tan üretilir; oyuncu geçmişi/bakiyesi olasılığı etkilemez
      const rng = new FairRng(s.server_seed, s.client_seed, s.nonce);
      const result = buyKind ? game.buy(rng, true, buyKind) : game.play(rng, true);
      const win = Math.round(result.win * bet);
      let bal = u.unlimited ? u.balance : u.balance - cost;
      if (win > 0) bal = (await applyCoins(q, u.id, win, 'win', gid)).balance;
      // XP: 100 jeton = 1 XP, etkinlik çarpanı; tek spinde en fazla seviye ihtiyacının 1/25'i
      const oldLevel = C.levelFromXp(u.xp);
      const xpMult = Math.max(1, ...evs.map(e => e.xp_mult));
      const acc = u.wager_rem + cost;
      const raw = Math.floor(acc / C.XP_PER_COINS) * xpMult;
      const gained = Math.min(raw, C.maxXpPerSpin(oldLevel) * xpMult);
      const xp = Math.min(C.XP_MAX, u.xp + gained);
      const level = C.levelFromXp(xp);
      await q('UPDATE slot.users SET xp=$1, level=$2, wager_rem=$3, total_wagered=total_wagered+$4, total_won=total_won+$5, spins=spins+1, biggest_win=GREATEST(biggest_win,$5) WHERE id=$6', [xp, level, acc % C.XP_PER_COINS, cost, win, u.id]);
      await questTick(q, u.id, { bet: cost, win: buyKind ? 0 : win, game: gid });
      await hooks.onSpin(q, u.id, { bet: cost, win, game: gid });
      const li = C.levelInfo(xp);
      const resp = { game: gid, bet, cost, buy: buyKind, win, winX: result.win, result, balance: bal,
        xp: { gained, capped: raw > gained, xp, level, into: li.into, need: li.need, max: li.max, levelUp: level > oldLevel ? level : null },
        fair: { serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: s.nonce } };
      await q('INSERT INTO slot.spins(user_id,game,bet,win,client_key,server_seed_hash,client_seed,nonce,rtp,vol,response,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [u.id, gid, cost, win, key, s.server_seed_hash, s.client_seed, s.nonce, game.rtp, game.vol, JSON.stringify(resp), now()]);
      maintenance();
      return resp;
    });
  });
  r('GET', '/api/spins', auth, async (ctx) => ({ spins: await Q('SELECT id,game,bet,win,server_seed_hash,client_seed,nonce,created_at FROM slot.spins WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [ctx.user.id]) }));

  /* ================= GÖREVLER / ETKİNLİKLER ================= */
  r('GET', '/api/quests', auth, async (ctx) => { const day = C.dayKey(now(), tz); return { day, quests: await Q('SELECT q.*, COALESCE(p.progress,0) progress, COALESCE(p.claimed,FALSE) claimed FROM slot.quests q LEFT JOIN slot.quest_progress p ON p.quest_id=q.id AND p.user_id=$1 AND p.day=$2 WHERE q.active ORDER BY q.id', [ctx.user.id, day]) }; });
  r('POST', '/api/quests/:id/claim', auth, (ctx) => db.tx(async (q) => {
    const day = C.dayKey(now(), tz), qid = int(ctx.params.id, 'id', 1);
    const qu = await one(q, 'SELECT * FROM slot.quests WHERE id=$1 AND active', [qid]); if (!qu) throw err(404, 'no_quest');
    const p = await one(q, 'SELECT * FROM slot.quest_progress WHERE user_id=$1 AND quest_id=$2 AND day=$3 FOR UPDATE', [ctx.user.id, qid, day]);
    if (!p || p.progress < qu.target) throw err(409, 'not_complete', 'Görev henüz tamamlanmadı.');
    if (p.claimed) throw err(409, 'already_claimed', 'Ödül zaten alındı.');
    await q('UPDATE slot.quest_progress SET claimed=TRUE WHERE user_id=$1 AND quest_id=$2 AND day=$3', [ctx.user.id, qid, day]);
    return { reward: qu.reward, balance: (await applyCoins(q, ctx.user.id, qu.reward, 'quest', qid)).balance };
  }));
  r('GET', '/api/events', auth, async (ctx) => ({ events: await Promise.all((await activeEvents()).map(async e => ({ ...e, claimed: !!(await one(Q, 'SELECT 1 x FROM slot.event_claims WHERE user_id=$1 AND event_id=$2', [ctx.user.id, e.id])) }))) }));
  r('POST', '/api/events/:id/claim', auth, (ctx) => db.tx(async (q) => {
    const e = (await activeEvents(q)).find(x => x.id === int(ctx.params.id, 'id', 1));
    if (!e || e.bonus_coins <= 0) throw err(404, 'no_event', 'Etkinlik bulunamadı.');
    const ins = await q('INSERT INTO slot.event_claims VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id', [ctx.user.id, e.id, now()]);
    if (!ins.length) throw err(409, 'already_claimed', 'Etkinlik ödülü zaten alındı.');
    return { reward: e.bonus_coins, balance: (await applyCoins(q, ctx.user.id, e.bonus_coins, 'event', e.id)).balance };
  }));

  /* ================= ARKADAŞLAR / HEDİYE ================= */
  r('GET', '/api/friends', auth, async (ctx) => {
    const id = ctx.user.id;
    return {
      friends: await Q("SELECT u.id,u.username,u.level,u.avatar,(u.last_seen_at > $2) online FROM slot.friends f JOIN slot.users u ON u.id=f.friend_id WHERE f.user_id=$1 AND f.status='accepted' ORDER BY (u.last_seen_at > $2) DESC, u.username", [id, now() - 5 * 60e3]),
      incoming: await Q("SELECT u.id,u.username,u.level,u.avatar FROM slot.friends f JOIN slot.users u ON u.id=f.user_id WHERE f.friend_id=$1 AND f.status='pending'", [id]),
      outgoing: await Q("SELECT u.id,u.username,u.level,u.avatar FROM slot.friends f JOIN slot.users u ON u.id=f.friend_id WHERE f.user_id=$1 AND f.status='pending'", [id]),
      gifts: await Q('SELECT g.id,g.amount,g.created_at,u.username FROM slot.gifts g JOIN slot.users u ON u.id=g.from_id WHERE g.to_id=$1 AND g.claimed_at IS NULL ORDER BY g.id', [id]),
      giftAmounts: await setting('gift_amounts'), giftDailyLimit: await setting('gift_daily_limit'),
    };
  });
  r('POST', '/api/friends/request', auth, async (ctx) => {
    limit(ctx, 'freq:' + ctx.user.id, 20, 3600e3);
    const t = await one(Q, 'SELECT id FROM slot.users WHERE lower(username)=lower($1)', [str(ctx.body.username, 'username', 16)]);
    if (!t) throw err(404, 'user_not_found', 'Kullanıcı bulunamadı.');
    if (t.id === ctx.user.id) throw err(400, 'self', 'Kendini ekleyemezsin.');
    return db.tx(async (q) => {
      const back = await one(q, 'SELECT * FROM slot.friends WHERE user_id=$1 AND friend_id=$2', [t.id, ctx.user.id]);
      if (back && back.status === 'pending') {
        await q("UPDATE slot.friends SET status='accepted' WHERE user_id=$1 AND friend_id=$2", [t.id, ctx.user.id]);
        await q("INSERT INTO slot.friends VALUES($1,$2,'accepted',$3) ON CONFLICT (user_id,friend_id) DO UPDATE SET status='accepted'", [ctx.user.id, t.id, now()]);
        return { status: 'accepted' };
      }
      const ins = await q("INSERT INTO slot.friends VALUES($1,$2,'pending',$3) ON CONFLICT DO NOTHING RETURNING user_id", [ctx.user.id, t.id, now()]);
      if (ins.length) await notify(q, t.id, 'friend', '👥 Yeni arkadaşlık isteği', `${ctx.user.username} seni arkadaş olarak eklemek istiyor.`);
      return { status: ins.length ? 'pending' : 'exists' };
    });
  });
  r('POST', '/api/friends/:id/accept', auth, (ctx) => db.tx(async (q) => {
    const fid = int(ctx.params.id, 'id', 1);
    const up = await q("UPDATE slot.friends SET status='accepted' WHERE user_id=$1 AND friend_id=$2 AND status='pending' RETURNING user_id", [fid, ctx.user.id]);
    if (!up.length) throw err(404, 'no_request', 'İstek bulunamadı.');
    await q("INSERT INTO slot.friends VALUES($1,$2,'accepted',$3) ON CONFLICT (user_id,friend_id) DO UPDATE SET status='accepted'", [ctx.user.id, fid, now()]);
    return { ok: true };
  }));
  r('POST', '/api/friends/:id/remove', auth, async (ctx) => { const fid = int(ctx.params.id, 'id', 1); await Q('DELETE FROM slot.friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)', [ctx.user.id, fid]); return { ok: true }; });
  r('POST', '/api/gifts/send', auth, (ctx) => db.tx(async (q) => {
    const to = int(ctx.body.to, 'to', 1), amount = int(ctx.body.amount, 'amount', 1);
    if (!(await setting('gift_amounts', q)).includes(amount)) throw err(400, 'bad_amount', 'Geçersiz hediye miktarı.');
    if (!(await one(q, "SELECT 1 x FROM slot.friends WHERE user_id=$1 AND friend_id=$2 AND status='accepted'", [ctx.user.id, to]))) throw err(403, 'not_friends', 'Sadece arkadaşlarına hediye gönderebilirsin.');
    const sent = (await one(q, 'SELECT COUNT(*)::int c FROM slot.gifts WHERE from_id=$1 AND created_at>$2', [ctx.user.id, now() - C.DAY_MS])).c;
    if (sent >= await setting('gift_daily_limit', q)) throw err(429, 'gift_limit', 'Günlük hediye limitine ulaştın.');
    const w = await applyCoins(q, ctx.user.id, -amount, 'gift_sent', to);
    await q('INSERT INTO slot.gifts(from_id,to_id,amount,created_at) VALUES($1,$2,$3,$4)', [ctx.user.id, to, amount, now()]);
    await notify(q, to, 'gift', `🎁 ${ctx.user.username} sana hediye gönderdi`, `${amount.toLocaleString('tr-TR')} jeton — Arkadaşlar bölümünden al.`);
    return { balance: w.balance };
  }));
  r('POST', '/api/gifts/:id/claim', auth, (ctx) => db.tx(async (q) => {
    const g = await one(q, 'UPDATE slot.gifts SET claimed_at=$1 WHERE id=$2 AND to_id=$3 AND claimed_at IS NULL RETURNING *', [now(), int(ctx.params.id, 'id', 1), ctx.user.id]);
    if (!g) throw err(404, 'no_gift', 'Hediye bulunamadı.');
    return { amount: g.amount, balance: (await applyCoins(q, ctx.user.id, g.amount, 'gift_received', g.from_id)).balance };
  }));

  /* ================= MAĞAZA / ÖDEME (Google Play, sunucu doğrulamalı) ================= */
  r('GET', '/api/shop', auth, async (ctx) => ({
    packages: (await Q('SELECT * FROM slot.packages WHERE active ORDER BY sort')).map(p => ({ productId: p.product_id, name: p.name, coins: p.coins, priceLabel: p.price_label, bonusLabel: p.bonus_label, oneTime: p.one_time, available: !(p.one_time && ctx.user.starter_bought) })),
    billingAccountId: obfId(ctx.user.id), testMode: cfg.billingMode !== 'google',
    notice: 'Jetonlar yalnızca uygulama içinde eğlence amaçlı kullanılır; nakde çevrilemez, para veya ödül olarak çekilemez.',
  }));
  async function processPurchase(userId, productId, token) {
    const pkg = await one(Q, 'SELECT * FROM slot.packages WHERE product_id=$1', [productId]);
    if (!pkg) throw err(404, 'unknown_product', 'Ürün bulunamadı.');
    const v = await verifier.verify(productId, token);
    if (v.state === 'invalid') throw err(400, 'invalid_purchase', 'Satın alma doğrulanamadı.');
    if (userId != null && v.obfuscatedAccountId && v.obfuscatedAccountId !== obfId(userId)) throw err(403, 'account_mismatch', 'Bu satın alma başka bir hesaba ait.');
    const res = await db.tx(async (q) => {
      let row = await one(q, 'SELECT * FROM slot.purchases WHERE purchase_token=$1 FOR UPDATE', [token]);
      if (row && userId != null && row.user_id !== userId) throw err(409, 'token_used', 'Bu satın alma başka bir hesapta kullanılmış.');
      const uid = row ? row.user_id : userId; if (uid == null) return { status: 'unknown' };
      if (!row) row = await one(q, 'INSERT INTO slot.purchases(user_id,product_id,purchase_token,order_id,state,coins,created_at,updated_at) VALUES($1,$2,$3,$4,$5,0,$6,$6) RETURNING *', [uid, productId, token, v.orderId, v.state, now()]);
      if (row.state === 'refunded') return { status: 'refunded' };
      if (v.state === 'purchased' && !row.credited) {
        const coins = pkg.coins * (v.quantity || 1);
        await q("UPDATE slot.purchases SET state='purchased', credited=TRUE, coins=$1, order_id=$2, updated_at=$3 WHERE id=$4", [coins, v.orderId, now(), row.id]);
        if (pkg.one_time) await q('UPDATE slot.users SET starter_bought=TRUE WHERE id=$1', [uid]);
        const w = await applyCoins(q, uid, coins, 'purchase', row.id);
        return { status: 'purchased', coins, balance: w.balance, credited: true };
      }
      const bal = (await getUser(uid, q)).balance;
      if (v.state === 'purchased') return { status: 'purchased', coins: 0, balance: bal, alreadyCredited: true };
      await q('UPDATE slot.purchases SET state=$1, updated_at=$2 WHERE id=$3', [v.state, now(), row.id]);
      return { status: v.state, balance: bal };
    });
    if (res.status === 'purchased') { try { if (await verifier.consume(productId, token)) await Q('UPDATE slot.purchases SET consumed=TRUE WHERE purchase_token=$1', [token]); } catch (e) { log.warn('[billing] consume', e.message); } }
    return res;
  }
  const revoke = (token, reason) => db.tx(async (q) => {
    const p = await one(q, 'SELECT * FROM slot.purchases WHERE purchase_token=$1 FOR UPDATE', [token]);
    if (!p || p.state === 'refunded') return { status: 'noop' };
    let debited = 0;
    if (p.credited) {
      const w = await applyCoins(q, p.user_id, -p.coins, 'refund', p.id, { clamp: true }); debited = -w.applied;
      if (debited < p.coins) await q('UPDATE slot.users SET refund_debt=refund_debt+$1 WHERE id=$2', [p.coins - debited, p.user_id]);
    }
    await q("UPDATE slot.purchases SET state='refunded', updated_at=$1 WHERE id=$2", [now(), p.id]);
    return { status: 'refunded', debited, reason };
  });
  r('POST', '/api/shop/verify', auth, async (ctx) => {
    limit(ctx, 'buy:' + ctx.user.id, 30, 60e3);
    const productId = str(ctx.body.productId, 'productId', 64), token = str(ctx.body.purchaseToken, 'purchaseToken', 4096);
    const pkg = await one(Q, 'SELECT * FROM slot.packages WHERE product_id=$1 AND active', [productId]); if (!pkg) throw err(404, 'unknown_product', 'Ürün bulunamadı.');
    if (pkg.one_time && ctx.user.starter_bought && !(await one(Q, 'SELECT 1 x FROM slot.purchases WHERE purchase_token=$1', [token]))) throw err(409, 'one_time', 'Başlangıç paketi yalnızca bir kez alınabilir.');
    return processPurchase(ctx.user.id, productId, token);
  });
  r('GET', '/api/shop/history', auth, async (ctx) => ({ purchases: await Q('SELECT p.id,p.product_id,k.name,p.order_id,p.state,p.coins,p.created_at,p.updated_at FROM slot.purchases p LEFT JOIN slot.packages k ON k.product_id=p.product_id WHERE p.user_id=$1 ORDER BY p.id DESC LIMIT 100', [ctx.user.id]) }));
  r('POST', '/api/billing/rtdn', async (ctx) => {
    if (!cfg.rtdnSecret || ctx.query.get('secret') !== cfg.rtdnSecret) throw err(403, 'forbidden');
    const data = JSON.parse(Buffer.from(ctx.body?.message?.data || '', 'base64').toString('utf8') || '{}');
    if (data.voidedPurchaseNotification) return revoke(data.voidedPurchaseNotification.purchaseToken, 'voided');
    const o = data.oneTimeProductNotification;
    if (o && o.purchaseToken) {
      if (o.notificationType === 2) { await Q("UPDATE slot.purchases SET state='canceled', updated_at=$1 WHERE purchase_token=$2 AND NOT credited", [now(), o.purchaseToken]); return { ok: true }; }
      try { return await processPurchase(null, o.sku, o.purchaseToken); } catch (e) { return { ok: false, error: e.code }; }
    }
    return { ok: true };
  });

  /* ================= DESTEK / TELEMETRİ / SÜRÜM ================= */
  r('POST', '/api/support', auth, async (ctx) => { limit(ctx, 'ticket:' + ctx.user.id, 5, 3600e3); const t = await one(Q, 'INSERT INTO slot.tickets(user_id,subject,message,created_at,updated_at) VALUES($1,$2,$3,$4,$4) RETURNING id', [ctx.user.id, str(ctx.body.subject, 'subject', 120), str(ctx.body.message, 'message', 2000), now()]); return { id: t.id }; });
  r('GET', '/api/support', auth, async (ctx) => ({ tickets: await Q('SELECT * FROM slot.tickets WHERE user_id=$1 ORDER BY id DESC', [ctx.user.id]) }));
  r('POST', '/api/telemetry', auth, async (ctx) => {
    limit(ctx, 'tele:' + ctx.user.id, 6, 60e3);
    const fps = Number(ctx.body.fps); if (!(fps >= 0 && fps <= 240)) throw err(400, 'bad_fps');
    await Q('INSERT INTO slot.client_perf(user_id,game,fps,worst_ms,device,app_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [ctx.user.id, String(ctx.body.game || '').slice(0, 20), fps, Math.min(60000, Math.max(0, Math.round(Number(ctx.body.worstMs) || 0))), String(ctx.body.device || '').slice(0, 120), String(ctx.body.appVersion || '').slice(0, 20), now()]);
    return { ok: true };
  });
  r('POST', '/api/telemetry/error', auth, async (ctx) => {
    limit(ctx, 'terr:' + ctx.user.id, 10, 60e3);
    await Q('INSERT INTO slot.client_errors(user_id,message,stack,screen,device,app_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [ctx.user.id, str(ctx.body.message || '?', 'message', 300), String(ctx.body.stack || '').slice(0, 900), String(ctx.body.screen || '').slice(0, 40), String(ctx.body.device || '').slice(0, 120), String(ctx.body.appVersion || '').slice(0, 20), now()]);
    return { ok: true };
  });
  r('GET', '/api/app/version', async () => { const v = await one(Q, 'SELECT version_code,version_name,apk_url,notes,mandatory,created_at FROM slot.app_versions ORDER BY version_code DESC, id DESC LIMIT 1'); return { latest: v || null }; });
  // CI (GitHub Actions) yalnızca OIDC kimliğiyle sürüm yükleyebilir ve imza anahtarını alabilir — depoda gizli anahtar tutulmaz
  async function ciAuth(ctx) {
    if (!cfg.verifyCiToken) throw err(403, 'ci_disabled');
    const h = ctx.req.headers.get('authorization') || '';
    try { ctx.ci = await cfg.verifyCiToken(h.startsWith('Bearer ') ? h.slice(7) : ''); } catch { throw err(403, 'ci_forbidden', 'CI kimliği doğrulanamadı.'); }
  }
  r('GET', '/api/release/signing', ciAuth, async () => { if (!cfg.signing) throw err(404, 'no_signing'); return cfg.signing; });
  r('POST', '/api/release', ciAuth, async (ctx) => {
    const code = int(ctx.query.get('code'), 'code', 1, 2100000000), name = str(ctx.query.get('name'), 'name', 20);
    if (!cfg.storeApk) throw err(501, 'no_storage');
    const bytes = ctx.raw; if (!bytes || bytes.length < 100000) throw err(400, 'apk_missing');
    const url = await cfg.storeApk(bytes, `SlotSalonu-${code}.apk`);
    await Q('INSERT INTO slot.app_versions(version_code,version_name,apk_url,notes,mandatory,created_at) VALUES($1,$2,$3,$4,$5,$6)', [code, name, url, String(ctx.query.get('notes') || '').slice(0, 500), ctx.query.get('mandatory') === '1', now()]);
    return { ok: true, url };
  });

  /* ================= YÖNETİCİ ================= */
  r('GET', '/api/admin/stats', admin, async () => ({
    users: (await one(Q, "SELECT COUNT(*)::int c FROM slot.users WHERE role='player'")).c,
    coins: (await one(Q, "SELECT COALESCE(SUM(balance),0)::bigint s FROM slot.users WHERE role='player'")).s,
    purchases: await one(Q, "SELECT COUNT(*)::int c, COALESCE(SUM(coins),0)::bigint s FROM slot.purchases WHERE state='purchased'"),
    games: await Q('SELECT game, COUNT(*)::int spins, SUM(bet)::bigint wagered, SUM(win)::bigint won FROM slot.spins GROUP BY game'),
    openTickets: (await one(Q, "SELECT COUNT(*)::int c FROM slot.tickets WHERE status='acik'")).c,
  }));
  // Kazanç/kayıp istatistikleri: oyun bazında teorik ve gerçekleşen RTP, isabet oranı, oyuncu sayısı, kasa sonucu
  r('GET', '/api/admin/game-stats', admin, async (ctx) => {
    const days = Number(ctx.query.get('days') || 7); const since = days > 0 ? now() - days * C.DAY_MS : 0;
    const G = await games();
    const rows = await Q('SELECT game, COUNT(*)::int spins, COUNT(DISTINCT user_id)::int players, COALESCE(SUM(bet),0)::bigint wagered, COALESCE(SUM(win),0)::bigint won, COUNT(*) FILTER (WHERE win>0)::int hits, COALESCE(MAX(win),0)::bigint biggest, COALESCE(AVG(bet),0)::float avg_bet, COUNT(*) FILTER (WHERE win>=bet*20)::int bigwins FROM slot.spins WHERE created_at>=$1 GROUP BY game', [since]);
    const by = Object.fromEntries(rows.map(x => [x.game, x]));
    const daily = await Q("SELECT floor((created_at + $2::bigint) / 86400000)::bigint AS day, COALESCE(SUM(bet),0)::bigint wagered, COALESCE(SUM(win),0)::bigint won, COUNT(*)::int spins FROM slot.spins WHERE created_at>=$1 GROUP BY 1 ORDER BY 1", [Math.max(since, now() - 30 * C.DAY_MS), tz * 60000]);
    const t = now();
    const players = {
      total: (await one(Q, "SELECT COUNT(*)::int c FROM slot.users WHERE role='player'")).c,
      online5m: (await one(Q, "SELECT COUNT(*)::int c FROM slot.users WHERE role='player' AND last_seen_at>$1", [t - 5 * 60e3])).c,
      active24h: (await one(Q, "SELECT COUNT(*)::int c FROM slot.users WHERE role='player' AND last_seen_at>$1", [t - C.DAY_MS])).c,
      new7d: (await one(Q, "SELECT COUNT(*)::int c FROM slot.users WHERE role='player' AND created_at>$1", [t - 7 * C.DAY_MS])).c,
      okeyNow: (await one(Q, "SELECT COUNT(DISTINCT p.user_id)::int c FROM slot.okey_players p JOIN slot.okey_tables t ON t.id=p.table_id WHERE p.active AND t.status IN ('waiting','playing','round_end')")).c,
      okeyTables: await Q("SELECT status, COUNT(*)::int n FROM slot.okey_tables WHERE updated_at>$1 GROUP BY status", [t - C.DAY_MS]),
    };
    return { days, players, daily: daily.map(d => ({ day: Number(d.day) * 86400000 - tz * 60000, wagered: d.wagered, won: d.won, spins: d.spins })),
      games: ORDER.map(id => { const x = by[id] || { spins: 0, players: 0, wagered: 0, won: 0, hits: 0, biggest: 0, avg_bet: 0, bigwins: 0 };
        return { id, name: G.g[id].name, theoreticalRtp: G.g[id].rtp, vol: G.g[id].vol, volatility: G.g[id].volatility, active: G.active[id] !== false, ...x,
          observedRtp: x.wagered > 0 ? x.won / x.wagered : null, hitRate: x.spins ? x.hits / x.spins : null, house: x.wagered - x.won }; }) };
  });
  r('GET', '/api/admin/users', admin, async (ctx) => { const q = ctx.query.get('q') || ''; return { users: await Q("SELECT id,email,username,role,balance,xp,level,banned,unlimited,created_at,last_login_at FROM slot.users WHERE username ILIKE $1 OR email ILIKE $1 OR id::text=$2 ORDER BY id DESC LIMIT 100", ['%' + q.replace(/[%_]/g, '') + '%', q]) }; });
  r('GET', '/api/admin/users/:id', admin, async (ctx) => {
    const u = await getUser(int(ctx.params.id, 'id', 1)); if (!u) throw err(404, 'user_not_found', 'Kullanıcı bulunamadı.');
    return { user: { ...pub(u), banned: u.banned, refundDebt: u.refund_debt, lastLoginAt: u.last_login_at, rewardClaimedUpto: u.reward_claimed_upto },
      ledger: await Q('SELECT * FROM slot.ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]), purchases: await Q('SELECT * FROM slot.purchases WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]), spins: await Q('SELECT id,game,bet,win,nonce,created_at FROM slot.spins WHERE user_id=$1 ORDER BY id DESC LIMIT 30', [u.id]) };
  });
  r('POST', '/api/admin/users/:id/coins', admin, (ctx) => db.tx(async (q) => {
    const uid = int(ctx.params.id, 'id', 1), delta = int(ctx.body.delta, 'delta', -1e15, 1e15), reason = str(ctx.body.reason || 'manuel', 'reason', 200);
    const w = await applyCoins(q, uid, delta, 'admin', `${ctx.user.id}:${reason}`, { clamp: !!ctx.body.clamp });
    await audit(q, ctx, 'coins', uid, { delta, reason, balance: w.balance }); return w;
  }));
  r('POST', '/api/admin/users/:id/progress', admin, (ctx) => db.tx(async (q) => {
    const uid = int(ctx.params.id, 'id', 1), u = await one(q, 'SELECT * FROM slot.users WHERE id=$1 FOR UPDATE', [uid]); if (!u) throw err(404, 'user_not_found');
    let xp = u.xp;
    if (ctx.body.level != null && ctx.body.level !== '') xp = C.cumXp(int(ctx.body.level, 'level', 1, C.MAX_LEVEL));
    if (ctx.body.xp != null && ctx.body.xp !== '') xp = int(ctx.body.xp, 'xp', 0, C.XP_MAX);
    const lvl = C.levelFromXp(xp);
    await q('UPDATE slot.users SET xp=$1, level=$2, reward_claimed_upto=LEAST(reward_claimed_upto,$2) WHERE id=$3', [xp, lvl, uid]);
    await audit(q, ctx, 'progress', uid, { from: u.xp, to: xp, level: lvl }); return { xp, level: lvl };
  }));
  r('POST', '/api/admin/users/:id/status', admin, (ctx) => db.tx(async (q) => {
    const uid = int(ctx.params.id, 'id', 1), u = await getUser(uid, q); if (!u) throw err(404, 'user_not_found');
    if (u.role === 'admin' && uid !== ctx.user.id && ctx.body.banned) throw err(400, 'cannot_modify_admin', 'Yönetici hesabı askıya alınamaz.');
    if (ctx.body.banned != null) { await q('UPDATE slot.users SET banned=$1 WHERE id=$2', [!!ctx.body.banned, uid]); if (ctx.body.banned) await q('DELETE FROM slot.sessions WHERE user_id=$1', [uid]); }
    if (ctx.body.unlimited != null) { if (u.role !== 'admin') throw err(400, 'admin_only', 'Sınırsız jeton yalnızca yönetici hesabına tanımlanabilir.'); await q('UPDATE slot.users SET unlimited=$1 WHERE id=$2', [!!ctx.body.unlimited, uid]); }
    await audit(q, ctx, 'status', uid, ctx.body); return { ok: true };
  }));
  r('POST', '/api/admin/users/:id/password', admin, (ctx) => db.tx(async (q) => {
    const uid = int(ctx.params.id, 'id', 1); C.checkPassword(ctx.body.password);
    await q('UPDATE slot.users SET pass_hash=$1 WHERE id=$2', [C.hashPassword(ctx.body.password), uid]); await q('DELETE FROM slot.sessions WHERE user_id=$1', [uid]);
    await audit(q, ctx, 'password_reset', uid, {}); return { ok: true };
  }));
  r('GET', '/api/admin/games', admin, async () => {
    const G = await games(true);
    const obs = Object.fromEntries((await Q('SELECT game, COUNT(*)::int spins, COALESCE(SUM(bet),0)::bigint wagered, COALESCE(SUM(win),0)::bigint won FROM slot.spins GROUP BY game')).map(x => [x.game, x]));
    return { min: RTP_MIN, max: RTP_MAX, volLevels: VOL_LEVELS.map(v => ({ id: v, name: VOL_NAMES[v] })), games: ORDER.map(id => ({ id, name: G.g[id].name, rtp: G.g[id].rtp, vol: G.g[id].vol, volatility: G.g[id].volatility, active: G.active[id] !== false, buyCost: G.g[id].buyCost, observed: obs[id] || { spins: 0, wagered: 0, won: 0 } })), history: await Q('SELECT h.*, u.username admin_name FROM slot.rtp_history h LEFT JOIN slot.users u ON u.id=h.admin_id ORDER BY h.id DESC LIMIT 50') };
  });
  r('PUT', '/api/admin/games/:id', admin, (ctx) => db.tx(async (q) => {
    const id = str(ctx.params.id, 'id', 20); if (!ORDER.includes(id)) throw err(404, 'unknown_game');
    const cur = await one(q, 'SELECT * FROM slot.games_config WHERE game=$1 FOR UPDATE', [id]);
    let rtp = Number(cur.rtp);
    if (ctx.body.rtp != null) { rtp = Number(ctx.body.rtp); if (!(rtp >= RTP_MIN && rtp <= RTP_MAX)) throw err(400, 'bad_rtp', `RTP %${RTP_MIN * 100}–%${RTP_MAX * 100} arasında olmalı.`); rtp = Math.round(rtp * 10000) / 10000; }
    const active = ctx.body.active == null ? cur.active : !!ctx.body.active;
    const oldVol = cur.volatility || DEFAULT_VOL[id]; let vol = oldVol;
    if (ctx.body.vol != null) { vol = String(ctx.body.vol); if (!VOL_LEVELS.includes(vol)) throw err(400, 'bad_vol', 'Volatilite düşük, orta veya yüksek olmalı.'); }
    await q('UPDATE slot.games_config SET rtp=$1, active=$2, volatility=$3, updated_at=$4 WHERE game=$5', [rtp, active, vol, now(), id]);
    if (rtp !== Number(cur.rtp) || vol !== oldVol) await q('INSERT INTO slot.rtp_history(game,old_rtp,new_rtp,old_vol,new_vol,admin_id,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, cur.rtp, rtp, oldVol, vol, ctx.user.id, String(ctx.body.note || '').slice(0, 200), now()]);
    await audit(q, ctx, 'game_config', null, { game: id, rtp, vol, active }); gcache = null;
    return { ok: true, rtp, vol, active };
  }));
  r('GET', '/api/admin/perf', admin, async () => ({
    api: await Q('SELECT day, route, count, total_ms, max_ms, errors FROM slot.api_metrics WHERE day >= $1 ORDER BY day DESC, count DESC LIMIT 200', [C.dayKey(now() - 7 * C.DAY_MS, tz)]),
    clients: await Q("SELECT COALESCE(NULLIF(game,''),'-') game, COUNT(*)::int samples, ROUND(AVG(fps),1) avg_fps, MIN(fps) min_fps, MAX(worst_ms) worst_ms FROM slot.client_perf WHERE created_at > $1 GROUP BY 1 ORDER BY 1", [now() - 7 * C.DAY_MS]),
    devices: await Q('SELECT device, ROUND(AVG(fps),1) avg_fps, COUNT(*)::int n FROM slot.client_perf WHERE created_at > $1 GROUP BY device ORDER BY n DESC LIMIT 20', [now() - 7 * C.DAY_MS]),
    errors: await Q('SELECT e.message, e.screen, e.app_version, e.device, COUNT(*)::int n, MAX(e.created_at) last_at, MIN(e.stack) stack FROM slot.client_errors e WHERE e.created_at > $1 GROUP BY 1,2,3,4 ORDER BY last_at DESC LIMIT 50', [now() - 7 * C.DAY_MS]),
  }));
  r('GET', '/api/admin/config', admin, async () => ({ daily: await setting('daily_anchors'), dailyAfter: await setting('daily_after'), levelRewards: await setting('level_rewards'), startingCoins: await setting('starting_coins'), giftAmounts: await setting('gift_amounts'), giftDailyLimit: await setting('gift_daily_limit'), mailConfigured: mailer.configured }));
  r('PUT', '/api/admin/config/daily', admin, async (ctx) => {
    const a = ctx.body.anchors; if (!Array.isArray(a) || !a.length || !a.every(x => Array.isArray(x) && Number.isInteger(x[0]) && x[0] >= 1 && x[0] <= C.MAX_LEVEL && Number.isInteger(x[1]) && x[1] >= 0)) throw err(400, 'bad_anchors', 'Geçersiz tablo.');
    await setSetting('daily_anchors', a);
    if (ctx.body.after) await setSetting('daily_after', { perLevel: int(ctx.body.after.perLevel, 'perLevel', 0, 1e6), max: int(ctx.body.after.max, 'max', 0, 1e12) });
    await audit(Q, ctx, 'config_daily', null, ctx.body); return { ok: true };
  });
  r('PUT', '/api/admin/config/level-rewards', admin, async (ctx) => {
    const v = { every: int(ctx.body.every, 'every', 1, 100000), perLevel: int(ctx.body.perLevel, 'perLevel', 0, 1e6), special: {} };
    for (const [k, c] of Object.entries(ctx.body.special || {})) v.special[int(k, 'level', 1, C.MAX_LEVEL)] = int(c, 'coins', 0, 1e12);
    await setSetting('level_rewards', v); await audit(Q, ctx, 'config_level_rewards', null, v); return { ok: true };
  });
  r('PUT', '/api/admin/config/general', admin, async (ctx) => {
    if (ctx.body.startingCoins != null) await setSetting('starting_coins', int(ctx.body.startingCoins, 'startingCoins', 0, 1e12));
    if (ctx.body.giftDailyLimit != null) await setSetting('gift_daily_limit', int(ctx.body.giftDailyLimit, 'limit', 0, 100));
    await audit(Q, ctx, 'config_general', null, ctx.body); return { ok: true };
  });
  r('GET', '/api/admin/packages', admin, async () => ({ packages: await Q('SELECT * FROM slot.packages ORDER BY sort') }));
  r('PUT', '/api/admin/packages/:pid', admin, async (ctx) => {
    const pid = str(ctx.params.pid, 'pid', 64), b = ctx.body; if (!/^[a-z0-9_.]{2,64}$/.test(pid)) throw err(400, 'bad_product_id', 'Ürün kimliği küçük harf, rakam, _ ve . içerebilir.');
    await Q(`INSERT INTO slot.packages(product_id,name,coins,price_label,bonus_label,one_time,active,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (product_id) DO UPDATE SET name=EXCLUDED.name, coins=EXCLUDED.coins, price_label=EXCLUDED.price_label, bonus_label=EXCLUDED.bonus_label, one_time=EXCLUDED.one_time, active=EXCLUDED.active, sort=EXCLUDED.sort`,
      [pid, str(b.name, 'name', 60), int(b.coins, 'coins', 1, 1e13), str(b.priceLabel, 'priceLabel', 30), b.bonusLabel ? String(b.bonusLabel).slice(0, 40) : null, !!b.oneTime, b.active !== false, int(b.sort ?? 0, 'sort', 0, 1000)]);
    await audit(Q, ctx, 'package', null, { pid, ...b }); return { ok: true };
  });
  r('GET', '/api/admin/purchases', admin, async () => ({ purchases: await Q('SELECT p.*, u.username FROM slot.purchases p JOIN slot.users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 200') }));
  r('POST', '/api/admin/purchases/:id/refund', admin, async (ctx) => { const p = await one(Q, 'SELECT * FROM slot.purchases WHERE id=$1', [int(ctx.params.id, 'id', 1)]); if (!p) throw err(404, 'no_purchase'); const res = await revoke(p.purchase_token, 'admin'); await audit(Q, ctx, 'refund', p.user_id, { purchase: p.id, ...res }); return res; });
  r('GET', '/api/admin/events', admin, async () => ({ events: await Q('SELECT * FROM slot.events ORDER BY id DESC') }));
  r('POST', '/api/admin/events', admin, async (ctx) => {
    const b = ctx.body; const v = [str(b.title, 'title', 80), String(b.description || '').slice(0, 500), int(b.startsAt, 'startsAt', 0), int(b.endsAt, 'endsAt', 0), int(b.xpMult ?? 1, 'xpMult', 1, 10), int(b.bonusCoins ?? 0, 'bonusCoins', 0, 1e12), b.active !== false];
    if (v[3] <= v[2]) throw err(400, 'bad_dates', 'Bitiş başlangıçtan sonra olmalı.');
    let id = b.id;
    if (id) await Q('UPDATE slot.events SET title=$1,description=$2,starts_at=$3,ends_at=$4,xp_mult=$5,bonus_coins=$6,active=$7 WHERE id=$8', [...v, int(id, 'id', 1)]);
    else id = (await one(Q, 'INSERT INTO slot.events(title,description,starts_at,ends_at,xp_mult,bonus_coins,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', v)).id;
    await audit(Q, ctx, 'event', null, { id, ...b }); return { id };
  });
  r('GET', '/api/admin/quests', admin, async () => ({ quests: await Q('SELECT * FROM slot.quests ORDER BY id') }));
  r('POST', '/api/admin/quests', admin, async (ctx) => {
    const b = ctx.body; if (!['spins', 'wager', 'bigwin', 'games'].includes(b.type)) throw err(400, 'bad_type');
    const v = [str(b.title, 'title', 80), b.type, int(b.target, 'target', 1, 1e13), int(b.reward, 'reward', 0, 1e12), b.active !== false];
    let id = b.id;
    if (id) await Q('UPDATE slot.quests SET title=$1,type=$2,target=$3,reward=$4,active=$5 WHERE id=$6', [...v, int(id, 'id', 1)]);
    else id = (await one(Q, 'INSERT INTO slot.quests(title,type,target,reward,active) VALUES($1,$2,$3,$4,$5) RETURNING id', v)).id;
    await audit(Q, ctx, 'quest', null, { id, ...b }); return { id };
  });
  r('GET', '/api/admin/tickets', admin, async () => ({ tickets: await Q('SELECT t.*, u.username FROM slot.tickets t JOIN slot.users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 100') }));
  r('POST', '/api/admin/tickets/:id/reply', admin, async (ctx) => { const id = int(ctx.params.id, 'id', 1); await Q("UPDATE slot.tickets SET reply=$1, status='yanitlandi', updated_at=$2 WHERE id=$3", [str(ctx.body.reply, 'reply', 2000), now(), id]); await audit(Q, ctx, 'ticket_reply', null, { id }); return { ok: true }; });
  r('GET', '/api/admin/audit', admin, async () => ({ audit: await Q('SELECT a.*, u.username admin_name, t.username target_name FROM slot.audit a JOIN slot.users u ON u.id=a.admin_id LEFT JOIN slot.users t ON t.id=a.target_user ORDER BY a.id DESC LIMIT 200') }));

  r('GET', '/api/health', async () => ({ ok: true, time: now(), db: db.kind }));

  /* ---------- istek işleyici ---------- */
  const cors = { 'Access-Control-Allow-Origin': cfg.corsOrigin || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Max-Age': '600' };
  const sec = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  async function metric(route, ms, isErr) {
    try { await Q('INSERT INTO slot.api_metrics(day,route,count,total_ms,max_ms,errors) VALUES($1,$2,1,$3,$3,$4) ON CONFLICT (day,route) DO UPDATE SET count=slot.api_metrics.count+1, total_ms=slot.api_metrics.total_ms+$3, max_ms=GREATEST(slot.api_metrics.max_ms,$3), errors=slot.api_metrics.errors+$4', [C.dayKey(now(), tz), route, Math.round(ms), isErr ? 1 : 0]); } catch {}
  }
  async function handle(req, ip) {
    const t0 = Date.now();
    const url = new URL(req.url);
    let path = url.pathname; const i = path.indexOf('/api/'); if (i > 0) path = path.slice(i); // Supabase: /slot-api/api/... -> /api/...
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, ...sec } });
    const ctx = { req, query: url.searchParams, ip: ip || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '0', body: {} };
    let status = 200, out, route = 'unknown';
    try {
      let m = null;
      for (const rt of routes) { if (rt.method !== req.method) continue; const mm = rt.re.exec(path); if (mm) { m = rt; ctx.params = {}; rt.keys.forEach((k, j) => { ctx.params[k] = decodeURIComponent(mm[j + 1]); }); break; } }
      if (!m) throw err(404, 'not_found', 'Bulunamadı.');
      route = req.method + ' ' + m.pattern;
      if (req.method !== 'GET') {
        const buf = new Uint8Array(await req.arrayBuffer());
        if (buf.length > 60 * 1024 * 1024) throw err(413, 'too_large');
        if ((req.headers.get('content-type') || '').includes('application/json') || (buf.length && buf[0] === 123)) { try { ctx.body = JSON.parse(new TextDecoder().decode(buf) || '{}'); } catch { throw err(400, 'bad_json', 'Geçersiz istek.'); } }
        else ctx.raw = buf;
      }
      if (ctx.body === null || typeof ctx.body !== 'object') ctx.body = {};
      for (const h of m.handlers) out = await h(ctx);
    } catch (e) {
      if (e instanceof C.HttpError) { status = e.status; out = { error: e.code, message: e.message }; }
      else { status = 500; out = { error: 'server_error', message: 'Sunucu hatası.' }; log.error(e); }
    }
    if (route !== 'GET /api/health') await metric(route, Date.now() - t0, status >= 500);
    return new Response(JSON.stringify(out ?? {}), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...sec } });
  }

  await migrate();
  const S = { r, auth, admin, db, Q, one, applyCoins, err, int, str, now, limit, C, audit, hooks };
  registerSocial(S); notify = S.notify; addTickets = S.addTickets; ensureTournaments = S.ensureTournaments;
  registerOkey({ r, auth, authLite, db, Q, one, applyCoins, err, int, str, now, limit, C, setting, setSetting, audit, admin, hooks, notify: S.notify });
  const G2 = { r, auth, authLite, db, Q, one, applyCoins, err, int, str, now, limit, C, setting, setSetting, audit, admin, hooks, notify: S.notify };
  registerTavla(G2); registerAviator(G2);
  return { handle, db, games, verifier, refreshGames: () => games(true) };
}
