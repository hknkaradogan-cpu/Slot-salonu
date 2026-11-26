// Platform özellikleri: bilet, başarımlar, Şans Çarkı, Bulmaca, turnuvalar, mesajlar, canlı sohbet, bildirimler,
// çevrim içi arkadaşlar, arkadaş daveti (referans), son kazananlar, oyuncu istatistikleri ve yönetici hediye/turnuva yönetimi.
// Bütün ödüller sanal jeton/bilettir; nakde çevrilemez.
import { randomInt } from 'node:crypto';

const TZ_MS = 3 * 3600e3; // Türkiye saati (UTC+3)
const DAY = 86400e3;

/* ---------------- Başarımlar ---------------- */
export const ACHIEVEMENTS = [
  { id: 'spin10', name: 'İlk Adım', desc: '10 slot turu çevir', metric: 'spins', goal: 10, coins: 2000, tickets: 1 },
  { id: 'spin100', name: 'Çarkların Efendisi', desc: '100 slot turu çevir', metric: 'spins', goal: 100, coins: 10000, tickets: 2 },
  { id: 'spin1000', name: 'Salonun Demirbaşı', desc: '1.000 slot turu çevir', metric: 'spins', goal: 1000, coins: 50000, tickets: 5 },
  { id: 'big1', name: 'Büyük Vurgun', desc: 'Bahsinin 20 katı veya fazlasını kazan', metric: 'bigwins', goal: 1, coins: 5000, tickets: 1 },
  { id: 'big10', name: 'Şimşek Avcısı', desc: '10 kez 20x üstü kazan', metric: 'bigwins', goal: 10, coins: 25000, tickets: 3 },
  { id: 'games7', name: 'Kaşif', desc: '7 slot oyununun hepsini oyna', metric: 'gamesPlayed', goal: 7, coins: 15000, tickets: 2 },
  { id: 'okey1', name: 'Masaya Hoş Geldin', desc: '1 tane 101 Okey oyunu bitir', metric: 'okeyPlayed', goal: 1, coins: 3000, tickets: 1 },
  { id: 'okeyw1', name: 'Okey Ustası', desc: '101 Okey oyunu kazan', metric: 'okeyWon', goal: 1, coins: 10000, tickets: 2 },
  { id: 'okeyw10', name: 'Masaların Kralı', desc: '10 kez 101 Okey kazan', metric: 'okeyWon', goal: 10, coins: 50000, tickets: 5 },
  { id: 'lvl10', name: 'Yükselen Yıldız', desc: '10. seviyeye ulaş', metric: 'level', goal: 10, coins: 10000, tickets: 2 },
  { id: 'lvl50', name: 'Efsane', desc: '50. seviyeye ulaş', metric: 'level', goal: 50, coins: 100000, tickets: 10 },
  { id: 'friend1', name: 'Sosyal Kelebek', desc: '1 arkadaş edin', metric: 'friends', goal: 1, coins: 2000, tickets: 1 },
  { id: 'friend5', name: 'Kalabalık Masa', desc: '5 arkadaş edin', metric: 'friends', goal: 5, coins: 10000, tickets: 2 },
  { id: 'puzzle1', name: 'Bulmaca Çözücü', desc: '1 bulmaca çöz', metric: 'puzzles', goal: 1, coins: 2000, tickets: 1 },
  { id: 'puzzle10', name: 'Dahi', desc: '10 bulmaca çöz', metric: 'puzzles', goal: 10, coins: 15000, tickets: 2 },
  { id: 'wheel5', name: 'Çarkıfelek', desc: 'Şans Çarkını 5 kez çevir', metric: 'wheelSpins', goal: 5, coins: 3000, tickets: 1 },
  { id: 'tour1', name: 'Turnuvacı', desc: 'Bir turnuvaya katıl', metric: 'tournaments', goal: 1, coins: 3000, tickets: 1 },
];

/* ---------------- Şans Çarkı ---------------- */
// Ağırlıklar sunucuda; sonuç kriptografik RNG ile belirlenir. Beklenen değer ~4.300 jeton + 0,27 bilet.
export const WHEEL = [
  { label: '1.000', coins: 1000, w: 22 }, { label: '2.500', coins: 2500, w: 18 }, { label: '1 Bilet', tickets: 1, w: 12 },
  { label: '5.000', coins: 5000, w: 14 }, { label: '1.500', coins: 1500, w: 18 }, { label: '10.000', coins: 10000, w: 7 },
  { label: '3 Bilet', tickets: 3, w: 4 }, { label: '25.000', coins: 25000, w: 3 }, { label: '2.000', coins: 2000, w: 16 },
  { label: '50.000', coins: 50000, w: 1 },
];

/* ---------------- Bulmaca (kaydırmalı) ---------------- */
const PUZZLE_REWARD = { 3: 2000, 4: 6000 }, PUZZLE_DAILY = 5;
function puzzleNeighbors(empty, n) { const r = Math.floor(empty / n), c = empty % n, out = []; if (r > 0) out.push(empty - n); if (r < n - 1) out.push(empty + n); if (c > 0) out.push(empty - 1); if (c < n - 1) out.push(empty + 1); return out; }
export function puzzleShuffle(n, steps) {
  const b = Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n)); let e = n * n - 1, prev = -1;
  for (let i = 0; i < steps; i++) { const nb = puzzleNeighbors(e, n).filter(x => x !== prev); const k = nb[randomInt(nb.length)]; b[e] = b[k]; b[k] = 0; prev = e; e = k; }
  if (b.every((v, i) => v === (i + 1) % (n * n))) return puzzleShuffle(n, steps);
  return b;
}
/** Hamleleri sunucuda baştan oynatır: her hamle boşluğa komşu bir taşın konumu olmalı. */
export function puzzleReplay(start, n, moves) {
  const b = start.slice(); let e = b.indexOf(0);
  for (const m of moves) { if (!Number.isInteger(m) || !puzzleNeighbors(e, n).includes(m)) return null; b[e] = b[m]; b[m] = 0; e = m; }
  return b;
}

export function registerSocial(A) {
  const { r, auth, admin, db, Q, one, applyCoins, err, int, str, now, limit, C, audit, hooks } = A;

  /* ---------- yardımcılar ---------- */
  async function notify(q, uid, kind, title, body, data) {
    await q('INSERT INTO slot.notifications(user_id,kind,title,body,data,created_at) VALUES($1,$2,$3,$4,$5,$6)', [uid, kind, String(title).slice(0, 80), String(body || '').slice(0, 300), data ? JSON.stringify(data) : null, now()]);
  }
  A.notify = notify;
  async function addTickets(q, uid, delta, reason) {
    const u = await one(q, 'SELECT tickets, unlimited FROM slot.users WHERE id=$1 FOR UPDATE', [uid]);
    let next = Number(u.tickets) + delta; if (u.unlimited && delta < 0) next = Number(u.tickets);
    if (next < 0) throw err(402, 'no_tickets', 'Yeterli biletin yok.');
    await q('UPDATE slot.users SET tickets=$1 WHERE id=$2', [next, uid]);
    await q('INSERT INTO slot.ledger(user_id,delta,balance_after,type,ref,created_at) VALUES($1,0,(SELECT balance FROM slot.users WHERE id=$1),$2,$3,$4)', [uid, 'tickets_' + reason, String(delta), now()]);
    return next;
  }
  A.addTickets = addTickets;
  const dayStart = (t) => Math.floor((t + TZ_MS) / DAY) * DAY - TZ_MS;
  const weekStart = (t) => { const d = dayStart(t); const dow = (new Date(d + TZ_MS).getUTCDay() + 6) % 7; return d - dow * DAY; }; // Pazartesi
  const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  /* ---------- oyuncu metrikleri (başarımlar + istatistik) ---------- */
  async function metrics(uid, q = Q) {
    const u = await one(q, 'SELECT spins, total_wagered, total_won, biggest_win, xp, tickets FROM slot.users WHERE id=$1', [uid]);
    const s = await one(q, 'SELECT COUNT(*) FILTER (WHERE win >= bet*20)::int bigwins, COUNT(DISTINCT game)::int games FROM slot.spins WHERE user_id=$1', [uid]);
    const fav = await one(q, 'SELECT game, COUNT(*)::int n FROM slot.spins WHERE user_id=$1 GROUP BY game ORDER BY n DESC LIMIT 1', [uid]);
    const o = await one(q, 'SELECT played, won, coins_won FROM slot.okey_stats WHERE user_id=$1', [uid]) || { played: 0, won: 0, coins_won: 0 };
    const f = await one(q, "SELECT COUNT(*)::int c FROM slot.friends WHERE user_id=$1 AND status='accepted'", [uid]);
    const pz = await one(q, 'SELECT COUNT(*)::int c FROM slot.puzzles WHERE user_id=$1 AND solved_at IS NOT NULL', [uid]);
    const wh = await one(q, 'SELECT COUNT(*)::int c FROM slot.wheel_spins WHERE user_id=$1', [uid]);
    const tr = await one(q, 'SELECT COUNT(*)::int c FROM slot.tournament_entries WHERE user_id=$1', [uid]);
    return { spins: u.spins, totalWagered: u.total_wagered, totalWon: u.total_won, biggestWin: u.biggest_win, level: C.levelFromXp(u.xp), tickets: Number(u.tickets),
      bigwins: s.bigwins, gamesPlayed: s.games, favoriteGame: fav ? fav.game : null, okeyPlayed: o.played, okeyWon: o.won, okeyCoins: o.coins_won,
      friends: f.c, puzzles: pz.c, wheelSpins: wh.c, tournaments: tr.c };
  }
  r('GET', '/api/me/stats', auth, async (ctx) => ({ stats: await metrics(ctx.user.id) }));

  r('GET', '/api/achievements', auth, async (ctx) => {
    const m = await metrics(ctx.user.id); const got = new Set((await Q('SELECT achievement FROM slot.achievement_claims WHERE user_id=$1', [ctx.user.id])).map(x => x.achievement));
    return { achievements: ACHIEVEMENTS.map(a => ({ ...a, progress: Math.min(a.goal, m[a.metric] || 0), done: (m[a.metric] || 0) >= a.goal, claimed: got.has(a.id) })) };
  });
  r('POST', '/api/achievements/:id/claim', auth, (ctx) => db.tx(async (q) => {
    const a = ACHIEVEMENTS.find(x => x.id === ctx.params.id); if (!a) throw err(404, 'no_achievement', 'Başarım bulunamadı.');
    const m = await metrics(ctx.user.id, q); if ((m[a.metric] || 0) < a.goal) throw err(409, 'not_done', 'Bu başarım henüz tamamlanmadı.');
    try { await q('INSERT INTO slot.achievement_claims(user_id,achievement,created_at) VALUES($1,$2,$3)', [ctx.user.id, a.id, now()]); } catch (e) { throw err(409, 'claimed', 'Bu ödülü zaten aldın.'); }
    const w = await applyCoins(q, ctx.user.id, a.coins, 'achievement', a.id); const t = a.tickets ? await addTickets(q, ctx.user.id, a.tickets, 'achievement') : m.tickets;
    return { coins: a.coins, tickets: a.tickets, balance: w.balance, ticketBalance: t };
  }));

  /* ---------- Şans Çarkı ---------- */
  async function wheelState(uid, q = Q) {
    const last = await one(q, 'SELECT MAX(created_at) t FROM slot.wheel_spins WHERE user_id=$1 AND free', [uid]);
    const next = last && last.t ? Number(last.t) + DAY : 0;
    return { segments: WHEEL.map(s => ({ label: s.label, coins: s.coins || 0, tickets: s.tickets || 0 })), freeAvailable: now() >= next, nextFreeAt: next, ticketCost: 1 };
  }
  r('GET', '/api/wheel', auth, async (ctx) => wheelState(ctx.user.id));
  r('POST', '/api/wheel/spin', auth, (ctx) => db.tx(async (q) => {
    limit(ctx, 'wheel:' + ctx.user.id, 3, 3000);
    await one(q, 'SELECT id FROM slot.users WHERE id=$1 FOR UPDATE', [ctx.user.id]);
    const st = await wheelState(ctx.user.id, q); const useTicket = !st.freeAvailable;
    if (useTicket && !ctx.body.useTicket) throw err(409, 'not_free', 'Günlük ücretsiz çevirmeni kullandın. 1 biletle çevirebilirsin.');
    if (useTicket) await addTickets(q, ctx.user.id, -1, 'wheel');
    const total = WHEEL.reduce((a, s) => a + s.w, 0); let x = randomInt(total), idx = 0; while (x >= WHEEL[idx].w) { x -= WHEEL[idx].w; idx++; }
    const p = WHEEL[idx]; let bal = null, tk = null;
    if (p.coins) bal = (await applyCoins(q, ctx.user.id, p.coins, 'wheel', idx)).balance;
    if (p.tickets) tk = await addTickets(q, ctx.user.id, p.tickets, 'wheel');
    await q('INSERT INTO slot.wheel_spins(user_id,free,prize_index,coins,tickets,created_at) VALUES($1,$2,$3,$4,$5,$6)', [ctx.user.id, !useTicket, idx, p.coins || 0, p.tickets || 0, now()]);
    const u = await one(q, 'SELECT balance, tickets FROM slot.users WHERE id=$1', [ctx.user.id]);
    return { index: idx, prize: { label: p.label, coins: p.coins || 0, tickets: p.tickets || 0 }, balance: u.balance, tickets: Number(u.tickets), paidWithTicket: useTicket, state: await wheelState(ctx.user.id, q) };
  }));

  /* ---------- Bulmaca ---------- */
  r('POST', '/api/puzzle/start', auth, async (ctx) => {
    limit(ctx, 'pzs:' + ctx.user.id, 10, 60e3);
    const n = ctx.body.size === 4 ? 4 : 3; const board = puzzleShuffle(n, n === 3 ? 60 : 160);
    const row = await one(Q, 'INSERT INTO slot.puzzles(user_id,size,start_board,created_at) VALUES($1,$2,$3,$4) RETURNING id', [ctx.user.id, n, JSON.stringify(board), now()]);
    const today = (await one(Q, 'SELECT COUNT(*)::int c FROM slot.puzzles WHERE user_id=$1 AND rewarded AND solved_at>$2', [ctx.user.id, dayStart(now())])).c;
    return { id: row.id, size: n, board, reward: PUZZLE_REWARD[n], rewardsLeft: Math.max(0, PUZZLE_DAILY - today), image: ['puzzle', 'zeus', 'okey', 'peri'][Number(row.id) % 4] };
  });
  r('POST', '/api/puzzle/:id/solve', auth, (ctx) => db.tx(async (q) => {
    const p = await one(q, 'SELECT * FROM slot.puzzles WHERE id=$1 AND user_id=$2 FOR UPDATE', [int(ctx.params.id, 'id', 1), ctx.user.id]);
    if (!p) throw err(404, 'no_puzzle', 'Bulmaca bulunamadı.'); if (p.solved_at) throw err(409, 'solved', 'Bu bulmaca zaten çözüldü.');
    const moves = Array.isArray(ctx.body.moves) ? ctx.body.moves.slice(0, 5000) : []; const n = p.size;
    const fin = puzzleReplay(JSON.parse(p.start_board), n, moves);
    if (!fin || !fin.every((v, i) => v === (i + 1) % (n * n))) throw err(400, 'not_solved', 'Bulmaca çözülmemiş görünüyor.');
    const today = (await one(q, 'SELECT COUNT(*)::int c FROM slot.puzzles WHERE user_id=$1 AND rewarded AND solved_at>$2', [ctx.user.id, dayStart(now())])).c;
    const rewarded = today < PUZZLE_DAILY; const secs = Math.round((now() - Number(p.created_at)) / 1000);
    await q('UPDATE slot.puzzles SET solved_at=$1, moves=$2, rewarded=$3 WHERE id=$4', [now(), moves.length, rewarded, p.id]);
    const bal = rewarded ? (await applyCoins(q, ctx.user.id, PUZZLE_REWARD[n], 'puzzle', p.id)).balance : null;
    return { ok: true, moves: moves.length, seconds: secs, reward: rewarded ? PUZZLE_REWARD[n] : 0, balance: bal, rewardsLeft: Math.max(0, PUZZLE_DAILY - today - (rewarded ? 1 : 0)) };
  }));

  /* ---------- Turnuvalar ---------- */
  const PRIZES_DAILY = [50000, 25000, 15000, 10000, 5000, 3000, 3000, 2000, 2000, 2000];
  const PRIZES_WEEKLY = [500000, 250000, 150000, 100000, 50000, 30000, 30000, 20000, 20000, 20000];
  async function ensureTournaments(q = Q) {
    const t = now(), ds = dayStart(t), ws = weekStart(t);
    const want = [
      { kind: 'daily', game: 'slots', title: 'Günlük Slot Turnuvası', starts: ds, ends: ds + DAY, prizes: PRIZES_DAILY, entry: 0 },
      { kind: 'daily', game: 'okey', title: 'Günlük 101 Okey Turnuvası', starts: ds, ends: ds + DAY, prizes: PRIZES_DAILY, entry: 0 },
      { kind: 'weekly', game: 'slots', title: 'Haftalık Büyük Slot Turnuvası', starts: ws, ends: ws + 7 * DAY, prizes: PRIZES_WEEKLY, entry: 1 },
      { kind: 'weekly', game: 'okey', title: 'Haftalık 101 Okey Ligi', starts: ws, ends: ws + 7 * DAY, prizes: PRIZES_WEEKLY, entry: 1 },
    ];
    for (const w of want) await q('INSERT INTO slot.tournaments(kind,game,title,starts_at,ends_at,entry_tickets,prizes,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (kind,game,starts_at) DO NOTHING', [w.kind, w.game, w.title, w.starts, w.ends, w.entry, JSON.stringify(w.prizes), 'active', t]);
    // biten turnuvaları sonuçlandır
    const ended = await q("SELECT id FROM slot.tournaments WHERE status='active' AND ends_at<=$1 LIMIT 10", [t]);
    for (const e of ended) await db.tx(async (tq) => settleTournament(tq, e.id));
  }
  async function settleTournament(q, id) {
    const T = await one(q, "SELECT * FROM slot.tournaments WHERE id=$1 AND status='active' FOR UPDATE", [id]); if (!T) return;
    const prizes = JSON.parse(T.prizes); const top = await q('SELECT user_id, score FROM slot.tournament_entries WHERE tournament_id=$1 AND score>0 ORDER BY score DESC, joined_at ASC LIMIT $2', [id, prizes.length]);
    for (let i = 0; i < top.length; i++) {
      await applyCoins(q, top[i].user_id, prizes[i], 'tournament', id);
      await q('UPDATE slot.tournament_entries SET rank=$1, prize=$2 WHERE tournament_id=$3 AND user_id=$4', [i + 1, prizes[i], id, top[i].user_id]);
      await notify(q, top[i].user_id, 'tournament', `🏆 ${T.title}: ${i + 1}. oldun!`, `${prizes[i].toLocaleString('tr-TR')} jeton ödülün hesabına eklendi.`, { tournamentId: id });
    }
    await q("UPDATE slot.tournaments SET status='settled', settled_at=$1 WHERE id=$2", [now(), id]);
  }
  A.ensureTournaments = ensureTournaments;
  // Skorlama: slotta bahse göre normalleştirilmiş kazanç puanı (kazanç/bahis × 100) — bakiyesi yüksek olan avantajlı değildir.
  hooks.onSpin = async (q, uid, { bet, win }) => {
    if (!win || !bet) return; const pts = Math.round(win * 100 / bet);
    await q("UPDATE slot.tournament_entries e SET score=e.score+$1 FROM slot.tournaments t WHERE t.id=e.tournament_id AND e.user_id=$2 AND t.game='slots' AND t.status='active' AND t.starts_at<=$3 AND t.ends_at>$3", [pts, uid, now()]);
  };
  // Okey: sıralamaya göre 300 / 200 / 100 / 25 puan (eşlide kazanan takım 300, diğerleri 50)
  hooks.onOkey = async (q, uid, { rank, won, mode }) => {
    const pts = mode === 'esli' ? (won ? 300 : 50) : [300, 200, 100, 25][rank] || 25;
    await q("UPDATE slot.tournament_entries e SET score=e.score+$1 FROM slot.tournaments t WHERE t.id=e.tournament_id AND e.user_id=$2 AND t.game='okey' AND t.status='active' AND t.starts_at<=$3 AND t.ends_at>$3", [pts, uid, now()]);
  };
  r('GET', '/api/tournaments', auth, async (ctx) => {
    await ensureTournaments();
    const rows = await Q("SELECT t.*, (SELECT COUNT(*)::int FROM slot.tournament_entries e WHERE e.tournament_id=t.id) players, me.score my_score, me.rank my_rank, me.prize my_prize, (me.user_id IS NOT NULL) joined FROM slot.tournaments t LEFT JOIN slot.tournament_entries me ON me.tournament_id=t.id AND me.user_id=$1 WHERE t.status='active' OR t.ends_at>$2 ORDER BY t.status, t.ends_at LIMIT 20", [ctx.user.id, now() - 7 * DAY]);
    return { now: now(), tournaments: rows.map(t => ({ id: t.id, kind: t.kind, game: t.game, title: t.title, startsAt: t.starts_at, endsAt: t.ends_at, entryTickets: t.entry_tickets, prizes: JSON.parse(t.prizes), status: t.status, players: t.players, joined: t.joined, myScore: t.my_score, myRank: t.my_rank, myPrize: t.my_prize })) };
  });
  r('GET', '/api/tournaments/:id', auth, async (ctx) => {
    const id = int(ctx.params.id, 'id', 1); const T = await one(Q, 'SELECT * FROM slot.tournaments WHERE id=$1', [id]); if (!T) throw err(404, 'no_tournament', 'Turnuva bulunamadı.');
    const top = await Q('SELECT u.username, u.avatar, e.score, e.rank, e.prize FROM slot.tournament_entries e JOIN slot.users u ON u.id=e.user_id WHERE e.tournament_id=$1 ORDER BY e.score DESC, e.joined_at LIMIT 50', [id]);
    const me = await one(Q, 'SELECT score, (SELECT COUNT(*)::int+1 FROM slot.tournament_entries x WHERE x.tournament_id=$1 AND x.score > e.score) pos FROM slot.tournament_entries e WHERE tournament_id=$1 AND user_id=$2', [id, ctx.user.id]);
    return { tournament: { id: T.id, title: T.title, kind: T.kind, game: T.game, endsAt: T.ends_at, status: T.status, prizes: JSON.parse(T.prizes), entryTickets: T.entry_tickets }, top, me };
  });
  r('POST', '/api/tournaments/:id/join', auth, (ctx) => db.tx(async (q) => {
    const id = int(ctx.params.id, 'id', 1); const T = await one(q, "SELECT * FROM slot.tournaments WHERE id=$1 AND status='active' AND ends_at>$2", [id, now()]);
    if (!T) throw err(404, 'no_tournament', 'Turnuva bulunamadı ya da bitti.');
    if (await one(q, 'SELECT 1 x FROM slot.tournament_entries WHERE tournament_id=$1 AND user_id=$2', [id, ctx.user.id])) throw err(409, 'joined', 'Bu turnuvaya zaten katıldın.');
    if (T.entry_tickets > 0) await addTickets(q, ctx.user.id, -T.entry_tickets, 'tournament');
    await q('INSERT INTO slot.tournament_entries(tournament_id,user_id,score,joined_at) VALUES($1,$2,0,$3)', [id, ctx.user.id, now()]);
    return { ok: true };
  }));

  /* ---------- Bildirimler ---------- */
  r('GET', '/api/notifications', auth, async (ctx) => ({ notifications: await Q('SELECT id, kind, title, body, data, created_at, read_at FROM slot.notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [ctx.user.id]) }));
  r('POST', '/api/notifications/read', auth, async (ctx) => { await Q('UPDATE slot.notifications SET read_at=$1 WHERE user_id=$2 AND read_at IS NULL', [now(), ctx.user.id]); return { ok: true }; });

  /* ---------- Mesajlar (arkadaşlar arası) ---------- */
  const areFriends = async (q, a, b) => !!(await one(q, "SELECT 1 x FROM slot.friends WHERE user_id=$1 AND friend_id=$2 AND status='accepted'", [a, b]));
  r('GET', '/api/messages', auth, async (ctx) => {
    const id = ctx.user.id;
    return { conversations: await Q(`SELECT u.id, u.username, u.avatar, (u.last_seen_at > $2) online, m.body last, m.created_at at, m.from_id = $1 mine,
        (SELECT COUNT(*)::int FROM slot.messages x WHERE x.to_id=$1 AND x.from_id=u.id AND x.read_at IS NULL) unread
      FROM slot.users u JOIN LATERAL (SELECT body, created_at, from_id FROM slot.messages WHERE (from_id=$1 AND to_id=u.id) OR (from_id=u.id AND to_id=$1) ORDER BY id DESC LIMIT 1) m ON TRUE
      WHERE u.id IN (SELECT CASE WHEN from_id=$1 THEN to_id ELSE from_id END FROM slot.messages WHERE from_id=$1 OR to_id=$1) ORDER BY m.created_at DESC LIMIT 50`, [id, now() - 5 * 60e3]) };
  });
  r('GET', '/api/messages/:userId', auth, async (ctx) => {
    const other = int(ctx.params.userId, 'userId', 1);
    await Q('UPDATE slot.messages SET read_at=$1 WHERE to_id=$2 AND from_id=$3 AND read_at IS NULL', [now(), ctx.user.id, other]);
    const u = await one(Q, 'SELECT id, username, avatar, (last_seen_at > $2) online FROM slot.users WHERE id=$1', [other, now() - 5 * 60e3]); if (!u) throw err(404, 'no_user');
    return { user: u, friends: await areFriends(Q, ctx.user.id, other), messages: (await Q('SELECT id, from_id, body, created_at FROM slot.messages WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) ORDER BY id DESC LIMIT 60', [ctx.user.id, other])).reverse() };
  });
  r('POST', '/api/messages/:userId', auth, (ctx) => db.tx(async (q) => {
    limit(ctx, 'msg:' + ctx.user.id, 8, 10e3);
    const other = int(ctx.params.userId, 'userId', 1), body = clean(ctx.body.body, 300); if (!body) throw err(400, 'empty', 'Mesaj boş olamaz.');
    if (!(await areFriends(q, ctx.user.id, other))) throw err(403, 'not_friends', 'Sadece arkadaşlarına mesaj gönderebilirsin.');
    const m = await one(q, 'INSERT INTO slot.messages(from_id,to_id,body,created_at) VALUES($1,$2,$3,$4) RETURNING id, created_at', [ctx.user.id, other, body, now()]);
    const unreadBefore = (await one(q, 'SELECT COUNT(*)::int c FROM slot.messages WHERE to_id=$1 AND from_id=$2 AND read_at IS NULL', [other, ctx.user.id])).c;
    if (unreadBefore === 1) await notify(q, other, 'message', `💬 ${ctx.user.username} sana mesaj gönderdi`, body.slice(0, 80), { from: ctx.user.id });
    return { id: m.id, createdAt: m.created_at };
  }));

  /* ---------- Canlı sohbet (genel oda) ---------- */
  r('GET', '/api/chat', auth, async (ctx) => {
    const after = Number(ctx.query.get('after') || 0);
    const rows = await Q('SELECT c.id, c.body, c.created_at, u.id uid, u.username, u.avatar, u.role FROM slot.chat_messages c JOIN slot.users u ON u.id=c.user_id WHERE c.id>$1 AND NOT c.deleted ORDER BY c.id DESC LIMIT 60', [after]);
    const online = (await one(Q, 'SELECT COUNT(*)::int c FROM slot.users WHERE last_seen_at>$1', [now() - 5 * 60e3])).c;
    return { messages: rows.reverse(), online };
  });
  r('POST', '/api/chat', auth, async (ctx) => {
    limit(ctx, 'chat:' + ctx.user.id, 1, 2500);
    const u = await one(Q, 'SELECT muted_until FROM slot.users WHERE id=$1', [ctx.user.id]);
    if (u.muted_until && Number(u.muted_until) > now()) throw err(403, 'muted', 'Sohbette geçici olarak susturuldun.');
    const body = clean(ctx.body.body, 200); if (!body) throw err(400, 'empty', 'Mesaj boş olamaz.');
    if (/(https?:\/\/|www\.)/i.test(body)) throw err(400, 'no_links', 'Sohbette bağlantı paylaşılamaz.');
    const m = await one(Q, 'INSERT INTO slot.chat_messages(user_id,body,created_at) VALUES($1,$2,$3) RETURNING id', [ctx.user.id, body, now()]);
    return { id: m.id };
  });
  r('DELETE', '/api/admin/chat/:id', admin, async (ctx) => { await Q('UPDATE slot.chat_messages SET deleted=TRUE WHERE id=$1', [int(ctx.params.id, 'id', 1)]); await audit(Q, ctx, 'chat_delete', null, { id: ctx.params.id }); return { ok: true }; });
  r('POST', '/api/admin/users/:id/mute', admin, async (ctx) => { const mins = int(ctx.body.minutes ?? 60, 'minutes', 0, 60 * 24 * 30); await Q('UPDATE slot.users SET muted_until=$1 WHERE id=$2', [mins ? now() + mins * 60e3 : null, int(ctx.params.id, 'id', 1)]); await audit(Q, ctx, 'mute', int(ctx.params.id, 'id', 1), { mins }); return { ok: true }; });

  /* ---------- Son kazananlar (gerçek oyun kayıtlarından) ---------- */
  r('GET', '/api/winners/recent', auth, async () => ({ winners: await Q("SELECT u.username, u.avatar, s.game, s.win, s.bet, s.created_at FROM slot.spins s JOIN slot.users u ON u.id=s.user_id WHERE s.created_at>$1 AND s.win >= s.bet*10 AND u.role='player' ORDER BY s.win DESC LIMIT 10", [now() - 7 * DAY]) }));

  /* ---------- Yönetici: hediye ve turnuva yönetimi ---------- */
  r('POST', '/api/admin/gift', admin, (ctx) => db.tx(async (q) => {
    const coins = int(ctx.body.coins ?? 0, 'coins', 0, 1e9), tickets = int(ctx.body.tickets ?? 0, 'tickets', 0, 1000), msg = clean(ctx.body.message, 200) || 'Yönetimden hediye!';
    if (!coins && !tickets) throw err(400, 'empty', 'Jeton veya bilet miktarı girin.');
    const ids = ctx.body.all ? (await q("SELECT id FROM slot.users WHERE role='player' AND NOT banned LIMIT 50000")).map(x => x.id) : [int(ctx.body.userId, 'userId', 1)];
    for (const id of ids) { if (coins) await applyCoins(q, id, coins, 'admin_gift', ctx.user.id); if (tickets) await addTickets(q, id, tickets, 'admin_gift'); await notify(q, id, 'gift', '🎁 Hediye geldi!', `${msg} ${coins ? coins.toLocaleString('tr-TR') + ' jeton' : ''}${coins && tickets ? ' + ' : ''}${tickets ? tickets + ' bilet' : ''}`); }
    await audit(q, ctx, 'admin_gift', ctx.body.all ? null : ids[0], { coins, tickets, count: ids.length, msg });
    return { ok: true, count: ids.length };
  }));
  r('GET', '/api/admin/tournaments', admin, async () => { await ensureTournaments(); return { tournaments: await Q('SELECT t.*, (SELECT COUNT(*)::int FROM slot.tournament_entries e WHERE e.tournament_id=t.id) players FROM slot.tournaments t ORDER BY t.id DESC LIMIT 40') }; });
  r('POST', '/api/admin/tournaments', admin, async (ctx) => {
    const b = ctx.body || {}; const game = b.game === 'okey' ? 'okey' : 'slots'; const hours = int(b.hours ?? 24, 'hours', 1, 24 * 31);
    const prizes = (Array.isArray(b.prizes) ? b.prizes : [10000]).map(x => int(x, 'prize', 0, 1e9)).slice(0, 50);
    const starts = now(), ends = starts + hours * 3600e3;
    const row = await one(Q, 'INSERT INTO slot.tournaments(kind,game,title,starts_at,ends_at,entry_tickets,prizes,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', ['custom', game, clean(b.title, 60) || 'Özel Turnuva', starts, ends, int(b.entryTickets ?? 0, 'entryTickets', 0, 100), JSON.stringify(prizes), 'active', now()]);
    await audit(Q, ctx, 'tournament_create', null, { id: row.id, game, hours, prizes }); return { id: row.id };
  });
  r('POST', '/api/admin/tournaments/:id/end', admin, (ctx) => db.tx(async (q) => { const id = int(ctx.params.id, 'id', 1); await q('UPDATE slot.tournaments SET ends_at=LEAST(ends_at,$1) WHERE id=$2', [now(), id]); await settleTournament(q, id); await audit(q, ctx, 'tournament_end', null, { id }); return { ok: true }; }));
  r('POST', '/api/admin/tournaments/:id/cancel', admin, async (ctx) => { const id = int(ctx.params.id, 'id', 1); await Q("UPDATE slot.tournaments SET status='cancelled' WHERE id=$1 AND status='active'", [id]); await audit(Q, ctx, 'tournament_cancel', null, { id }); return { ok: true }; });
}
