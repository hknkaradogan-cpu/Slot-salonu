// Tavla çevrim içi masalar: hızlı eşleşme (gerçek rakip, 15 sn sonra bot), özel masa (6 haneli kod, isteğe bağlı şifre, davet),
// sanal jeton girişli veya ücretsiz masalar. Durum veritabanında; her istekte "tembel" ilerletme.
import * as TB from './table.js';

export const TAVLA_STAKES = [0, 1000, 10000, 100000, 1000000];
export const TAVLA_POINTS = [1, 3, 5];
const LEFT_GRACE_MS = 15 * 60e3;
export function registerTavla(A) {
  const { r, auth, db, Q, one, applyCoins, err, int, str, now, limit, C } = A; const authLite = A.authLite || auth;
  const codeGen = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const b = new Uint8Array(6); crypto.getRandomValues(b); for (let i = 0; i < 6; i++) s += a[b[i] % a.length]; return s; };
  const seatOf = (T, uid) => T.seats.findIndex(x => x && x.uid === uid);
  async function cfg() { const v = A.setting ? await A.setting('tavla_config') : null; return { enabled: true, botsAllowed: true, turnSeconds: 40, ...(v || {}) }; }
  async function parseOpts(b) {
    const c = await cfg(); if (!c.enabled) throw err(503, 'tavla_disabled', 'Tavla şu anda bakımda.');
    const stake = int(b.stake ?? 0, 'stake', 0); if (!TAVLA_STAKES.includes(stake)) throw err(400, 'bad_stake', 'Geçersiz masa.');
    const points = int(b.points ?? 1, 'points', 1); if (!TAVLA_POINTS.includes(points)) throw err(400, 'bad_points', 'Geçersiz oyun sayısı.');
    return { stake, points, bots: c.botsAllowed, turnMs: c.turnSeconds * 1000 };
  }
  const activeTable = (q, uid) => one(q, "SELECT t.id, t.status FROM slot.tavla_players p JOIN slot.tavla_tables t ON t.id=p.table_id WHERE p.user_id=$1 AND p.active AND t.status IN ('waiting','playing','game_end') ORDER BY t.id DESC LIMIT 1", [uid]);
  const save = (q, id, T) => q('UPDATE slot.tavla_tables SET state=$1, status=$2, updated_at=$3 WHERE id=$4', [JSON.stringify(T), T.status, now(), id]);
  async function userLite(q, uid) { const u = await one(q, 'SELECT id, username, avatar, xp, balance, unlimited FROM slot.users WHERE id=$1 FOR UPDATE', [uid]); u.level = C.levelFromXp(u.xp); return u; }
  async function seatUser(q, id, T, u, seat) {
    const s = TB.seatHuman(T, u, seat);
    if (T.cfg.stake) await applyCoins(q, u.id, -T.cfg.stake, 'tavla_entry', id);
    await q('INSERT INTO slot.tavla_players(table_id,user_id,seat,active,paid,joined_at) VALUES($1,$2,$3,TRUE,$4,$5) ON CONFLICT (table_id,user_id) DO UPDATE SET seat=EXCLUDED.seat, active=TRUE, paid=EXCLUDED.paid', [id, u.id, s, T.cfg.stake, now()]);
    return s;
  }
  async function settle(q, row, T) {
    if (T.status !== 'finished' || T.settled) return; T.settled = true;
    const players = await q('SELECT user_id, seat FROM slot.tavla_players WHERE table_id=$1', [row.id]);
    T.payouts = [0, 0]; T.xpGain = [0, 0];
    for (const p of players) {
      const x = T.seats[p.seat]; if (!x || x.uid !== p.user_id) continue;
      const won = T.final.winner === p.seat, coins = won && !x.left ? T.cfg.stake * 2 : 0, xp = won ? 200 + 60 * (T.cfg.points - 1) : 50;
      if (coins) await applyCoins(q, p.user_id, coins, 'tavla_win', row.id);
      const u = await one(q, 'SELECT xp FROM slot.users WHERE id=$1 FOR UPDATE', [p.user_id]); const nx = Math.min(C.XP_MAX, u.xp + xp);
      await q('UPDATE slot.users SET xp=$1, level=$2 WHERE id=$3', [nx, C.levelFromXp(nx), p.user_id]);
      await q('INSERT INTO slot.tavla_stats(user_id,played,won,coins_won,mars) VALUES($1,1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET played=slot.tavla_stats.played+1, won=slot.tavla_stats.won+EXCLUDED.won, coins_won=slot.tavla_stats.coins_won+EXCLUDED.coins_won, mars=slot.tavla_stats.mars+EXCLUDED.mars', [p.user_id, won ? 1 : 0, coins, won && T.result && T.result.mars ? 1 : 0]);
      await q('UPDATE slot.tavla_players SET payout=$1, active=FALSE WHERE table_id=$2 AND user_id=$3', [coins, row.id, p.user_id]);
      if (A.hooks && A.hooks.onTavla) await A.hooks.onTavla(q, p.user_id, { won });
      T.payouts[p.seat] = coins; T.xpGain[p.seat] = xp;
    }
  }
  async function withTable(id, fn) {
    return db.tx(async (q) => {
      const row = await one(q, 'SELECT * FROM slot.tavla_tables WHERE id=$1 FOR UPDATE', [id]); if (!row) throw err(404, 'no_table', 'Masa bulunamadı.');
      const T = JSON.parse(row.state); const v0 = T.seq, st0 = T.status;
      if (T.allLeftAt && now() - T.allLeftAt > LEFT_GRACE_MS && T.status !== 'finished') T.status = 'abandoned';
      let changed = T.status === 'abandoned' ? false : TB.tick(T, now());
      const out = await fn(T, q, row);
      if (out && out.changed) changed = true; if (T.seq !== v0 || T.status !== st0) changed = true;
      if (T.status === 'finished' && !T.settled) { await settle(q, row, T); changed = true; }
      if (changed) await save(q, id, T);
      return out && out.result !== undefined ? out.result : out;
    });
  }
  const wrap = (e) => { if (e instanceof TB.TavlaError) throw err(409, e.code, e.message); throw e; };

  r('GET', '/api/tavla/lobby', auth, async (ctx) => {
    const act = await activeTable(Q, ctx.user.id);
    const left = act ? null : await one(Q, "SELECT t.id FROM slot.tavla_players p JOIN slot.tavla_tables t ON t.id=p.table_id WHERE p.user_id=$1 AND NOT p.active AND p.payout IS NULL AND t.status IN ('playing','game_end') AND t.updated_at>$2 ORDER BY t.id DESC LIMIT 1", [ctx.user.id, now() - LEFT_GRACE_MS]);
    const waiting = await Q("SELECT stake, COUNT(*)::int n FROM slot.tavla_tables WHERE status='waiting' AND NOT private AND updated_at>$1 GROUP BY 1", [now() - 60e3]);
    const online = await one(Q, "SELECT COUNT(DISTINCT p.user_id)::int players FROM slot.tavla_players p JOIN slot.tavla_tables t ON t.id=p.table_id WHERE p.active AND t.status IN ('waiting','playing','game_end') AND t.updated_at>$1", [now() - 5 * 60e3]);
    const stats = await one(Q, 'SELECT played, won, coins_won, mars FROM slot.tavla_stats WHERE user_id=$1', [ctx.user.id]);
    return { stakes: TAVLA_STAKES, points: TAVLA_POINTS, active: act || null, rejoin: left || null, waiting, online, stats: stats || { played: 0, won: 0, coins_won: 0, mars: 0 }, config: await cfg() };
  });
  r('GET', '/api/admin/tavla', A.admin, async () => ({ config: await cfg(),
    summary: await Q("SELECT status, COUNT(*)::int n FROM slot.tavla_tables WHERE updated_at>$1 GROUP BY 1", [now() - 7 * 86400e3]),
    players: await one(Q, "SELECT COUNT(DISTINCT user_id)::int played7d, COALESCE(SUM(payout),0)::bigint paid7d, COALESCE(SUM(paid),0)::bigint entries7d FROM slot.tavla_players WHERE joined_at>$1", [now() - 7 * 86400e3]),
    tables: await Q("SELECT id, code, status, stake, private, updated_at FROM slot.tavla_tables WHERE status IN ('waiting','playing','game_end') ORDER BY id DESC LIMIT 30") }));
  r('PUT', '/api/admin/tavla', A.admin, async (ctx) => {
    const b = ctx.body || {}, c = await cfg();
    if (b.enabled != null) c.enabled = !!b.enabled; if (b.botsAllowed != null) c.botsAllowed = !!b.botsAllowed; if (b.turnSeconds != null) c.turnSeconds = int(b.turnSeconds, 'turnSeconds', 15, 120);
    await A.setSetting('tavla_config', c); await A.audit(Q, ctx, 'tavla_config', null, c); return { ok: true, config: c };
  });
  r('GET', '/api/tavla/tables', auth, async () => {
    const rows = await Q("SELECT id, stake, private, state FROM slot.tavla_tables WHERE status='waiting' AND updated_at>$1 ORDER BY id DESC LIMIT 30", [now() - 10 * 60e3]);
    return { tables: rows.filter(t => !t.private || !!JSON.parse(t.state).passHash).map(t => { const T = JSON.parse(t.state); return { id: t.id, stake: Number(t.stake), points: T.cfg.points, private: t.private, locked: !!T.passHash, seats: T.seats.map(x => (x ? { name: x.name } : null)), filled: T.seats.filter(Boolean).length }; }) };
  });
  r('POST', '/api/tavla/quick', auth, async (ctx) => { const o = await parseOpts(ctx.body || {}); return db.tx(async (q) => {
    limit(ctx, 'tvq:' + ctx.user.id, 6, 10e3);
    const ex = await activeTable(q, ctx.user.id); if (ex) return { tableId: ex.id, existing: true };
    const u = await userLite(q, ctx.user.id); if (o.stake && !u.unlimited && u.balance < o.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    const cand = await q("SELECT id, state FROM slot.tavla_tables WHERE status='waiting' AND NOT private AND stake=$1 AND updated_at>$2 ORDER BY id LIMIT 5 FOR UPDATE SKIP LOCKED", [o.stake, now() - 60e3]);
    for (const c of cand) { const T = JSON.parse(c.state); if (T.cfg.points !== o.points || T.status !== 'waiting' || !T.seats.some(x => !x)) continue; await seatUser(q, c.id, T, u); if (T.seats.every(Boolean)) TB.startGame(T, now()); await save(q, c.id, T); return { tableId: c.id }; }
    const T = TB.newTable(o, now());
    const row = await one(q, 'INSERT INTO slot.tavla_tables(code,status,stake,private,owner_id,state,created_at,updated_at) VALUES(NULL,$1,$2,FALSE,$3,$4,$5,$5) RETURNING id', ['waiting', o.stake, u.id, JSON.stringify(T), now()]);
    await seatUser(q, row.id, T, u); await save(q, row.id, T); return { tableId: row.id };
  }); });
  r('POST', '/api/tavla/private', auth, async (ctx) => { const o = await parseOpts(ctx.body || {}); return db.tx(async (q) => {
    limit(ctx, 'tvp:' + ctx.user.id, 5, 30e3);
    if (await activeTable(q, ctx.user.id)) throw err(409, 'already_at_table', 'Zaten bir tavla masasındasın. Önce o masadan ayrıl.');
    const u = await userLite(q, ctx.user.id); if (o.stake && !u.unlimited && u.balance < o.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    const T = TB.newTable({ ...o, private: true }, now()); let row;
    for (let i = 0; i < 6 && !row; i++) { const code = codeGen(); if (!(await one(q, 'SELECT 1 x FROM slot.tavla_tables WHERE code=$1', [code]))) row = await one(q, 'INSERT INTO slot.tavla_tables(code,status,stake,private,owner_id,state,created_at,updated_at) VALUES($1,$2,$3,TRUE,$4,$5,$6,$6) RETURNING id, code', [code, 'waiting', o.stake, u.id, JSON.stringify(T), now()]); }
    T.code = row.code; T.owner = u.id;
    if (ctx.body.password) { const pw = String(ctx.body.password).slice(0, 20); if (pw.length < 3) throw err(400, 'short_password', 'Masa şifresi en az 3 karakter olmalı.'); T.passHash = C.sha256('tavla:' + row.code + ':' + pw); }
    await seatUser(q, row.id, T, u, 0); await save(q, row.id, T); return { tableId: row.id, code: row.code };
  }); });
  r('POST', '/api/tavla/join', auth, (ctx) => db.tx(async (q) => {
    limit(ctx, 'tvj:' + ctx.user.id, 10, 30e3);
    const ex = await activeTable(q, ctx.user.id);
    const row = ctx.body.code ? await one(q, 'SELECT * FROM slot.tavla_tables WHERE code=$1 FOR UPDATE', [str(ctx.body.code, 'code', 8).toUpperCase()]) : await one(q, 'SELECT * FROM slot.tavla_tables WHERE id=$1 FOR UPDATE', [int(ctx.body.tableId, 'tableId', 1)]);
    if (!row) throw err(404, 'no_table', 'Bu kodla tavla masası bulunamadı.');
    if (ex && ex.id === row.id) return { tableId: row.id };
    const T = JSON.parse(row.state); const mine = seatOf(T, ctx.user.id);
    if (mine >= 0 && T.status !== 'waiting') {
      if (ex) throw err(409, 'already_at_table', 'Zaten başka bir masadasın.');
      if (T.allLeftAt && now() - T.allLeftAt > LEFT_GRACE_MS) throw err(409, 'table_over', 'Bu masa kapandı.');
      T.allLeftAt = null; try { TB.rejoin(T, ctx.user.id); } catch (e) { wrap(e); }
      await save(q, row.id, T); await q('UPDATE slot.tavla_players SET active=TRUE WHERE table_id=$1 AND user_id=$2', [row.id, ctx.user.id]); return { tableId: row.id, rejoined: true };
    }
    if (ex) throw err(409, 'already_at_table', 'Zaten bir masadasın. Önce o masadan ayrıl.');
    if (T.status !== 'waiting') throw err(409, 'table_started', 'Bu masada oyun başladı.');
    const invited = !!(await one(q, 'SELECT 1 x FROM slot.tavla_invites WHERE table_id=$1 AND to_id=$2', [row.id, ctx.user.id]));
    if (T.cfg.private && !T.passHash && !ctx.body.code && !invited) throw err(403, 'private_table', 'Bu özel masaya yalnızca davet ya da masa koduyla girilebilir.');
    if (T.passHash && !invited && C.sha256('tavla:' + T.code + ':' + String(ctx.body.password || '')) !== T.passHash) throw err(403, 'bad_password', ctx.body.password ? 'Masa şifresi yanlış.' : 'Bu masa şifreli. Şifreyi gir.');
    const u = await userLite(q, ctx.user.id); if (T.cfg.stake && !u.unlimited && u.balance < T.cfg.stake) throw err(402, 'insufficient_funds', 'Bu masa için yeterli jetonun yok.');
    try { await seatUser(q, row.id, T, u); } catch (e) { wrap(e); }
    if (T.seats.every(Boolean)) TB.startGame(T, now());
    await save(q, row.id, T); await q('DELETE FROM slot.tavla_invites WHERE table_id=$1 AND to_id=$2', [row.id, u.id]); return { tableId: row.id };
  }));
  r('POST', '/api/tavla/:id/invite', auth, async (ctx) => {
    limit(ctx, 'tvi:' + ctx.user.id, 10, 60e3);
    const id = int(ctx.params.id, 'id', 1), to = int(ctx.body.friendId, 'friendId', 1);
    const row = await one(Q, 'SELECT state FROM slot.tavla_tables WHERE id=$1', [id]); if (!row) throw err(404, 'no_table');
    const T = JSON.parse(row.state); if (seatOf(T, ctx.user.id) < 0) throw err(403, 'not_seated', 'Masada değilsin.'); if (T.status !== 'waiting') throw err(409, 'table_started', 'Oyun başladı.');
    if (!(await one(Q, "SELECT 1 x FROM slot.friends WHERE user_id=$1 AND friend_id=$2 AND status='accepted'", [ctx.user.id, to]))) throw err(403, 'not_friends', 'Sadece arkadaşlarını davet edebilirsin.');
    await Q('INSERT INTO slot.tavla_invites(table_id,from_id,to_id,created_at) VALUES($1,$2,$3,$4)', [id, ctx.user.id, to, now()]);
    if (A.notify) await A.notify(Q, to, 'tavla_invite', `🎲 ${ctx.user.username} seni tavla masasına çağırıyor`, T.code ? `Masa kodu: ${T.code}` : 'Tavla lobisinden katılabilirsin.', { tableId: id, code: T.code || null, game: 'tavla' });
    return { ok: true };
  });
  r('POST', '/api/tavla/:id/start', auth, async (ctx) => withTable(int(ctx.params.id, 'id', 1), async (T) => {
    if (seatOf(T, ctx.user.id) < 0) throw err(403, 'not_seated'); if (T.status !== 'waiting') return { result: { ok: true } };
    if (T.cfg.private && T.owner !== ctx.user.id) throw err(403, 'not_owner', 'Oyunu masa sahibi başlatır.');
    if (T.cfg.bots === false && T.seats.some(x => !x)) throw err(409, 'need_players', 'Bu masada bot yok.');
    TB.fillBots(T); TB.startGame(T, now()); return { changed: true, result: { ok: true } };
  }));
  r('POST', '/api/tavla/:id/leave', auth, async (ctx) => { const id = int(ctx.params.id, 'id', 1); return withTable(id, async (T, q) => {
    const s = seatOf(T, ctx.user.id); if (s < 0) return { result: { ok: true } };
    if (T.status === 'waiting') {
      T.seats[s] = null; T.seq++; if (T.cfg.stake) await applyCoins(q, ctx.user.id, T.cfg.stake, 'tavla_refund', id);
      await q('DELETE FROM slot.tavla_players WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]);
      if (!T.seats.some(x => x && !x.bot)) T.status = 'abandoned'; else if (T.cfg.private && T.owner === ctx.user.id) T.owner = T.seats.find(x => x && !x.bot).uid;
      return { changed: true, result: { ok: true, refunded: T.cfg.stake } };
    }
    if (T.status === 'finished') { await q('UPDATE slot.tavla_players SET active=FALSE WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]); return { result: { ok: true } }; }
    T.seats[s].left = true; T.seats[s].away = true; T.seq++; if (T.status === 'playing' && T.turn === s) T.botAt = now() + 800;
    await q('UPDATE slot.tavla_players SET active=FALSE WHERE table_id=$1 AND user_id=$2', [id, ctx.user.id]);
    if (!T.seats.some(x => x && !x.bot && !x.left)) T.allLeftAt = now();
    return { changed: true, result: { ok: true } };
  }); });
  r('GET', '/api/tavla/:id', authLite, async (ctx) => {
    const id = int(ctx.params.id, 'id', 1), t = now();
    const row = await one(Q, 'SELECT state FROM slot.tavla_tables WHERE id=$1', [id]); if (!row) throw err(404, 'no_table', 'Masa bulunamadı.');
    let T = JSON.parse(row.state);
    if (TB.needsTick(T, t) || (T.status === 'finished' && !T.settled)) T = await withTable(id, async (TT) => ({ result: TT }));
    const me = seatOf(T, ctx.user.id), since = ctx.query.get('seq');
    if (since != null && Number(since) === T.seq && me >= 0) return { same: true, seq: T.seq, now: t, deadline: T.deadline };
    const v = TB.view(T, me >= 0 ? me : null, t); v.id = id; v.code = T.cfg.private ? T.code : null; v.owner = T.owner === ctx.user.id; v.locked = !!T.passHash; v.payouts = T.payouts || null; v.xpGain = T.xpGain || null;
    return v;
  });
  r('POST', '/api/tavla/:id/act', auth, async (ctx) => {
    limit(ctx, 'tva:' + ctx.user.id, 20, 5000);
    const id = int(ctx.params.id, 'id', 1), b = ctx.body || {}, type = str(b.type, 'type', 8);
    if (type !== 'roll' && type !== 'move') throw err(400, 'bad_action', 'Geçersiz hamle.');
    const a = { type };
    if (type === 'move') { if (!Array.isArray(b.moves) || b.moves.length > 4) throw err(400, 'bad_moves', 'Geçersiz hamle.'); a.moves = b.moves.map(m => [int(m[0], 'from', 0, 25), int(m[1], 'to', 0, 24)]); }
    return withTable(id, async (T) => {
      const s = seatOf(T, ctx.user.id); if (s < 0) throw err(403, 'not_seated', 'Bu masada değilsin.'); if (T.seats[s].left) throw err(409, 'left', 'Masadan ayrıldın.');
      let res; try { res = TB.act(T, s, a, now()); } catch (e) { wrap(e); }
      return { changed: true, result: { ok: true, ...res, seq: T.seq } };
    });
  });
}
