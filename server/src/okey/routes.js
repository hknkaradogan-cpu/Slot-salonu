// 101 Okey çevrim içi masalar: hızlı eşleşme (gerçek oyuncu + 20 sn sonra bot), özel masa (kod + arkadaş daveti),
// sanal jeton giriş havuzu veya ücretsiz (XP) masalar. Durum veritabanında; her istek "tembel" ilerletme yapar.
import * as TB from './table.js';

export const STAKES = [0, 1000, 10000, 100000, 1000000];
const LEFT_GRACE_MS = 15 * 60e3;
export const ROUNDS = [1, 2, 3, 4];
const PAYOUT_TEKLI = [0.6, 0.3, 0.1, 0];
const XP_TEKLI = [300, 150, 75, 30], XP_ESLI_WIN = 250, XP_ESLI_LOSE = 60;
export const CHAT = ['Merhaba! 👋', 'Kolay gelsin', 'Hadi bakalım!', 'Güzel hamle 👏', 'Şanslısın 🍀', 'Tebrikler 🎉', 'Biraz hızlı 🙏', 'Teşekkürler 😊', 'Görüşürüz 👋'];
const ALLOWED = new Set(['draw', 'take', 'return', 'open', 'lay', 'add', 'retrieve', 'discard', 'undo', 'finish']);

export const OKEY_DEFAULTS = { enabled: true, stakes: [0, 1000, 10000, 100000, 1000000], modes: ['tekli', 'esli'], rounds: [1, 2, 3, 4], katlamali: [true, false], turnSeconds: 30, botFillSeconds: 20, botsAllowed: true };
export function registerOkey(A) {
  const { r, auth, db, Q, one, applyCoins, err, int, str, now, limit, C } = A; const authLite = A.authLite || auth;

  let ocfg = null, ocfgAt = 0;
  async function okeyConfig(force) {
    if (!force && ocfg && now() - ocfgAt < 15000) return ocfg;
    const v = A.setting ? await A.setting('okey_config') : null; ocfg = { ...OKEY_DEFAULTS, ...(v || {}) }; ocfgAt = now(); return ocfg;
  }
  const codeGen = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const seatOf = (T, uid) => T.seats.findIndex(x => x && x.uid === uid);
  async function parseOpts(b) {
    const c = await okeyConfig();
    if (!c.enabled) throw err(503, 'okey_disabled', '101 Okey şu anda bakımda.');
    const mode = b.mode === 'esli' ? 'esli' : 'tekli'; if (!c.modes.includes(mode)) throw err(400, 'mode_disabled', 'Bu oyun türü şu anda kapalı.');
    const stake = int(b.stake ?? 0, 'stake', 0); if (!STAKES.includes(stake) || !c.stakes.includes(stake)) throw err(400, 'bad_stake', 'Bu masa şu anda kapalı.');
    const rounds = int(b.rounds ?? 1, 'rounds', 1); if (!ROUNDS.includes(rounds) || !c.rounds.includes(rounds)) throw err(400, 'bad_rounds', 'Geçersiz el sayısı.');
    const variant = b.variant === 'duz' ? 'duz' : '101';
    const katlamali = variant === 'duz' ? false : b.katlamali !== false; if (variant === '101' && !c.katlamali.includes(katlamali)) throw err(400, 'kat_disabled', 'Bu oyun türü şu anda kapalı.');
    if (variant === 'duz' && c.duzEnabled === false) throw err(503, 'duz_disabled', 'Düz Okey şu anda bakımda.');
    return { variant, mode, stake, rounds, katlamali, turnMs: c.turnSeconds * 1000, fillMs: c.botFillSeconds * 1000, bots: c.botsAllowed };
  }
  async function activeTable(q, uid) {
    return one(q, "SELECT t.id, t.status FROM slot.okey_players p JOIN slot.okey_tables t ON t.id=p.table_id WHERE p.user_id=$1 AND p.active AND t.status IN ('waiting','playing','round_end') ORDER BY t.id DESC LIMIT 1", [uid]);
  }
  async function save(q, id, T) {
    await q('UPDATE slot.okey_tables SET state=$1, status=$2, version=version+1, updated_at=$3 WHERE id=$4', [JSON.stringify(T), T.status, now(), id]);
  }
  async function seatUser(q, tableId, T, user, seat) {
    const s = TB.seatHuman(T, user, seat);
    if (T.cfg.stake) await applyCoins(q, user.id, -T.cfg.stake, 'okey_entry', tableId);
    await q('INSERT INTO slot.okey_players(table_id,user_id,seat,active,paid,joined_at) VALUES($1,$2,$3,TRUE,$4,$5) ON CONFLICT (table_id,user_id) DO UPDATE SET seat=EXCLUDED.seat, active=TRUE, paid=EXCLUDED.paid', [tableId, user.id, s, T.cfg.stake, now()]);
    return s;
  }
  async function userLite(q, uid) { const u = await one(q, 'SELECT id, username, avatar, xp, balance, unlimited FROM slot.users WHERE id=$1 FOR UPDATE', [uid]); u.level = C.levelFromXp(u.xp); return u; }
  function needsTick(T, t) {
    if (T.status === 'waiting') return !!(T.fillAt && t >= T.fillAt);
    if (T.status === 'round_end') return t >= T.deadline;
    if (T.status === 'playing') { const s = T.seats[T.hand.turn]; return (s.bot || s.left || s.away) ? t >= T.botAt : t >= T.deadline; }
    return false;
  }

  /** Oyun bitince jeton/XP dağıtımı (tek seferlik). */
  async function settle(q, row, T) {
    if (T.status !== 'finished' || T.settled) return;
    T.settled = true;
    const players = await q('SELECT user_id, seat FROM slot.okey_players WHERE table_id=$1', [row.id]);
    const pool = T.cfg.stake * 4, pay = [0, 0, 0, 0], xp = [0, 0, 0, 0];
    if (T.cfg.mode === 'esli') {
      const w = T.final.winners; const share = w.length === 4 ? T.cfg.stake : pool / 2;
      for (let s = 0; s < 4; s++) { if (w.includes(s)) pay[s] = share; xp[s] = w.includes(s) && w.length < 4 ? XP_ESLI_WIN : XP_ESLI_LOSE; }
    } else {
      // eşit puanlılar sıralama paylarını bölüşür
      const rk = T.final.ranking; let i = 0;
      while (i < 4) { let j = i; while (j + 1 < 4 && T.totals[rk[j + 1]] === T.totals[rk[i]]) j++; const sh = PAYOUT_TEKLI.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1), xs = Math.round(XP_TEKLI.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1)); for (let k = i; k <= j; k++) { pay[rk[k]] = pool * sh; xp[rk[k]] = xs; } i = j + 1; }
    }
    T.payouts = [0, 0, 0, 0]; T.xpGain = [0, 0, 0, 0];
    for (const p of players) {
      const seat = T.seats[p.seat]; if (!seat || seat.uid !== p.user_id || seat.left) continue; // masadan ayrılan ödül alamaz
      const coins = Math.floor(pay[p.seat]);
      if (coins > 0) await applyCoins(q, p.user_id, coins, 'okey_win', row.id);
      const u = await one(q, 'SELECT xp FROM slot.users WHERE id=$1 FOR UPDATE', [p.user_id]);
      const nx = Math.min(C.XP_MAX, u.xp + xp[p.seat]); await q('UPDATE slot.users SET xp=$1, level=$2 WHERE id=$3', [nx, C.levelFromXp(nx), p.user_id]);
      const won = T.final.winners.includes(p.seat) && T.final.winners.length < 4;
      await q('INSERT INTO slot.okey_stats(user_id,played,won,coins_won,best_score) VALUES($1,1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET played=slot.okey_stats.played+1, won=slot.okey_stats.won+EXCLUDED.won, coins_won=slot.okey_stats.coins_won+EXCLUDED.coins_won, best_score=LEAST(slot.okey_stats.best_score, EXCLUDED.best_score)', [p.user_id, won ? 1 : 0, coins, T.totals[p.seat]]);
      await q('UPDATE slot.okey_players SET payout=$1, active=FALSE WHERE table_id=$2 AND user_id=$3', [coins, row.id, p.user_id]);
      if (A.hooks) await A.hooks.onOkey(q, p.user_id, { rank: T.final.ranking.indexOf(p.seat), won, mode: T.cfg.mode });
      T.payouts[p.seat] = coins; T.xpGain[p.seat] = xp[p.seat];
    }
  }

  /** Masayı kilitleyip ilerletir, fn çalıştırır, değiştiyse kaydeder. */
  async function withTable(id, fn) {
    return db.tx(async (q) => {
      const row = await one(q, 'SELECT * FROM slot.okey_tables WHERE id=$1 FOR UPDATE', [id]);
      if (!row) throw err(404, 'no_table', 'Masa bulunamadı.');
      const T = JSON.parse(row.state); const v0 = T.seq, st0 = T.status;
      if (T.allLeftAt && now() - T.allLeftAt > LEFT_GRACE_MS && T.status !== 'finished') T.status = 'abandoned';
      let changed = T.status === 'abandoned' ? false : TB.tick(T, now());
      const out = await fn(T, q, row);
      if (out && out.changed) changed = true;
      if (T.seq !== v0 || T.status !== st0) changed = true;
      if (T.status === 'finished' && !T.settled) { await settle(q, row, T); changed = true; }
      if (changed) await save(q, id, T);
      return out && out.result !== undefined ? out.result : out;
    });
  }
  const wrapErr = (e) => { if (e instanceof TB.OkeyError) throw err(409, e.code, e.message); throw e; };

  r('GET', '/api/okey/lobby', auth, async (ctx) => {
    const act = await activeTable(Q, ctx.user.id);
    const invites = await Q("SELECT i.id, i.table_id, u.username from_name, t.code, t.mode, t.stake, t.rounds FROM slot.okey_invites i JOIN slot.okey_tables t ON t.id=i.table_id JOIN slot.users u ON u.id=i.from_id WHERE i.to_id=$1 AND t.status='waiting' AND i.created_at>$2 ORDER BY i.id DESC LIMIT 10", [ctx.user.id, now() - 15 * 60e3]);
    const online = await one(Q, "SELECT COUNT(DISTINCT p.user_id)::int players, COUNT(DISTINCT t.id)::int tables FROM slot.okey_players p JOIN slot.okey_tables t ON t.id=p.table_id WHERE p.active AND t.status IN ('waiting','playing','round_end') AND t.updated_at>$1", [now() - 5 * 60e3]);
    const waiting = await Q("SELECT variant, mode, stake, rounds, COUNT(*)::int n FROM slot.okey_tables WHERE status='waiting' AND NOT private AND updated_at>$1 GROUP BY 1,2,3,4", [now() - 60e3]);
    const stats = await one(Q, 'SELECT played, won, coins_won, best_score FROM slot.okey_stats WHERE user_id=$1', [ctx.user.id]);
    const left = act ? null : await one(Q, "SELECT t.id, t.status FROM slot.okey_players p JOIN slot.okey_tables t ON t.id=p.table_id WHERE p.user_id=$1 AND NOT p.active AND p.payout IS NULL AND t.status IN ('playing','round_end') AND t.updated_at>$2 ORDER BY t.id DESC LIMIT 1", [ctx.user.id, now() - LEFT_GRACE_MS]);
    return { stakes: STAKES, rounds: ROUNDS, chat: CHAT, active: act || null, rejoin: left || null, invites, online, waiting, stats: stats || { played: 0, won: 0, coins_won: 0 }, config: await okeyConfig() };
  });

  r('GET', '/api/admin/okey', A.admin, async () => ({ config: await okeyConfig(true), defaults: OKEY_DEFAULTS, stakesAll: STAKES, roundsAll: ROUNDS,
    tables: await Q("SELECT t.id, t.code, t.status, t.mode, t.stake, t.rounds, t.katlamali, t.private, t.created_at, t.updated_at, (SELECT COUNT(*)::int FROM slot.okey_players p WHERE p.table_id=t.id AND p.active) humans FROM slot.okey_tables t WHERE t.status IN ('waiting','playing','round_end') ORDER BY t.id DESC LIMIT 50"),
    summary: await Q("SELECT status, mode, COUNT(*)::int n FROM slot.okey_tables WHERE updated_at>$1 GROUP BY 1,2", [now() - 7 * 86400000]),
    players: await one(Q, "SELECT COUNT(DISTINCT user_id)::int played7d, COALESCE(SUM(payout),0)::bigint paid7d, COALESCE(SUM(paid),0)::bigint entries7d FROM slot.okey_players WHERE joined_at>$1", [now() - 7 * 86400000]) }));
  r('PUT', '/api/admin/okey', A.admin, async (ctx) => {
    const b = ctx.body || {}, c = { ...(await okeyConfig(true)) };
    if (b.enabled != null) c.enabled = !!b.enabled;
    if (Array.isArray(b.stakes)) { c.stakes = b.stakes.map(Number).filter(x => STAKES.includes(x)); if (!c.stakes.length) throw err(400, 'bad_stakes', 'En az bir masa açık olmalı.'); }
    if (Array.isArray(b.modes)) { c.modes = b.modes.filter(x => x === 'tekli' || x === 'esli'); if (!c.modes.length) throw err(400, 'bad_modes', 'En az bir oyun türü açık olmalı.'); }
    if (Array.isArray(b.rounds)) { c.rounds = b.rounds.map(Number).filter(x => ROUNDS.includes(x)); if (!c.rounds.length) throw err(400, 'bad_rounds', 'En az bir el seçeneği açık olmalı.'); }
    if (Array.isArray(b.katlamali)) { c.katlamali = [...new Set(b.katlamali.map(Boolean))]; if (!c.katlamali.length) throw err(400, 'bad_kat', 'Katlamalı/katlamasızdan en az biri açık olmalı.'); }
    if (b.turnSeconds != null) c.turnSeconds = int(b.turnSeconds, 'turnSeconds', 10, 120);
    if (b.botFillSeconds != null) c.botFillSeconds = int(b.botFillSeconds, 'botFillSeconds', 5, 300);
    if (b.botsAllowed != null) c.botsAllowed = !!b.botsAllowed;
    await A.setSetting('okey_config', c); await A.audit(Q, ctx, 'okey_config', null, c); ocfg = null;
    return { ok: true, config: c };
  });
  r('GET', '/api/okey/tables', auth, async (ctx) => {
    const vr = ctx.query.get('variant') === 'duz' ? 'duz' : '101';
    const rows = await Q("SELECT id, code, mode, stake, rounds, katlamali, private, state, updated_at FROM slot.okey_tables WHERE status='waiting' AND variant=$2 AND updated_at>$1 ORDER BY id DESC LIMIT 30", [now() - 10 * 60e3, vr]);
    return { tables: rows.filter(t => !t.private || !!JSON.parse(t.state).passHash).map(t => { const T = JSON.parse(t.state); return { id: t.id, code: t.private ? null : null, mode: t.mode, stake: Number(t.stake), rounds: t.rounds, katlamali: t.katlamali, private: t.private, locked: !!T.passHash,
      seats: T.seats.map(x => (x ? { name: x.name, bot: x.bot } : null)), filled: T.seats.filter(Boolean).length }; }) };
  });
  r('GET', '/api/okey/leaderboard', auth, async () => ({ top: await Q('SELECT u.username, u.avatar, s.played, s.won, s.coins_won FROM slot.okey_stats s JOIN slot.users u ON u.id=s.user_id ORDER BY s.won DESC, s.coins_won DESC LIMIT 20') }));

  r('POST', '/api/okey/quick', auth, async (ctx) => { const o = await parseOpts(ctx.body); return db.tx(async (q) => {
    limit(ctx, 'okq:' + ctx.user.id, 6, 10e3);
    const ex = await activeTable(q, ctx.user.id); if (ex) return { tableId: ex.id, existing: true };
    const u = await userLite(q, ctx.user.id);
    if (o.stake && !u.unlimited && u.balance < o.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    // aynı ayarlı, boş koltuklu, bekleyen genel masa
    const cand = await q("SELECT id FROM slot.okey_tables WHERE status='waiting' AND NOT private AND variant=$6 AND mode=$1 AND stake=$2 AND rounds=$3 AND katlamali=$4 AND updated_at>$5 ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED", [o.mode, o.stake, o.rounds, o.katlamali, now() - 60e3, o.variant]);
    for (const c of cand) {
      const row = await one(q, 'SELECT * FROM slot.okey_tables WHERE id=$1', [c.id]); const T = JSON.parse(row.state);
      if (T.status !== 'waiting' || !T.seats.some(x => !x)) continue;
      await seatUser(q, row.id, T, u);
      if (T.seats.every(Boolean)) TB.startRound(T, now());
      await save(q, row.id, T); return { tableId: row.id };
    }
    const T = TB.newTable(o, now());
    const row = await one(q, 'INSERT INTO slot.okey_tables(code,status,mode,stake,rounds,katlamali,private,owner_id,state,created_at,updated_at,variant) VALUES(NULL,$1,$2,$3,$4,$5,FALSE,$6,$7,$8,$8,$9) RETURNING id', ['waiting', o.mode, o.stake, o.rounds, o.katlamali, u.id, JSON.stringify(T), now(), o.variant]);
    await seatUser(q, row.id, T, u); await save(q, row.id, T);
    return { tableId: row.id };
  }); });;

  r('POST', '/api/okey/private', auth, async (ctx) => { const o = await parseOpts(ctx.body); return db.tx(async (q) => {
    limit(ctx, 'okp:' + ctx.user.id, 5, 30e3);
    const ex = await activeTable(q, ctx.user.id); if (ex) throw err(409, 'already_at_table', 'Zaten bir masadasın. Önce o masadan ayrıl.');
    const u = await userLite(q, ctx.user.id);
    if (o.stake && !u.unlimited && u.balance < o.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    const T = TB.newTable({ ...o, private: true }, now());
    let row; for (let i = 0; i < 5 && !row; i++) { const code = codeGen(); if (!(await one(q, 'SELECT 1 x FROM slot.okey_tables WHERE code=$1', [code]))) row = await one(q, 'INSERT INTO slot.okey_tables(code,status,mode,stake,rounds,katlamali,private,owner_id,state,created_at,updated_at,variant) VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9,$9,$10) RETURNING id, code', [code, 'waiting', o.mode, o.stake, o.rounds, o.katlamali, u.id, JSON.stringify(T), now(), o.variant]); }
    T.code = row.code; T.owner = u.id;
    if (ctx.body.password) { const pw = String(ctx.body.password).slice(0, 20); if (pw.length < 3) throw err(400, 'short_password', 'Masa şifresi en az 3 karakter olmalı.'); T.passHash = C.sha256('okey:' + row.code + ':' + pw); }
    await seatUser(q, row.id, T, u, 0); await save(q, row.id, T);
    return { tableId: row.id, code: row.code };
  }); });;

  r('POST', '/api/okey/join', auth, (ctx) => db.tx(async (q) => {
    limit(ctx, 'okj:' + ctx.user.id, 10, 30e3);
    const ex = await activeTable(q, ctx.user.id);
    const row = ctx.body.code ? await one(q, 'SELECT * FROM slot.okey_tables WHERE code=$1 FOR UPDATE', [str(ctx.body.code, 'code', 8).toUpperCase()]) : await one(q, 'SELECT * FROM slot.okey_tables WHERE id=$1 FOR UPDATE', [int(ctx.body.tableId, 'tableId', 1)]);
    if (!row) throw err(404, 'no_table', 'Bu kodla masa bulunamadı.');
    if (ex && ex.id === row.id) return { tableId: row.id };
    { // ayrıldığı/bağlantısı koptuğu masaya geri dönüş
      const T0 = JSON.parse(row.state); const mine = T0.seats.findIndex(x => x && x.uid === ctx.user.id);
      if (mine >= 0 && T0.status !== 'waiting') {
        if (ex) throw err(409, 'already_at_table', 'Zaten başka bir masadasın.');
        if (T0.allLeftAt && now() - T0.allLeftAt > LEFT_GRACE_MS) { T0.status = 'abandoned'; await save(q, row.id, T0); throw err(409, 'table_over', 'Bu masa kapandı.'); }
        T0.allLeftAt = null;
        try { TB.rejoin(T0, ctx.user.id); } catch (e) { wrapErr(e); }
        await save(q, row.id, T0); await q('UPDATE slot.okey_players SET active=TRUE WHERE table_id=$1 AND user_id=$2', [row.id, ctx.user.id]);
        return { tableId: row.id, rejoined: true };
      }
    }
    if (ex) throw err(409, 'already_at_table', 'Zaten bir masadasın. Önce o masadan ayrıl.');
    const T = JSON.parse(row.state); if (T.status !== 'waiting') throw err(409, 'table_started', 'Bu masada oyun başladı.');
    const invited = !!(await one(q, 'SELECT 1 x FROM slot.okey_invites WHERE table_id=$1 AND to_id=$2', [row.id, ctx.user.id]));
    // şifresiz özel masa yalnızca kodla ya da davetle açılır; listeden kimliğiyle girilemez
    if (T.cfg.private && !T.passHash && !ctx.body.code && !invited) throw err(403, 'private_table', 'Bu özel masaya yalnızca davet ya da masa koduyla girilebilir.');
    if (T.passHash && !invited && C.sha256('okey:' + T.code + ':' + String(ctx.body.password || '')) !== T.passHash) throw err(403, 'bad_password', ctx.body.password ? 'Masa şifresi yanlış.' : 'Bu masa şifreli. Şifreyi gir.');
    const u = await userLite(q, ctx.user.id);
    if (T.cfg.stake && !u.unlimited && u.balance < T.cfg.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    try { await seatUser(q, row.id, T, u, ctx.body.seat != null ? int(ctx.body.seat, 'seat', 0, 3) : null); } catch (e) { wrapErr(e); }
    if (T.seats.every(Boolean)) TB.startRound(T, now());
    await save(q, row.id, T); await q('DELETE FROM slot.okey_invites WHERE table_id=$1 AND to_id=$2', [row.id, u.id]);
    return { tableId: row.id };
  }));

  r('POST', '/api/okey/:id/invite', auth, async (ctx) => {
    limit(ctx, 'oki:' + ctx.user.id, 10, 60e3);
    const id = int(ctx.params.id, 'id', 1), to = int(ctx.body.friendId, 'friendId', 1);
    const row = await one(Q, 'SELECT state FROM slot.okey_tables WHERE id=$1', [id]); if (!row) throw err(404, 'no_table');
    const T = JSON.parse(row.state); if (seatOf(T, ctx.user.id) < 0) throw err(403, 'not_seated', 'Masada değilsin.');
    if (T.status !== 'waiting') throw err(409, 'table_started', 'Oyun başladı.');
    if (!(await one(Q, "SELECT 1 x FROM slot.friends WHERE user_id=$1 AND friend_id=$2 AND status='accepted'", [ctx.user.id, to]))) throw err(403, 'not_friends', 'Sadece arkadaşlarını davet edebilirsin.');
    await Q('INSERT INTO slot.okey_invites(table_id,from_id,to_id,created_at) VALUES($1,$2,$3,$4)', [id, ctx.user.id, to, now()]);
    if (A.notify) await A.notify(Q, to, 'okey_invite', `🀄 ${ctx.user.username} seni 101 Okey masasına çağırıyor`, T.code ? `Masa kodu: ${T.code}` : 'Lobideki davetlerden katılabilirsin.', { tableId: id, code: T.code || null });
    return { ok: true };
  });

  r('POST', '/api/okey/:id/seat', auth, async (ctx) => withTable(int(ctx.params.id, 'id', 1), async (T, q, row) => {
    const s = seatOf(T, ctx.user.id); if (s < 0) throw err(403, 'not_seated');
    if (T.status !== 'waiting') throw err(409, 'table_started', 'Oyun başladı.');
    const to = int(ctx.body.seat, 'seat', 0, 3); if (T.seats[to]) throw err(409, 'seat_taken', 'Bu koltuk dolu.');
    T.seats[to] = T.seats[s]; T.seats[s] = null; T.seq++;
    await q('UPDATE slot.okey_players SET seat=$1 WHERE table_id=$2 AND user_id=$3', [to, row.id, ctx.user.id]);
    return { changed: true, result: { seat: to } };
  }));

  r('POST', '/api/okey/:id/start', auth, async (ctx) => withTable(int(ctx.params.id, 'id', 1), async (T) => {
    if (seatOf(T, ctx.user.id) < 0) throw err(403, 'not_seated');
    if (T.status !== 'waiting') return { result: { ok: true } };
    if (T.cfg.private && T.owner !== ctx.user.id) throw err(403, 'not_owner', 'Oyunu masa sahibi başlatır.');
    if (T.cfg.bots === false && T.seats.some(x => !x)) throw err(409, 'need_players', 'Bu masada bot yok: 4 oyuncu tamamlanınca başlar.');
    TB.fillBots(T); TB.startRound(T, now());
    return { changed: true, result: { ok: true } };
  }));

  r('POST', '/api/okey/:id/leave', auth, async (ctx) => {
    const id = int(ctx.params.id, 'id', 1);
    return withTable(id, async (T, q, row) => {
      const s = seatOf(T, ctx.user.id); if (s < 0) { await q('UPDATE slot.okey_players SET active=FALSE WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]); return { result: { ok: true } }; }
      if (T.status === 'waiting') {
        T.seats[s] = null; T.seq++;
        if (T.cfg.stake) await applyCoins(q, ctx.user.id, T.cfg.stake, 'okey_refund', id);
        await q('DELETE FROM slot.okey_players WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]);
        if (!T.seats.some(x => x && !x.bot)) { T.status = 'abandoned'; }
        else if (T.cfg.private && T.owner === ctx.user.id) T.owner = T.seats.find(x => x && !x.bot).uid;
        return { changed: true, result: { ok: true, refunded: T.cfg.stake } };
      }
      if (T.status === 'finished') { await q('UPDATE slot.okey_players SET active=FALSE WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]); return { result: { ok: true } }; }
      T.seats[s].left = true; T.seats[s].away = true; T.seq++;
      if (T.status === 'playing' && T.hand.turn === s) T.botAt = now() + 800;
      await q('UPDATE slot.okey_players SET active=FALSE WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]);
      // son gerçek oyuncu da ayrıldıysa masa 15 dk bekler (geri dönebilsin), sonra kapanır
      if (!T.seats.some(x => x && !x.bot && !x.left)) T.allLeftAt = now();
      return { changed: true, result: { ok: true } };
    });
  });

  r('GET', '/api/okey/:id', authLite, async (ctx) => {
    const id = int(ctx.params.id, 'id', 1), t = now();
    const row = await one(Q, 'SELECT state FROM slot.okey_tables WHERE id=$1', [id]); if (!row) throw err(404, 'no_table', 'Masa bulunamadı.');
    let T = JSON.parse(row.state);
    const since = ctx.query.get('seq');
    if (needsTick(T, t) || (T.status === 'finished' && !T.settled)) T = await withTable(id, async (TT) => ({ result: TT }));
    const me = seatOf(T, ctx.user.id);
    if (since != null && Number(since) === T.seq && me >= 0) return { same: true, seq: T.seq, now: t, deadline: T.deadline };
    const v = TB.view(T, me >= 0 ? me : null, t); v.id = id; v.code = T.cfg.private ? T.code : null; v.owner = T.owner === ctx.user.id;
    v.payouts = T.payouts || null; v.locked = !!T.passHash; v.xpGain = T.xpGain || null; v.chat = (T.chat || []).slice(-8);
    return v;
  });

  r('POST', '/api/okey/:id/act', auth, async (ctx) => {
    limit(ctx, 'oka:' + ctx.user.id, 25, 5000);
    const id = int(ctx.params.id, 'id', 1), b = ctx.body || {};
    const type = str(b.type, 'type', 12); if (!ALLOWED.has(type)) throw err(400, 'bad_action', 'Geçersiz hamle.');
    const a = { type };
    if (b.tile != null) a.tile = int(b.tile, 'tile', 0, 105);
    if (b.meld != null) a.meld = int(b.meld, 'meld', 1);
    if (b.index != null) a.index = int(b.index, 'index', 0, 13);
    if (b.side === 'L' || b.side === 'R') a.side = b.side;
    if (b.route === 'pairs' || b.route === 'points') a.route = b.route;
    if (b.hint === 'run' || b.hint === 'set' || b.hint === 'pair') a.hint = b.hint;
    const ids = (g) => { if (!Array.isArray(g) || g.length < 2 || g.length > 13) throw err(400, 'bad_group', 'Geçersiz grup.'); return g.map(x => int(x, 'tile', 0, 105)); };
    if (b.group) a.group = ids(b.group);
    if (b.groups) { if (!Array.isArray(b.groups) || b.groups.length > 20) throw err(400, 'bad_groups'); a.groups = b.groups.map(ids); }
    return withTable(id, async (T) => {
      const s = seatOf(T, ctx.user.id); if (s < 0) throw err(403, 'not_seated', 'Bu masada değilsin.');
      if (T.seats[s].left) throw err(409, 'left', 'Masadan ayrıldın.');
      let res; try { res = TB.act(T, s, a, now()); } catch (e) { wrapErr(e); }
      return { changed: true, result: { ok: true, ...res, seq: T.seq } };
    });
  });

  r('POST', '/api/okey/:id/chat', auth, async (ctx) => {
    limit(ctx, 'okc:' + ctx.user.id, 4, 10e3);
    const id = int(ctx.params.id, 'id', 1), k = int(ctx.body.msg, 'msg', 0, CHAT.length - 1);
    return withTable(id, async (T) => {
      const s = seatOf(T, ctx.user.id); if (s < 0) throw err(403, 'not_seated');
      T.chat = (T.chat || []).concat({ s, m: k, at: now() }).slice(-20); T.seq++;
      return { changed: true, result: { ok: true } };
    });
  });

}
