// TAVLA kuralları — saf fonksiyonlar (sunucu, bot, istemci aynı dosyayı kullanır).
// Tahta: pts[0..23] = 1..24 numaralı haneler (beyazın bakışıyla). Pozitif = beyaz (oyuncu 0), negatif = siyah (oyuncu 1).
// Beyaz 24→1 yönünde oynar, evi 1–6; siyah 1→24 yönünde, evi 19–24. bar[p] = kırık pul, off[p] = toplanan pul.
// Hamleler oyuncuya göre GÖRELİ hanelerle ifade edilir: 25 = bar (giriş), 1..24 = hane, 0 = dışarı (toplama).

export const START = (() => { const p = Array(24).fill(0); p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5; p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5; return p; })();
export const newBoard = () => ({ pts: START.slice(), bar: [0, 0], off: [0, 0] });
export const clone = (b) => ({ pts: b.pts.slice(), bar: b.bar.slice(), off: b.off.slice() });
const sgn = (p) => (p === 0 ? 1 : -1);
/** göreli hane (1..24) → mutlak dizin */
export const abs = (p, r) => (p === 0 ? r - 1 : 24 - r);
/** p oyuncusunun göreli r hanesindeki pul sayısı (rakipse negatif) */
export const own = (b, p, r) => b.pts[abs(p, r)] * sgn(p);

export function allHome(b, p) {
  if (b.bar[p]) return false;
  for (let r = 7; r <= 24; r++) if (own(b, p, r) > 0) return false;
  return true;
}
/** Tek zarla tek pul hareketi geçerli mi? Geçerliyse yeni tahta döner. */
export function moveOne(b, p, from, die) {
  if (b.bar[p] && from !== 25) return null;
  if (from === 25) { if (!b.bar[p]) return null; }
  else if (from < 1 || from > 24 || own(b, p, from) <= 0) return null;
  let to = from - die;
  if (to <= 0) {
    if (!allHome(b, p)) return null;
    if (to < 0) { for (let r = from + 1; r <= 6; r++) if (own(b, p, r) > 0) return null; } // büyük zarla yalnızca en uzaktaki pul toplanır
    to = 0;
  } else if (own(b, p, to) < -1) return null; // rakibin kapısı
  const n = clone(b), s = sgn(p);
  if (from === 25) n.bar[p]--; else n.pts[abs(p, from)] -= s;
  let hit = false;
  if (to === 0) n.off[p]++;
  else { const i = abs(p, to); if (n.pts[i] * s === -1) { n.pts[i] = 0; n.bar[1 - p]++; hit = true; } n.pts[i] += s; }
  return { board: n, to, hit };
}
const key = (b) => b.pts.join(',') + '|' + b.bar.join(',') + '|' + b.off.join(',');
export const boardKey = key;

/** Bütün geçerli hamle dizileri (kurallar: mümkün olan en çok zarı oyna; tek zar oynanabiliyorsa büyük olanı). */
export function legalSequences(b, p, dice) {
  const ds = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
  const res = new Map(); let best = 0, bestDie = 0;
  function rec(bd, left, seq) {
    let moved = false;
    const tried = new Set();
    for (let i = 0; i < left.length; i++) {
      const d = left[i]; if (tried.has(d)) continue; tried.add(d);
      const froms = bd.bar[p] ? [25] : [];
      if (!froms.length) for (let r = 24; r >= 1; r--) if (own(bd, p, r) > 0) froms.push(r);
      for (const f of froms) {
        const m = moveOne(bd, p, f, d); if (!m) continue; moved = true;
        rec(m.board, left.slice(0, i).concat(left.slice(i + 1)), seq.concat([[f, m.to, d]]));
      }
    }
    if (!moved) {
      const len = seq.length, big = len === 1 ? seq[0][2] : 0;
      if (len > best || (len === best && len === 1 && big > bestDie)) { best = len; bestDie = big; res.clear(); }
      if (len === best && (len !== 1 || big === bestDie || ds.length > 2)) { const k = key(bd); if (!res.has(k)) res.set(k, { seq, board: bd }); }
    }
  }
  rec(b, ds, []);
  if (best === 0) return [];
  return [...res.values()];
}
/** İstemcinin gönderdiği diziyi doğrular; geçerliyse sonuç tahtasını döner. */
export function applySequence(b, p, dice, seq) {
  const legal = legalSequences(b, p, dice);
  if (!legal.length) return seq.length === 0 ? { board: b, hits: 0 } : null;
  if (!Array.isArray(seq) || seq.length !== legal[0].seq.length) return null;
  const left = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
  let bd = b, hits = 0;
  for (const st of seq) {
    if (!Array.isArray(st) || st.length < 2) return null;
    const [f, t] = st; let done = false;
    for (let i = 0; i < left.length && !done; i++) {
      const m = moveOne(bd, p, f, left[i]);
      if (m && m.to === t) { bd = m.board; hits += m.hit ? 1 : 0; left.splice(i, 1); done = true; }
    }
    if (!done) return null;
  }
  const k = key(bd); if (!legal.some(x => key(x.board) === k)) return null;
  return { board: bd, hits };
}
export function pips(b, p) {
  let s = b.bar[p] * 25; for (let r = 1; r <= 24; r++) { const c = own(b, p, r); if (c > 0) s += c * r; } return s;
}
export const winner = (b) => (b.off[0] === 15 ? 0 : b.off[1] === 15 ? 1 : -1);
/** Mars: kaybeden hiç pul toplamadıysa 2 puan. */
export const gamePoints = (b, w) => (b.off[1 - w] === 0 ? 2 : 1);

/* ---------------- bot ---------------- */
function evalBoard(b, p) {
  const o = 1 - p;
  let v = (pips(b, o) - pips(b, p)) * 1.0 + b.off[p] * 6 + b.bar[o] * 14;
  for (let r = 1; r <= 24; r++) {
    const c = own(b, p, r);
    if (c === 1) { // açık pul: rakibin vurma ihtimaline göre ceza
      let threat = 0; for (let q = 1; q <= 24; q++) { const oc = -own(b, p, q); if (oc > 0 && q > r) { const d = q - r; if (d <= 6) threat += 11 - d; else if (d <= 12) threat += 2; } }
      if (b.bar[o]) threat += r >= 19 ? 8 : 0;
      v -= threat * (r <= 6 ? 0.9 : 0.6) + (allHome(b, p) ? 0 : 1);
    } else if (c >= 2) v += r <= 6 ? 5 : r <= 9 ? 3 : 1.5;
  }
  return v;
}
export function botChoose(b, p, dice) {
  const L = legalSequences(b, p, dice); if (!L.length) return [];
  let best = L[0], bv = -Infinity;
  for (const x of L) { const v = evalBoard(x.board, p) + Math.random() * 0.4; if (v > bv) { bv = v; best = x; } }
  return best.seq.map(s => [s[0], s[1]]);
}
