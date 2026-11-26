// AVIATOR (sanal jeton) — ORTAK TURLAR: herkes aynı uçağı izler.
// Her tur (slot.aviator_games) sunucuda oluşturulur: patlama çarpanı kriptografik RNG ile belirlenir ve sha256(çarpan:tuz)
// olarak tur başlamadan yayınlanır; tur bitince tuz açıklanır (doğrulanabilir).
// Zaman çizelgesi: BAHİS SÜRESİ (geri sayım) → UÇUŞ m(t)=e^(K·t) → PATLAMA (crash_at) → kısa ara → sonraki tur.
// TAHSİL ET yalnızca o oyuncunun bahsini kapatır; uçak ve tur devam eder, patlama anı herkes için aynıdır.
// Oyuncuya özel müdahale yoktur: dağılım herkes için aynıdır, P(patlama ≥ x) = RTP / x.
export const AV_DEFAULTS = { enabled: true, rtp: 0.96, maxMult: 1000, minBet: 100, maxBet: 1000000, k: 0.09, countdownMs: 1500, betMs: 6000, endMs: 3000 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export function crashPoint(rtp, maxMult) {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  const u = (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53; // [0,1) 53 bit
  const m = Math.floor((100 * rtp) / (1 - u)) / 100;
  return Math.min(maxMult, Math.max(1, m));
}
export const multAt = (k, ms) => Math.floor(Math.exp(k * Math.max(0, ms) / 1000) * 100) / 100;
export const timeOf = (k, m) => (Math.log(m) / k) * 1000;

export function registerAviator(A) {
  const { r, auth, db, Q, one, applyCoins, err, int, now, limit, C } = A;
  let cache = null, cacheAt = 0;
  async function cfg(force) { if (!force && cache && now() - cacheAt < 15000) return cache; const v = A.setting ? await A.setting('aviator_config') : null; cache = { ...AV_DEFAULTS, ...(v || {}) }; cacheAt = now(); return cache; }
  const pub = (row, reveal) => ({ id: Number(row.id), game: row.game_id ? Number(row.game_id) : null, bet: Number(row.bet), auto: row.auto ? Number(row.auto) : null, startAt: Number(row.start_at), status: row.status, hash: row.hash,
    cashMult: row.cash_mult ? Number(row.cash_mult) : null, win: Number(row.win || 0), ...((reveal === undefined ? row.status !== 'flying' : reveal) ? { crash: Number(row.crash), salt: row.salt } : {}) });
  const crashedRow = (row, t, k) => t >= Number(row.start_at) + timeOf(k, Number(row.crash));

  /* ---------- ortak turlar ---------- */
  const gEnd = (g, c) => Number(g.crash_at) + c.endMs;
  /** Şu anki turu döndürür; bitmişse (patlama + ara) sıradakini oluşturur. Yarış güvenli: tur no birincil anahtar. */
  async function current(c, t) {
    for (let i = 0; i < 3; i++) {
      const g = await one(Q, 'SELECT * FROM slot.aviator_games ORDER BY id DESC LIMIT 1');
      if (g && t < gEnd(g, c)) return g;
      await createGame(c, g ? Number(g.id) + 1 : 1, g ? Math.max(gEnd(g, c), t) : t);
    }
    return one(Q, 'SELECT * FROM slot.aviator_games ORDER BY id DESC LIMIT 1');
  }
  async function createGame(c, id, openAt) {
    const crash = crashPoint(c.rtp, c.maxMult), salt = C.sha256(String(Math.random()) + openAt + id).slice(0, 16), hash = C.sha256(crash.toFixed(2) + ':' + salt);
    const start = openAt + c.betMs, crashAt = Math.round(start + timeOf(c.k, crash));
    await Q('INSERT INTO slot.aviator_games(id,crash,salt,hash,open_at,start_at,crash_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING', [id, crash, salt, hash, openAt, start, crashAt, now()]);
  }
  /** Bir sonraki turu (bahisler uçuş sırasında ona yazılır) hazırla */
  async function nextOf(c, g) {
    let n = await one(Q, 'SELECT * FROM slot.aviator_games WHERE id=$1', [Number(g.id) + 1]);
    if (!n) { await createGame(c, Number(g.id) + 1, gEnd(g, c)); n = await one(Q, 'SELECT * FROM slot.aviator_games WHERE id=$1', [Number(g.id) + 1]); }
    return n;
  }
  const phase = (g, t) => (t < Number(g.start_at) ? 'betting' : t < Number(g.crash_at) ? 'flying' : 'crashed');
  const gpub = (g, t) => { const ph = phase(g, t); return { id: Number(g.id), phase: ph, openAt: Number(g.open_at), startAt: Number(g.start_at), hash: g.hash, ...(ph === 'crashed' ? { crash: Number(g.crash), salt: g.salt, crashAt: Number(g.crash_at) } : {}) }; };

  /** Bitmiş bahisleri kapatır (otomatik tahsil hedefi patlamadan önceyse ödenir, değilse kayıp). Tüm oyuncular için, tembel. */
  async function settleDue(t, k, userId) {
    const rows = await Q(`SELECT id, user_id, bet, auto, crash, start_at FROM slot.aviator_rounds WHERE status='flying' AND start_at<=$1 ${userId ? 'AND user_id=$2' : ''} ORDER BY id LIMIT 300`, userId ? [t, userId] : [t]);
    for (const row of rows) {
      const crash = Number(row.crash), start = Number(row.start_at), auto = row.auto ? Number(row.auto) : null;
      const autoDue = auto && auto <= crash && t >= start + timeOf(k, auto), crashed = t >= start + timeOf(k, crash);
      if (!autoDue && !crashed) continue;
      await db.tx(async (q) => { const x = await one(q, "SELECT * FROM slot.aviator_rounds WHERE id=$1 AND status='flying' FOR UPDATE", [row.id]); if (x) await settleIfDone(q, x, t, k); });
    }
  }
  async function settleIfDone(q, row, t, k) {
    if (row.status !== 'flying') return row;
    const crash = Number(row.crash), start = Number(row.start_at), auto = row.auto ? Number(row.auto) : null;
    const autoAt = auto && auto <= crash ? start + timeOf(k, auto) : null, crashAt = start + timeOf(k, crash);
    if (autoAt != null && t >= autoAt) return cashout(q, row, auto);
    if (t >= crashAt) { await q("UPDATE slot.aviator_rounds SET status='lost', ended_at=$1 WHERE id=$2", [t, row.id]); return { ...row, status: 'lost', ended_at: t }; }
    return row;
  }
  async function cashout(q, row, m) {
    const win = Math.floor(Number(row.bet) * m);
    await q("UPDATE slot.aviator_rounds SET status='cashed', cash_mult=$1, win=$2, ended_at=$3 WHERE id=$4", [m, win, now(), row.id]);
    if (win > 0) await applyCoins(q, row.user_id, win, 'aviator_win', Number(row.id));
    return { ...row, status: 'cashed', cash_mult: m, win };
  }
  /** Tur durumu: tur, oyuncunun bahisleri (bu tur + sıradaki), masadaki gerçek oyuncular, geçmiş */
  async function state(ctx, c, t) {
    await settleDue(t, c.k);
    const g = await current(c, t);
    const nx = phase(g, t) === 'betting' ? null : await one(Q, 'SELECT * FROM slot.aviator_games WHERE id=$1', [Number(g.id) + 1]);
    const mine = await Q('SELECT * FROM slot.aviator_rounds WHERE user_id=$1 AND game_id = ANY($2::bigint[]) ORDER BY id', [ctx.user.id, [Number(g.id), Number(g.id) + 1]]);
    const players = await Q(`SELECT r.bet, r.auto, r.status, r.cash_mult, r.win, u.username, u.avatar FROM slot.aviator_rounds r JOIN slot.users u ON u.id=r.user_id WHERE r.game_id=$1 ORDER BY r.bet DESC LIMIT 40`, [g.id]);
    const hist = await Q('SELECT crash FROM slot.aviator_games WHERE crash_at<=$1 ORDER BY id DESC LIMIT 24', [t]);
    const bal = await one(Q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
    return {
      now: t, k: c.k, game: gpub(g, t), next: nx ? gpub(nx, t) : null,
      mine: mine.map(x => pub(x, crashedRow(x, t, c.k))),
      players: players.map(p => ({ name: p.username, avatar: Number(p.avatar || 0), bet: Number(p.bet), status: p.status, cashMult: p.cash_mult ? Number(p.cash_mult) : null, win: Number(p.win || 0) })),
      history: hist.map(h => Number(h.crash)), balance: Number(bal.balance),
    };
  }

  r('GET', '/api/aviator', auth, async (ctx) => {
    const c = await cfg(); const t = now();
    const st = await state(ctx, c, t);
    const best = await one(Q, "SELECT COALESCE(MAX(cash_mult),0) m, COALESCE(MAX(win),0) w, COUNT(*)::int n FROM slot.aviator_rounds WHERE user_id=$1", [ctx.user.id]);
    const act = st.mine.find(x => x.status === 'flying') || null;
    return { config: { enabled: c.enabled, rtp: c.rtp, minBet: c.minBet, maxBet: c.maxBet, k: c.k, countdownMs: c.countdownMs, maxMult: c.maxMult, betMs: c.betMs, endMs: c.endMs, shared: true }, ...st,
      active: act, best: { mult: Number(best.m), win: Number(best.w), rounds: best.n } };
  });
  r('GET', '/api/aviator/state', auth, async (ctx) => { limit(ctx, 'avs:' + ctx.user.id, 40, 10000); const c = await cfg(); return state(ctx, c, now()); });

  /** Bahis: tur bahis süresindeyse bu tura, uçuş/patlama sırasındaysa SIRADAKİ tura yazılır (gerçek Aviator gibi) */
  r('POST', '/api/aviator/bet', auth, async (ctx) => {
    limit(ctx, 'avb:' + ctx.user.id, 8, 5000);
    const c = await cfg(); if (!c.enabled) throw err(503, 'aviator_disabled', 'Avivasor şu anda bakımda.');
    const bet = int(ctx.body.bet, 'bet', c.minBet, c.maxBet);
    let auto = ctx.body.auto != null && ctx.body.auto !== '' ? Number(ctx.body.auto) : null;
    if (auto != null) { if (!Number.isFinite(auto) || auto < 1.01 || auto > c.maxMult) throw err(400, 'bad_auto', 'Otomatik tahsil 1,01x ile ' + c.maxMult + 'x arasında olmalı.'); auto = Math.floor(auto * 100) / 100; }
    const t = now(); let g = await current(c, t);
    if (t >= Number(g.start_at) - 150) g = await nextOf(c, g); // kalkışa çok az kaldıysa/uçuştaysa sıradaki tura
    return db.tx(async (q) => {
      const dup = await one(q, 'SELECT id FROM slot.aviator_rounds WHERE user_id=$1 AND game_id=$2', [ctx.user.id, g.id]);
      if (dup) throw err(409, 'round_active', 'Bu tur için bahsin zaten alındı.');
      await applyCoins(q, ctx.user.id, -bet, 'aviator_bet', null);
      const row = await one(q, "INSERT INTO slot.aviator_rounds(user_id,game_id,bet,auto,crash,salt,hash,start_at,status,win,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'flying',0,$9) RETURNING *",
        [ctx.user.id, g.id, bet, auto, g.crash, g.salt, g.hash, g.start_at, t]);
      const bal = await one(q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
      return { round: pub(row), game: gpub(g, t), now: t, k: c.k, balance: Number(bal.balance) };
    });
  });
  /** Kalkıştan önce bahsi geri çek (jeton iade) */
  r('POST', '/api/aviator/:id/cancel', auth, async (ctx) => {
    limit(ctx, 'avx:' + ctx.user.id, 10, 5000);
    const id = int(ctx.params.id, 'id', 1);
    return db.tx(async (q) => {
      const t = now(); const row = await one(q, "SELECT * FROM slot.aviator_rounds WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, ctx.user.id]); if (!row) throw err(404, 'no_round', 'Bahis bulunamadı.');
      if (row.status !== 'flying' || t >= Number(row.start_at) - 100) throw err(409, 'too_late', 'Uçak kalktı; bahis artık geri alınamaz.');
      await q('DELETE FROM slot.aviator_rounds WHERE id=$1', [id]); await applyCoins(q, ctx.user.id, Number(row.bet), 'aviator_cancel', id);
      const bal = await one(q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]); return { ok: true, balance: Number(bal.balance) };
    });
  });

  /** TAHSİL ET: yalnızca bu oyuncunun bahsi kapanır; çarpan SUNUCU saatine göre. Uçak ve tur sürer. */
  r('POST', '/api/aviator/:id/cashout', auth, async (ctx) => {
    limit(ctx, 'avc:' + ctx.user.id, 10, 5000);
    const c = await cfg(), id = int(ctx.params.id, 'id', 1);
    return db.tx(async (q) => {
      const t = now(); let row = await one(q, 'SELECT * FROM slot.aviator_rounds WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, ctx.user.id]); if (!row) throw err(404, 'no_round', 'Tur bulunamadı.');
      row = await settleIfDone(q, row, t, c.k);
      if (row.status === 'flying') {
        const el = t - Number(row.start_at); if (el < 0) throw err(409, 'not_started', 'Uçak henüz kalkmadı.');
        row = await cashout(q, row, Math.min(multAt(c.k, el), Number(row.crash)));
      }
      const bal = await one(q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
      // patlama çarpanı tur bitmeden açıklanmaz (diğer oyuncular hâlâ uçuyor)
      return { round: pub(row, crashedRow(row, t, c.k)), now: t, balance: Number(bal.balance) };
    });
  });

  /** Uzun bekleme: verilen tur PATLAYANA kadar bekler (en çok 20 sn) → herkes patlamayı aynı anda görür */
  r('GET', '/api/aviator/game/:id/wait', auth, async (ctx) => {
    const c = await cfg(), id = int(ctx.params.id, 'id', 1);
    const g = await one(Q, 'SELECT * FROM slot.aviator_games WHERE id=$1', [id]); if (!g) throw err(404, 'no_game', 'Tur bulunamadı.');
    const w = Math.min(20000, Number(g.crash_at) - now()); if (w > 0) await sleep(w + 10);
    const t = now(); await settleDue(t, c.k, ctx.user.id);
    const mine = await one(Q, 'SELECT * FROM slot.aviator_rounds WHERE user_id=$1 AND game_id=$2', [ctx.user.id, id]);
    const bal = await one(Q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
    return { game: gpub(g, t), mine: mine ? pub(mine, t >= Number(g.crash_at)) : null, now: t, balance: Number(bal.balance) };
  });

  // Eski sürüm uyumluluğu: bahis satırı üzerinden bekleme (5.0.24 ve öncesi istemciler)
  r('GET', '/api/aviator/:id/wait', auth, async (ctx) => {
    const c = await cfg(), id = int(ctx.params.id, 'id', 1);
    let row = await one(Q, 'SELECT * FROM slot.aviator_rounds WHERE id=$1 AND user_id=$2', [id, ctx.user.id]); if (!row) throw err(404, 'no_round', 'Tur bulunamadı.');
    if (row.status === 'flying') {
      const crash = Number(row.crash), auto = row.auto ? Number(row.auto) : null, start = Number(row.start_at);
      const end = start + timeOf(c.k, auto && auto <= crash ? auto : crash);
      const wait = Math.min(20000, end - now()); if (wait > 0) await sleep(wait + 15);
      row = await db.tx(async (q) => settleIfDone(q, await one(q, 'SELECT * FROM slot.aviator_rounds WHERE id=$1 FOR UPDATE', [id]), now(), c.k));
    }
    const bal = await one(Q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
    return { round: pub(row), now: now(), balance: Number(bal.balance) };
  });

  r('GET', '/api/admin/aviator', A.admin, async () => {
    const s = await one(Q, "SELECT COUNT(*)::int rounds, COALESCE(SUM(bet),0)::bigint bet, COALESCE(SUM(win),0)::bigint win, COUNT(DISTINCT user_id)::int players FROM slot.aviator_rounds WHERE status<>'flying'");
    const d7 = await one(Q, "SELECT COUNT(*)::int rounds, COALESCE(SUM(bet),0)::bigint bet, COALESCE(SUM(win),0)::bigint win FROM slot.aviator_rounds WHERE status<>'flying' AND created_at>$1", [now() - 7 * 86400e3]);
    return { config: await cfg(true), defaults: AV_DEFAULTS, all: s, last7: d7 };
  });
  r('PUT', '/api/admin/aviator', A.admin, async (ctx) => {
    const b = ctx.body || {}, c = { ...(await cfg(true)) };
    if (b.enabled != null) c.enabled = !!b.enabled;
    if (b.rtp != null) { const v = Number(b.rtp); if (!(v >= 0.85 && v <= 0.99)) throw err(400, 'bad_rtp', 'RTP %85 ile %99 arasında olmalı.'); c.rtp = Math.round(v * 1000) / 1000; }
    if (b.maxMult != null) c.maxMult = int(b.maxMult, 'maxMult', 10, 10000);
    if (b.minBet != null) c.minBet = int(b.minBet, 'minBet', 1, 1e6);
    if (b.maxBet != null) c.maxBet = int(b.maxBet, 'maxBet', c.minBet, 1e9);
    await A.setSetting('aviator_config', c); await A.audit(Q, ctx, 'aviator_config', null, c); cache = null; return { ok: true, config: c };
  });
}
