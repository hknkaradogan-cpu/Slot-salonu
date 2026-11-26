/* OTOMATİK ÜRETİLDİ: server/tools/build-client-engine.js — elle düzenlemeyin */
(function () {
  var CAL = {
  "zeus": {
    "scale": 2.1763747,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:15:37.287Z",
    "buy": {
      "fs": 51,
      "super": 91.1
    }
  },
  "misir": {
    "scale": 1.0585241,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:16:14.221Z",
    "buy": {
      "fs": 49.4
    }
  },
  "vegas": {
    "scale": 2.4920074,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:16:37.527Z"
  },
  "peri": {
    "scale": 1.7563051,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:17:53.139Z",
    "buy": {
      "fs": 71.2,
      "super": 97.8
    }
  },
  "ejderha": {
    "scale": 3.8761457,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:18:36.467Z",
    "buy": {
      "fs": 44.8
    }
  },
  "korsan": {
    "scale": 2.0382027,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:19:15.337Z",
    "buy": {
      "fs": 113.8
    }
  },
  "altin": {
    "scale": 1.1044674,
    "calibratedWithSpins": 120000000,
    "date": "2026-11-25T23:19:58.590Z"
  }
};
// SLOT SALONU oyun motoru (ES modülü: Node ve Deno/Supabase'de aynen çalışır)

/*
 * SLOT SALONU oyun motoru — 7 oyun, 5 farklı mekanik ailesi.
 * Tüm kazançlar "bahis katı" (x) cinsindendir; jeton = round(x * bahis).
 * Her oyunun ödeme tablosu SCALE katsayısıyla çarpılır; SCALE değeri
 * tools/simulate.js ile milyonlarca spin simüle edilerek %95 RTP'ye
 * kalibre edilir ve calibration.json dosyasına yazılır.
 */

const MAX_WIN = 5000; // tek spin (bonus dahil) azami kazanç: 5000x

function picker(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const cum = new Float64Array(weights.length);
  let s = 0;
  for (let i = 0; i < weights.length; i++) { s += weights[i] / total; cum[i] = s; }
  cum[weights.length - 1] = 1.0000001;
  return {
    pick(rng) { const r = rng.next(); for (let i = 0; i < cum.length; i++) if (r < cum[i]) return i; return cum.length - 1; },
    prob(i) { return weights[i] / total; },
  };
}

/* 5x3 ödeme çizgileri (satır indeksleri, 0 = üst) */
const LINES20 = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
  [0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[1,0,1,2,1],
  [1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[0,1,1,1,0],[2,1,1,1,2],
  [1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0],[2,0,2,0,2],[0,2,2,2,0],
];
const LINES3x3 = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]];

/* ===================================================================
 * 1) TUMBLE / SCATTER-PAYS (Zeus, Kristal Peri)
 *  6x5 ızgara, aynı sembolden 8+ adet herhangi bir yerde kazandırır.
 *  Kazanan semboller patlar, üstten yenileri düşer (zincirleme).
 *  Çarpan sembolleri dizinin sonunda toplanıp kazancı çarpar.
 *  4+ scatter = ücretsiz dönüş; FS'de çarpanlar birikir.
 *  Kristal Peri FS'de ayrıca her zincirleme kazanç +1 çarpan ekler.
 *  Hücre kodları: 0..n-1 normal, n = scatter, 1000+v = çarpan (v x)
 * =================================================================== */
function tumbleGame(def, S) {
  const C = def.cols, R = def.rows, N = C * R, nS = def.syms.length, SC = nS;
  const base = picker([...def.syms.map(s => s.w), def.scW]);
  const free = picker([...def.syms.map(s => s.w), def.scWfs]);
  const mp = picker(def.mults.map(m => m[1]));
  const mv = def.mults.map(m => m[0]);
  const cell = (rng, fs, boost) => (rng.next() < (fs ? def.multPfs * (boost ? 2.2 : 1) : def.multP)) ? 1000 + mv[mp.pick(rng)] : (fs ? free : base).pick(rng);
  const payFor = (s, n) => { const p = def.syms[s].pay; return n >= 12 ? p[2] : n >= 10 ? p[1] : n >= 8 ? p[0] : 0; };
  const counts = new Int32Array(nS), winSym = new Uint8Array(nS);

  function sequence(rng, fs, rec, boost) {
    const g = new Int16Array(N);
    for (let i = 0; i < N; i++) g[i] = cell(rng, fs, boost);
    const out = { win: 0, multSum: 0, scat: 0, cascades: 0 };
    if (rec) { out.grid = Array.from(g); out.steps = []; }
    for (;;) {
      counts.fill(0); winSym.fill(0);
      for (let i = 0; i < N; i++) if (g[i] < nS) counts[g[i]]++;
      let sw = 0; const wins = rec ? [] : null;
      for (let s = 0; s < nS; s++) if (counts[s] >= 8) {
        const p = payFor(s, counts[s]) * S; sw += p; winSym[s] = 1;
        if (rec) wins.push({ s, n: counts[s], pay: p });
      }
      if (sw === 0) break;
      out.win += sw; out.cascades++;
      const removed = rec ? [] : null;
      if (rec) for (let i = 0; i < N; i++) if (g[i] < nS && winSym[g[i]]) removed.push(i);
      for (let c = 0; c < C; c++) {
        let w = R - 1;
        for (let r = R - 1; r >= 0; r--) {
          const v = g[c * R + r];
          if (v < nS && winSym[v]) continue;
          g[c * R + w] = v; w--;
        }
        for (let r = w; r >= 0; r--) g[c * R + r] = cell(rng, fs, boost);
      }
      if (rec) out.steps.push({ wins, removed, grid: Array.from(g) });
    }
    for (let i = 0; i < N; i++) { if (g[i] >= 1000) out.multSum += g[i] - 1000; else if (g[i] === SC) out.scat++; }
    return out;
  }

  function play(rng, rec) {
    const b = sequence(rng, false, rec);
    let w = b.win; if (w > 0 && b.multSum > 0) w *= b.multSum;
    const scPay = (def.scPay[Math.min(b.scat, 6)] || 0) * S;
    let total = w + scPay;
    const res = { kind: 'tumble', base: rec ? { ...b, seqWin: w, scPay } : null, fs: null };
    if (b.scat >= 4) { const f = fsRun(rng, rec, total, false); total += f.total; res.fs = rec ? f : true; }
    res.win = Math.min(total, MAX_WIN);
    return res;
  }
  function fsRun(rng, rec, total, boost) {
    let left = def.fsCount, acc = 0, fsTotal = 0, n = 0; const spins = rec ? [] : null;
    while (left > 0 && n < 200) {
      left--; n++;
      const q = sequence(rng, true, rec, boost);
      let sw = q.win, added = 0;
      if (sw > 0) { added = q.multSum + (def.progressive ? q.cascades : 0); acc += added; if (acc > 0) sw *= acc; }
      let retrig = 0; if (q.scat >= 3) { left += def.fsRetrig; retrig = def.fsRetrig; }
      fsTotal += sw;
      if (rec) spins.push({ ...q, seqWin: sw, acc, added, retrig, left });
      if (total + fsTotal >= MAX_WIN) break;
    }
    return { count: def.fsCount, spins, total: fsTotal, boost: !!boost };
  }
  // Bonus satın alma: doğrudan ücretsiz dönüş (super: FS'de çarpanlar 2,2 kat daha sık)
  function buy(rng, rec, kind) {
    const f = fsRun(rng, rec, 0, kind === 'super');
    return { kind: 'tumble', bought: kind, base: null, fs: rec ? f : true, win: Math.min(f.total, MAX_WIN) };
  }
  return { play, buy, buyKinds: ['fs', 'super'], info: { cols: C, rows: R, syms: def.syms.map((s, i) => ({ id: i, key: s.key, pay: s.pay.map(p => +(p * S).toFixed(2)) })), scPay: Object.fromEntries(Object.entries(def.scPay).map(([k, v]) => [k, +(v * S).toFixed(2)])), fsCount: def.fsCount } };
}

/* ===================================================================
 * 2) ÇİZGİLİ 5x3 (Mısır Hazineleri, Altın Şans, Korsan Hazinesi)
 *  Hücre indeksi = sütun*3 + satır.
 * =================================================================== */
function evalLines(g, lines, rows, def, S, rec, opts) {
  const W = def.wild, nL = lines.length;
  let total = 0; const wins = rec ? [] : null;
  for (let li = 0; li < nL; li++) {
    const L = lines[li];
    let cand = -1;
    for (let c = 0; c < L.length; c++) { const v = g[c * rows + L[c]]; if (v !== W) { cand = v; break; } }
    // wild koşusu
    let wn = 0; while (wn < L.length && g[wn * rows + L[wn]] === W) wn++;
    let best = 0, bestN = 0, bestS = -1, bestWilds = 0;
    if (wn > 0 && def.pays[W]) { const p = def.pays[W][wn] || 0; if (p > best) { best = p; bestN = wn; bestS = W; bestWilds = wn; } }
    if (cand >= 0 && def.pays[cand]) {
      let n = 0, wilds = 0;
      while (n < L.length) { const v = g[n * rows + L[n]]; if (v === cand) n++; else if (v === W) { n++; wilds++; } else break; }
      let p = def.pays[cand][n] || 0;
      if (p > 0 && wilds > 0 && opts.wildMult) p *= opts.wildMult(wilds);
      if (p > best) { best = p; bestN = n; bestS = cand; bestWilds = wilds; }
    }
    if (best > 0) {
      const pay = best / nL * S; total += pay;
      if (rec) wins.push({ line: li, s: bestS, n: bestN, pay, pos: L.slice(0, bestN).map((r, c) => c * rows + r), wilds: bestWilds });
    }
  }
  return { total, wins };
}

function linesGameFactory(def, S) {
  const rows = def.rows, cols = def.cols, N = rows * cols, lines = def.lines;
  const pickers = def.reelWeights.map(w => picker(w));
  const fill = (rng, fsMode) => { const g = new Int16Array(N); for (let c = 0; c < cols; c++) { const p = (fsMode && def.fsReelWeights) ? def.fsPickers[c] : pickers[c]; for (let r = 0; r < rows; r++) g[c * rows + r] = p.pick(rng); } return g; };
  if (def.fsReelWeights) def.fsPickers = def.fsReelWeights.map(w => picker(w));
  return { rows, cols, N, lines, fill };
}

/* --- Mısır Hazineleri: Kitap (wild+scatter), FS'de genişleyen özel sembol --- */
function egyptGame(def, S) {
  const L = linesGameFactory(def, S); const BOOK = def.wild;
  const opts = {};
  function spin(rng, rec, special) {
    const g = L.fill(rng, false);
    const lw = evalLines(g, L.lines, L.rows, def, S, rec, opts);
    let books = 0; const reelsWithBook = new Set();
    for (let i = 0; i < L.N; i++) if (g[i] === BOOK) { books++; reelsWithBook.add((i / L.rows) | 0); }
    const nb = reelsWithBook.size;
    let total = lw.total; let scPay = 0;
    if (nb >= 3) { scPay = def.bookPay[nb] * S; total += scPay; }
    let expand = null;
    if (special != null) {
      const reels = []; for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) if (g[c * L.rows + r] === special) { reels.push(c); break; }
      const need = def.highSyms.includes(special) ? 2 : 3;
      if (reels.length >= need) { const p = (def.pays[special][reels.length] || 0) * S; total += p; expand = { reels, pay: p }; }
    }
    return { g, total, nb, rec: rec ? { grid: Array.from(g), wins: lw.wins, scPay, expand } : null };
  }
  function play(rng, rec) {
    const b = spin(rng, rec, null);
    let total = b.total; const res = { kind: 'egypt', base: b.rec, fs: null };
    if (b.nb >= 3) { const f = fsRun(rng, rec, total); total += f.total; res.fs = rec ? f : true; }
    res.win = Math.min(total, MAX_WIN); return res;
  }
  function fsRun(rng, rec, total) {
    const special = (rng.next() * 9) | 0; // 0..8 eşit olasılık
    let left = def.fsCount, n = 0, fsTotal = 0; const spins = rec ? [] : null;
    while (left > 0 && n < 100) { left--; n++; const q = spin(rng, rec, special); fsTotal += q.total; let rt = 0; if (q.nb >= 3) { left += def.fsCount; rt = def.fsCount; } if (rec) spins.push({ ...q.rec, win: q.total, retrig: rt, left }); if (total + fsTotal >= MAX_WIN) break; }
    return { special, count: def.fsCount, spins, total: fsTotal };
  }
  function buy(rng, rec) { const f = fsRun(rng, rec, 0); return { kind: 'egypt', bought: 'fs', base: null, fs: rec ? f : true, win: Math.min(f.total, MAX_WIN) }; }
  return { play, buy, buyKinds: ['fs'], info: lineInfo(def, S) };
}

/* --- Altın Şans: 20 çizgi, wild x2, 3 BONUS = Jackpot Çarkı --- */
function goldGame(def, S) {
  const L = linesGameFactory(def, S); const wheel = picker(def.wheel.map(w => w[1]));
  const opts = { wildMult: () => 2 };
  function play(rng, rec) {
    const g = L.fill(rng, false);
    const lw = evalLines(g, L.lines, L.rows, def, S, rec, opts);
    let bon = 0; for (let i = 0; i < L.N; i++) if (g[i] === def.bonus) bon++;
    let total = lw.total; let wheelRes = null;
    if (bon >= 3) { const idx = wheel.pick(rng); const v = def.wheel[idx][0] * S; total += v; wheelRes = { idx, value: v }; }
    return { kind: 'gold', base: rec ? { grid: Array.from(g), wins: lw.wins, bonus: bon } : null, wheel: wheelRes, win: Math.min(total, MAX_WIN) };
  }
  return { play, info: { ...lineInfo(def, S), wheel: def.wheel.map(w => ({ value: +(w[0] * S).toFixed(1), weight: w[1] })) } };
}

/* --- Korsan Hazinesi: 10 çizgi + Sandık Altını (Hold & Spin) --- */
function pirateGame(def, S) {
  const L = linesGameFactory(def, S); const COIN = def.coin;
  const coinPick = picker(def.coinValues.map(c => c[1]));
  const coinVal = (rng) => def.coinValues[coinPick.pick(rng)][0];
  function play(rng, rec) {
    const g = L.fill(rng, false);
    const vals = new Int32Array(L.N);
    let coins = 0;
    for (let i = 0; i < L.N; i++) if (g[i] === COIN) { vals[i] = coinVal(rng); coins++; }
    const lw = evalLines(g, L.lines, L.rows, def, S, rec, {});
    let total = lw.total; let hold = null;
    if (coins >= def.trigger) { const h = holdRun(rng, rec, vals, coins); total += h.win; hold = rec ? h : true; }
    return { kind: 'pirate', base: rec ? { grid: Array.from(g), values: Array.from(vals), wins: lw.wins } : null, hold, win: Math.min(total, MAX_WIN) };
  }
  function holdRun(rng, rec, vals, coins) {
      const start = Array.from(vals); const steps = rec ? [] : null; let left = 3;
      while (left > 0 && coins < L.N) {
        left--; const landed = rec ? [] : null; let any = false;
        for (let i = 0; i < L.N; i++) if (!vals[i] && rng.next() < def.respinP) { vals[i] = coinVal(rng); coins++; any = true; if (rec) landed.push([i, vals[i]]); }
        if (any) left = 3;
        if (rec) steps.push({ landed, left });
      }
      let sum = 0; for (let i = 0; i < L.N; i++) sum += vals[i];
      const grand = coins === L.N;
      const win = (sum + (grand ? def.grand : 0)) * S;
      return { start, steps, coins, grand, win };
  }
  // Bonus satın alma: 6 sikkeyle doğrudan Sandık Altını
  function buy(rng, rec) {
    const g = L.fill(rng, false); const vals = new Int32Array(L.N);
    for (let i = 0; i < L.N; i++) if (g[i] === COIN) g[i] = (rng.next() * 7) | 0;
    let placed = 0; while (placed < def.trigger) { const i = (rng.next() * L.N) | 0; if (g[i] !== COIN) { g[i] = COIN; vals[i] = coinVal(rng); placed++; } }
    const h = holdRun(rng, rec, vals, placed);
    return { kind: 'pirate', bought: 'fs', base: rec ? { grid: Array.from(g), values: Array.from(vals), wins: [] } : null, hold: rec ? h : true, win: Math.min(h.win, MAX_WIN) };
  }
  return { play, buy, buyKinds: ['fs'], info: { ...lineInfo(def, S), coinValues: def.coinValues.map(c => +(c[0] * S).toFixed(2)), grand: +(def.grand * S).toFixed(0) } };
}

/* --- Vegas Meyveleri: 3x3 klasik, 7 = wild (her biri x2), YILDIZ çarkı, Ekran Dolu x10 --- */
function vegasGame(def, S) {
  const L = { rows: 3, cols: 3, N: 9 };
  const pickers = def.reelWeights.map(w => picker(w)); const wheel = picker(def.wheel.map(w => w[1]));
  const opts = { wildMult: (n) => Math.pow(2, n) };
  function play(rng, rec) {
    const g = new Int16Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) g[c * 3 + r] = pickers[c].pick(rng);
    const lw = evalLines(g, LINES3x3, 3, def, S, rec, opts);
    let total = lw.total; let full = false;
    const first = g.find(v => v !== def.wild);
    if (lw.total > 0 && first !== undefined && first !== def.star && g.every(v => v === first || v === def.wild)) { full = true; total *= 10; }
    let stars = 0; for (let i = 0; i < 9; i++) if (g[i] === def.star) stars++;
    let wheelRes = null;
    if (stars >= 3) { const idx = wheel.pick(rng); const v = def.wheel[idx][0] * S; total += v; wheelRes = { idx, value: v }; }
    return { kind: 'vegas', base: rec ? { grid: Array.from(g), wins: lw.wins, full, stars } : null, wheel: wheelRes, win: Math.min(total, MAX_WIN) };
  }
  return { play, info: { ...lineInfo(def, S), wheel: def.wheel.map(w => ({ value: +(w[0] * S).toFixed(1), weight: w[1] })) } };
}

/* ===================================================================
 * 3) 243 YOL (Ejderha Hazinesi): ateş wild'ları x1/x2/x3 (FS'de x2–x5),
 *    3+ inci = FS, her kazançlı FS spininde çarpan +1.
 * =================================================================== */
function dragonGame(def, S) {
  const rows = 3, cols = 5, N = 15, W = def.wild, SC = def.scatter, nS = def.pays.length;
  const pk = def.reelWeights.map(w => picker(w)); const wmB = picker(def.wildMultBase.map(m => m[1])); const wmF = picker(def.wildMultFs.map(m => m[1]));
  function spin(rng, fs, rec) {
    const g = new Int16Array(N), wm = new Int16Array(N);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const v = pk[c].pick(rng); g[c * 3 + r] = v; if (v === W) wm[c * 3 + r] = fs ? def.wildMultFs[wmF.pick(rng)][0] : def.wildMultBase[wmB.pick(rng)][0]; }
    let total = 0; const wins = rec ? [] : null;
    for (let s = 0; s < nS; s++) {
      if (!def.pays[s]) continue;
      let ways = 1, len = 0; const pos = rec ? [] : null;
      for (let c = 0; c < cols; c++) {
        let k = 0;
        for (let r = 0; r < rows; r++) { const i = c * 3 + r; if (g[i] === s) { k += 1; if (rec) pos.push(i); } else if (g[i] === W) { k += wm[i]; if (rec) pos.push(i); } }
        if (k === 0) break; ways *= k; len++;
      }
      const p = def.pays[s][len] || 0;
      if (p > 0) { const pay = p * ways * S; total += pay; if (rec) wins.push({ s, n: len, ways, pay, pos: pos.filter(i => ((i / 3) | 0) < len) }); }
    }
    let sc = 0; for (let i = 0; i < N; i++) if (g[i] === SC) sc++;
    const scPay = (def.scPay[Math.min(sc, 5)] || 0) * S; total += scPay;
    return { total, sc, rec: rec ? { grid: Array.from(g), wm: Array.from(wm), wins, scPay } : null };
  }
  function play(rng, rec) {
    const b = spin(rng, false, rec); let total = b.total; const res = { kind: 'dragon', base: b.rec, fs: null };
    if (b.sc >= 3) { const f = fsRun(rng, rec, total, def.fsBy[Math.min(b.sc, 5)]); total += f.total; res.fs = rec ? f : true; }
    res.win = Math.min(total, MAX_WIN); return res;
  }
  function fsRun(rng, rec, total, cnt) {
    let left = cnt, mult = 1, n = 0, fsTotal = 0; const spins = rec ? [] : null;
    while (left > 0 && n < 150) { left--; n++; const q = spin(rng, true, rec); const w = q.total * mult; fsTotal += w; const used = mult; if (q.total > 0) mult++; let rt = 0; if (q.sc >= 3) { rt = 8; left += 8; } if (rec) spins.push({ ...q.rec, win: w, mult: used, retrig: rt, left }); if (total + fsTotal >= MAX_WIN) break; }
    return { count: cnt, spins, total: fsTotal };
  }
  function buy(rng, rec) { const f = fsRun(rng, rec, 0, 10); return { kind: 'dragon', bought: 'fs', base: null, fs: rec ? f : true, win: Math.min(f.total, MAX_WIN) }; }
  return { play, buy, buyKinds: ['fs'], info: { cols, rows, syms: def.keys.map((k, i) => ({ id: i, key: k, pay: def.pays[i] ? def.pays[i].slice(3).map(p => +(p * S).toFixed(2)) : null })), scPay: def.scPay, fsBy: def.fsBy } };
}

function lineInfo(def, S) {
  return { cols: def.cols || 3, rows: def.rows || 3, lines: (def.lines || LINES3x3).length, syms: def.keys.map((k, i) => ({ id: i, key: k, pay: def.pays[i] ? def.pays[i].map(p => +(p / (def.lines || LINES3x3).length * S).toFixed(2)) : null })) };
}

/* ===================================================================
 *  OYUN TANIMLARI
 * =================================================================== */
const DEFS = {
  zeus: {
    name: 'Zeus', family: 'tumble', make: tumbleGame,
    def: {
      cols: 6, rows: 5,
      syms: [ // ağırlık, 8-9 / 10-11 / 12+ ödemeleri (bahis katı)
        { key: 'mavi', w: 26, pay: [0.25, 0.75, 2] }, { key: 'yesil', w: 25, pay: [0.4, 0.9, 4] },
        { key: 'mor', w: 24, pay: [0.5, 1, 5] }, { key: 'sari', w: 22, pay: [0.8, 1.2, 8] },
        { key: 'kirmizi', w: 20, pay: [1, 1.5, 10] }, { key: 'kupa', w: 16, pay: [1.5, 2, 12] },
        { key: 'yuzuk', w: 13, pay: [2, 5, 15] }, { key: 'kumsaati', w: 11, pay: [2.5, 10, 25] },
        { key: 'tac', w: 9, pay: [10, 25, 50] },
      ],
      scW: 2.6, scWfs: 2.2, scPay: { 4: 3, 5: 5, 6: 100 },
      multP: 0.0045, multPfs: 0.011,
      mults: [[2, 30], [3, 25], [4, 18], [5, 12], [6, 7], [8, 5], [10, 4], [12, 2.5], [15, 2], [20, 1.4], [25, 1], [50, 0.45], [100, 0.18], [250, 0.06], [500, 0.025]],
      fsCount: 15, fsRetrig: 5, progressive: false,
    },
  },
  peri: {
    name: 'Kristal Peri', family: 'tumble', make: tumbleGame,
    def: {
      cols: 6, rows: 5,
      syms: [
        { key: 'yesil', w: 27, pay: [0.25, 0.75, 2] }, { key: 'mavi', w: 25, pay: [0.4, 0.9, 4] },
        { key: 'altigen', w: 23, pay: [0.5, 1, 5] }, { key: 'kalp', w: 21, pay: [0.8, 1.2, 8] },
        { key: 'ay', w: 18, pay: [1, 1.5, 10] }, { key: 'yildiz', w: 15, pay: [1.5, 2, 12] },
        { key: 'gunes', w: 12, pay: [2, 5, 15] }, { key: 'tac', w: 10, pay: [2.5, 10, 25] },
        { key: 'asa', w: 8, pay: [10, 25, 50] },
      ],
      scW: 2.6, scWfs: 2.0, scPay: { 4: 3, 5: 5, 6: 100 },
      multP: 0.006, multPfs: 0.009,
      mults: [[2, 34], [3, 26], [4, 16], [5, 11], [6, 6], [8, 4], [10, 3], [15, 1.6], [20, 1], [25, 0.7], [50, 0.3], [100, 0.12]],
      fsCount: 15, fsRetrig: 5, progressive: true,
    },
  },
  misir: {
    name: 'Mısır Hazineleri', family: 'egypt', make: egyptGame,
    def: {
      cols: 5, rows: 3, lines: LINES20.slice(0, 10), wild: 9, highSyms: [5, 6, 7, 8],
      keys: ['10', 'J', 'Q', 'K', 'A', 'bocek', 'anubis', 'firavun', 'kasif', 'kitap'],
      // indeks = eşleşen adet; değerler çizgi bahsi katı
      pays: [[0,0,0,5,25,100],[0,0,0,5,25,100],[0,0,0,5,25,100],[0,0,0,5,40,150],[0,0,0,5,40,150],
             [0,0,5,30,100,750],[0,0,5,30,100,750],[0,0,5,40,400,2000],[0,0,10,100,1000,5000],[0,0,0,0,0,0]],
      bookPay: { 3: 2, 4: 20, 5: 200 },
      reelWeights: Array(5).fill([6, 6, 6, 5, 5, 3, 3, 2, 1.2, 1.1]),
      fsCount: 10,
    },
  },
  vegas: {
    name: 'Vegas Meyveleri', family: 'vegas', make: vegasGame,
    def: {
      wild: 8, star: 9,
      keys: ['kiraz', 'limon', 'portakal', 'erik', 'uzum', 'karpuz', 'can', 'bar', 'yedi', 'yildiz'],
      pays: [[0,0,0,4],[0,0,0,4],[0,0,0,5],[0,0,0,5],[0,0,0,10],[0,0,0,10],[0,0,0,20],[0,0,0,40],[0,0,0,250],null],
      reelWeights: Array(3).fill([9, 9, 8, 8, 6, 6, 4, 3, 1.6, 1.6]),
      wheel: [[5, 20], [8, 16], [10, 14], [15, 12], [20, 10], [30, 8], [50, 6], [75, 4], [100, 3], [200, 2], [500, 1]],
    },
  },
  ejderha: {
    name: 'Ejderha Hazinesi', family: 'ways', make: dragonGame,
    def: {
      wild: 8, scatter: 9,
      keys: ['sikke', 'fener', 'yelpaze', 'davul', 'yesim', 'kaplan', 'anka', 'ejderha', 'atesWild', 'inci'],
      // indeks = sütun uzunluğu (3,4,5); yol başına bahis katı
      pays: [[0,0,0,0.04,0.1,0.2],[0,0,0,0.04,0.1,0.2],[0,0,0,0.05,0.12,0.25],[0,0,0,0.05,0.12,0.25],
             [0,0,0,0.1,0.25,0.6],[0,0,0,0.15,0.4,0.8],[0,0,0,0.2,0.5,1.2],[0,0,0,0.25,0.75,2.5],null,null],
      reelWeights: [
        [8, 8, 7, 7, 4, 3.5, 3, 2.5, 0, 1.3],
        [8, 8, 7, 7, 4, 3.5, 3, 2.5, 1.5, 1.3],
        [8, 8, 7, 7, 4, 3.5, 3, 2.5, 1.5, 1.3],
        [8, 8, 7, 7, 4, 3.5, 3, 2.5, 1.5, 1.3],
        [8, 8, 7, 7, 4, 3.5, 3, 2.5, 0, 1.3],
      ],
      wildMultBase: [[1, 60], [2, 28], [3, 12]], wildMultFs: [[2, 45], [3, 30], [5, 25]],
      scPay: { 3: 2, 4: 10, 5: 50 }, fsBy: { 3: 8, 4: 12, 5: 20 },
    },
  },
  korsan: {
    name: 'Korsan Hazinesi', family: 'pirate', make: pirateGame,
    def: {
      cols: 5, rows: 3, lines: LINES20.slice(0, 10), wild: 7, coin: 8, trigger: 6,
      keys: ['A', 'K', 'Q', 'J', 'papagan', 'gemi', 'kaptan', 'bayrak', 'altin'],
      pays: [[0,0,0,5,15,50],[0,0,0,5,15,50],[0,0,0,5,20,60],[0,0,0,5,20,60],[0,0,0,15,50,200],[0,0,0,20,75,300],[0,0,0,30,120,600],[0,0,0,50,200,1000],null],
      reelWeights: Array(5).fill([7, 7, 7, 7, 4, 3, 2.4, 1.3, 4.3]),
      coinValues: [[1, 30], [2, 22], [3, 14], [5, 10], [8, 7], [10, 5], [15, 3.5], [20, 2.5], [25, 1.6], [50, 0.8], [150, 0.2]],
      respinP: 0.065, grand: 1000,
    },
  },
  altin: {
    name: 'Altın Şans', family: 'gold', make: goldGame,
    def: {
      cols: 5, rows: 3, lines: LINES20, wild: 8, bonus: 9,
      keys: ['kiraz', 'erik', 'portakal', 'karpuz', 'bar', 'can', 'elmas', 'yedi', 'tac', 'bonus'],
      pays: [[0,0,2,5,15,50],[0,0,0,5,15,50],[0,0,0,5,20,60],[0,0,0,10,30,100],[0,0,0,15,50,150],[0,0,0,20,75,250],[0,0,0,25,100,400],[0,0,0,50,200,1000],[0,0,0,50,200,1000],null],
      reelWeights: [
        [7, 7, 6, 5, 4, 3, 2.5, 1.5, 0.9, 1.4], [7, 7, 6, 5, 4, 3, 2.5, 1.5, 0.9, 0],
        [7, 7, 6, 5, 4, 3, 2.5, 1.5, 0.9, 1.4], [7, 7, 6, 5, 4, 3, 2.5, 1.5, 0.9, 0],
        [7, 7, 6, 5, 4, 3, 2.5, 1.5, 0.9, 1.4],
      ],
      wheel: [[10, 16], [15, 14], [20, 12], [25, 11], [30, 10], [40, 8], [50, 7], [75, 6], [100, 5], [150, 4], [250, 3], [500, 2], [1000, 1]],
    },
  },
};

const ORDER = ['zeus', 'misir', 'vegas', 'peri', 'ejderha', 'korsan', 'altin'];
// Varsayılan teorik RTP profilleri (yönetici panelinden oyun bazında değiştirilebilir, %85–%98)
const DEFAULT_RTP = { zeus: 0.965, misir: 0.95, vegas: 0.96, peri: 0.955, ejderha: 0.94, korsan: 0.945, altin: 0.95 };
const RTP_MIN = 0.85, RTP_MAX = 0.98;
const BASE_RTP = 0.95; // calibration.json katsayıları %95 içindir; ödeme tablosu RTP ile doğrusal ölçeklenir

/** cal: calibration.json içeriği; rtp: { oyun: hedefRTP } (yoksa DEFAULT_RTP) */
function buildGames(cal = {}, rtp = {}) {
  const games = {};
  for (const id of ORDER) {
    const target = rtp[id] != null ? Number(rtp[id]) : DEFAULT_RTP[id];
    const d = DEFS[id]; const S = ((cal[id] && cal[id].scale) || 1) * (target / BASE_RTP);
    const g = d.make(d.def, S);
    const buyCost = {}; for (const k of (g.buyKinds || [])) { const c = cal[id] && cal[id].buy && cal[id].buy[k]; if (c) buyCost[k] = c; }
    // Bonus satın alma fiyatı RTP'den bağımsız sabit kalır: beklenen kazanç RTP ile birlikte ölçeklendiği için satın alma RTP'si de hedef RTP olur
    games[id] = { id, name: d.name, family: d.family, rtp: target, volatility: VOL[id], scale: S, play: g.play, buy: g.buy, buyKinds: g.buyKinds || [], buyCost, info: { ...g.info, buyCost, rtp: target, volatility: VOL[id] }, cal: cal[id] || null };
  }
  return games;
}

// Simülasyonla ölçülen standart sapmaya göre volatilite sınıfı (docs/simulation-results.json)
const VOL = { zeus: 'yüksek', misir: 'orta-yüksek', vegas: 'yüksek', peri: 'orta-yüksek', ejderha: 'yüksek', korsan: 'çok yüksek', altin: 'yüksek' };


  window.SlotEngine = { buildGames: function (rtp) { return buildGames(CAL, rtp || {}); }, ORDER: ORDER, DEFAULT_RTP: DEFAULT_RTP };
})();
