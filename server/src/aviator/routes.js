// AVIATOR (sanal jeton): her bahis kendi turunu başlatır. Patlama çarpanı bahis anında sunucuda kriptografik RNG ile
// belirlenir ve sha256(çarpan:tuz) olarak önceden taahhüt edilir; tur bitince tuz açıklanır (doğrulanabilir).
// Çarpan zamanla büyür: m(t) = e^(K·t). TAHSİL ET isteğinde çarpan SUNUCU saatine göre hesaplanır.
// Oyuncuya özel müdahale yoktur: dağılım herkes için aynıdır, P(patlama ≥ x) = RTP / x.
export const AV_DEFAULTS = { enabled: true, rtp: 0.96, maxMult: 1000, minBet: 100, maxBet: 1000000, k: 0.09, countdownMs: 1500 };
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
  const pub = (row, reveal) => ({ id: Number(row.id), bet: Number(row.bet), auto: row.auto ? Number(row.auto) : null, startAt: Number(row.start_at), status: row.status, hash: row.hash,
    cashMult: row.cash_mult ? Number(row.cash_mult) : null, win: Number(row.win || 0), ...(reveal || row.status !== 'flying' ? { crash: Number(row.crash), salt: row.salt } : {}) });

  /** Bitmiş turu kapatır: otomatik tahsil hedefi patlamadan önceyse ödenir, değilse kayıp. */
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

  r('GET', '/api/aviator', auth, async (ctx) => {
    const c = await cfg(); const t = now();
    let act = await one(Q, "SELECT * FROM slot.aviator_rounds WHERE user_id=$1 AND status='flying' ORDER BY id DESC LIMIT 1", [ctx.user.id]);
    if (act) act = await db.tx(async (q) => settleIfDone(q, await one(q, 'SELECT * FROM slot.aviator_rounds WHERE id=$1 FOR UPDATE', [act.id]), t, c.k));
    const hist = await Q("SELECT crash FROM slot.aviator_rounds WHERE user_id=$1 AND status<>'flying' ORDER BY id DESC LIMIT 24", [ctx.user.id]);
    const best = await one(Q, "SELECT COALESCE(MAX(cash_mult),0) m, COALESCE(MAX(win),0) w, COUNT(*)::int n FROM slot.aviator_rounds WHERE user_id=$1", [ctx.user.id]);
    return { config: { enabled: c.enabled, rtp: c.rtp, minBet: c.minBet, maxBet: c.maxBet, k: c.k, countdownMs: c.countdownMs, maxMult: c.maxMult }, now: t,
      active: act && act.status === 'flying' ? pub(act) : null, history: hist.map(h => Number(h.crash)), best: { mult: Number(best.m), win: Number(best.w), rounds: best.n } };
  });

  r('POST', '/api/aviator/bet', auth, async (ctx) => {
    limit(ctx, 'avb:' + ctx.user.id, 8, 5000);
    const c = await cfg(); if (!c.enabled) throw err(503, 'aviator_disabled', 'Avivasor şu anda bakımda.');
    const bet = int(ctx.body.bet, 'bet', c.minBet, c.maxBet);
    let auto = ctx.body.auto != null && ctx.body.auto !== '' ? Number(ctx.body.auto) : null;
    if (auto != null) { if (!Number.isFinite(auto) || auto < 1.01 || auto > c.maxMult) throw err(400, 'bad_auto', 'Otomatik tahsil 1,01x ile ' + c.maxMult + 'x arasında olmalı.'); auto = Math.floor(auto * 100) / 100; }
    return db.tx(async (q) => {
      const t = now();
      const prev = await one(q, "SELECT * FROM slot.aviator_rounds WHERE user_id=$1 AND status='flying' ORDER BY id DESC LIMIT 1 FOR UPDATE", [ctx.user.id]);
      if (prev) { const p2 = await settleIfDone(q, prev, t, c.k); if (p2.status === 'flying') throw err(409, 'round_active', 'Uçuşun sürüyor: önce tahsil et ya da turun bitmesini bekle.'); }
      await applyCoins(q, ctx.user.id, -bet, 'aviator_bet', null);
      const crash = crashPoint(c.rtp, c.maxMult), salt = C.sha256(String(Math.random()) + t + ctx.user.id).slice(0, 16), hash = C.sha256(crash.toFixed(2) + ':' + salt);
      const row = await one(q, "INSERT INTO slot.aviator_rounds(user_id,bet,auto,crash,salt,hash,start_at,status,win,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'flying',0,$8) RETURNING *", [ctx.user.id, bet, auto, crash, salt, hash, t + c.countdownMs, t]);
      const bal = await one(q, 'SELECT balance FROM slot.users WHERE id=$1', [ctx.user.id]);
      return { round: pub(row), now: t, k: c.k, balance: Number(bal.balance) };
    });
  });

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
      return { round: pub(row, true), now: t, balance: Number(bal.balance) };
    });
  });

  // Uzun bekleme: tur bitene (patlama ya da otomatik tahsil) kadar en çok 20 sn bekler → tur başına tek istek
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
