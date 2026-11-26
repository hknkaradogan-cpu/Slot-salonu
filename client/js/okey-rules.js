/* OTOMATİK ÜRETİLDİ: server/tools/build-okey-rules.js — elle düzenlemeyin */
(function () {
// 101 Okey kuralları — saf fonksiyonlar (sunucu, bot ve testler ortak kullanır).
// Taş kimlikleri: 0..103 = (renk*13 + (sayı-1))*2 + kopya; 104, 105 = sahte okey.
// Renkler: 0 kırmızı, 1 sarı, 2 mavi, 3 siyah.

const COLORS = ['kırmızı', 'sarı', 'mavi', 'siyah'];
const FAKES = [104, 105];
const tileColor = (id) => (id >= 104 ? -1 : Math.floor(id / 26));
const tileNum = (id) => (id >= 104 ? 0 : Math.floor((id % 26) / 2) + 1);
const OPEN_POINTS = 101, OPEN_PAIRS = 5, SILER_POINTS = 150, SILER_PAIRS = 7;

/** Gösterge taşından okeyi bulur: aynı renk, bir büyük sayı (13 → 1). */
function okeyOf(indicator) { const c = tileColor(indicator), n = tileNum(indicator); return { c, n: n === 13 ? 1 : n + 1 }; }

/** Bir el için yardımcılar: okey (joker) mi, taşın yüzü (sahte okey okeyin yerini tutar). */
function kit(okey) {
  const isJoker = (id) => id < 104 && tileColor(id) === okey.c && tileNum(id) === okey.n;
  const face = (id) => (id >= 104 ? { c: okey.c, n: okey.n } : { c: tileColor(id), n: tileNum(id) });
  return { okey, isJoker, face };
}

function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const fullDeck = () => Array.from({ length: 106 }, (_, i) => i);

/* ---------------- per doğrulama ---------------- */
function runFromOrder(ids, K) {
  let start = null, color = null;
  for (let i = 0; i < ids.length; i++) {
    if (K.isJoker(ids[i])) continue;
    const f = K.face(ids[i]);
    if (color === null) color = f.c; else if (f.c !== color) return null;
    const s = f.n - i; if (start === null) start = s; else if (s !== start) return null;
  }
  if (color === null || start < 1 || start + ids.length - 1 > 13) return null;
  return ids.map((id, i) => ({ id, c: color, n: start + i, j: K.isJoker(id) }));
}
function runCanonical(ids, K) {
  const js = ids.filter(K.isJoker), nj = ids.filter(id => !K.isJoker(id)); if (!nj.length) return null;
  const color = K.face(nj[0]).c; if (nj.some(id => K.face(id).c !== color)) return null;
  const sorted = nj.slice().sort((a, b) => K.face(a).n - K.face(b).n);
  for (let i = 1; i < sorted.length; i++) if (K.face(sorted[i]).n === K.face(sorted[i - 1]).n) return null;
  const lo = K.face(sorted[0]).n, hi = K.face(sorted[sorted.length - 1]).n;
  const gaps = hi - lo + 1 - sorted.length; if (gaps > js.length) return null;
  let extra = js.length - gaps, start = lo, end = hi; while (extra > 0 && end < 13) { end++; extra--; } while (extra > 0 && start > 1) { start--; extra--; } if (extra > 0) return null;
  const out = []; let jk = 0; const byN = new Map(sorted.map(id => [K.face(id).n, id]));
  for (let n = start; n <= end; n++) { if (byN.has(n)) out.push({ id: byN.get(n), c: color, n, j: false }); else out.push({ id: js[jk++], c: color, n, j: true }); }
  return out;
}
function asRun(ids, K) {
  if (ids.length < 3 || ids.length > 13) return null;
  return runFromOrder(ids, K) || runFromOrder(ids.slice().reverse(), K) || runCanonical(ids, K);
}
function asSet(ids, K) {
  if (ids.length < 3 || ids.length > 4) return null;
  const nj = ids.filter(id => !K.isJoker(id)); if (!nj.length) return null;
  const n = K.face(nj[0]).n, cs = new Set();
  for (const id of nj) { const f = K.face(id); if (f.n !== n || cs.has(f.c)) return null; cs.add(f.c); }
  const missing = [0, 1, 2, 3].filter(c => !cs.has(c)); let k = 0;
  return ids.map(id => (K.isJoker(id) ? { id, c: missing[k++], n, j: true } : { id, ...K.face(id), j: false })).sort((a, b) => a.c - b.c);
}
function asPair(ids, K) {
  if (ids.length !== 2) return null;
  const [a, b] = ids, ja = K.isJoker(a), jb = K.isJoker(b);
  if (ja && jb) return [{ id: a, ...K.okey, j: true }, { id: b, ...K.okey, j: true }];
  if (ja || jb) { const f = K.face(ja ? b : a); return [{ id: a, ...f, j: ja }, { id: b, ...f, j: jb }]; }
  const fa = K.face(a), fb = K.face(b); if (fa.c !== fb.c || fa.n !== fb.n) return null;
  return [{ id: a, ...fa, j: false }, { id: b, ...fb, j: false }];
}
/** Bir taş grubunu per olarak çözümler. hint: 'run' | 'set' | 'pair'. */
function analyze(ids, K, hint) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return null;
  if (hint === 'pair' || ids.length === 2) { const t = asPair(ids, K); return t ? { kind: 'pair', tiles: t, value: 0 } : null; }
  const tryRun = () => { const t = asRun(ids, K); return t && { kind: 'run', tiles: t, value: t.reduce((a, x) => a + x.n, 0) }; };
  const trySet = () => { const t = asSet(ids, K); return t && { kind: 'set', tiles: t, value: t.reduce((a, x) => a + x.n, 0) }; };
  if (hint === 'set') return trySet() || tryRun();
  if (hint === 'run') return tryRun() || trySet();
  const r = tryRun(), s = trySet(); if (r && s) return r.value >= s.value ? r : s; return r || s;
}

/* ---------------- işleme / okey alma ---------------- */
/** Masadaki pere taş eklemeyi dener; yeni taş listesini döner (geçersizse null). side: 'L' | 'R' (seride). */
function addToMeld(meld, id, K, side) {
  const t = meld.tiles, j = K.isJoker(id);
  if (meld.kind === 'run') {
    const c = t[0].c, lo = t[0].n, hi = t[t.length - 1].n;
    const left = () => (lo > 1 ? [{ id, c, n: lo - 1, j }, ...t] : null), right = () => (hi < 13 ? [...t, { id, c, n: hi + 1, j }] : null);
    if (j) return side === 'L' ? left() : side === 'R' ? right() : (right() || left());
    const f = K.face(id); if (f.c !== c) return null;
    if (f.n === lo - 1) return left(); if (f.n === hi + 1) return right(); return null;
  }
  if (meld.kind === 'set') {
    if (t.length >= 4) return null; const n = t[0].n, have = new Set(t.map(x => x.c));
    if (j) { const c = [0, 1, 2, 3].find(x => !have.has(x)); return [...t, { id, c, n, j: true }].sort((a, b) => a.c - b.c); }
    const f = K.face(id); if (f.n !== n || have.has(f.c)) return null;
    return [...t, { id, ...f, j: false }].sort((a, b) => a.c - b.c);
  }
  return null; // çiftlere taş eklenmez
}
/** Atılan taş masadaki bir pere işlenebiliyor mu (okey hariç). */
function isCommittable(id, melds, K) {
  if (K.isJoker(id)) return false;
  return melds.some(m => addToMeld(m, id, K) !== null);
}
/** Masadaki okeyi gerçek taşıyla değiştirme. Perde 4 renk tamamlanmış olmalı. */
function canRetrieve(meld, index, realId, K) {
  const slot = meld.tiles[index]; if (!slot || !slot.j || K.isJoker(realId)) return false;
  if (meld.kind === 'pair') return false;
  if (meld.kind === 'set' && meld.tiles.length < 4) return false;
  const f = K.face(realId); return f.c === slot.c && f.n === slot.n;
}

/* ---------------- en iyi diziliş (bot + "Seri Diz" yardımı) ---------------- */
/** Eldeki taşlarla en yüksek puanlı per kümesini bulur. Döner: { value, melds: [ids[]], used: Set } */
function bestMelds(hand, K) {
  const pools = Array.from({ length: 52 }, () => []); const jokers = [];
  for (const id of hand) { if (K.isJoker(id)) jokers.push(id); else { const f = K.face(id); pools[f.c * 13 + f.n - 1].push(id); } }
  const cnt = pools.map(p => p.length);
  const memo = new Map();
  function best(J) {
    let i = 0; while (i < 52 && cnt[i] === 0) i++;
    if (i === 52) return { v: 0, m: null };
    const key = cnt.join('') + J; const hit = memo.get(key); if (hit) return hit;
    const c = Math.floor(i / 13), n = (i % 13) + 1;
    cnt[i]--; let res = best(J); cnt[i]++;
    // seriler: altında k okey, sonra yukarı doğru
    for (let k = 0; k <= Math.min(J, n - 1); k++) {
      const s = n - k; cnt[i]--; let jU = k; const elems = []; for (let x = 0; x < k; x++) elems.push(-1); elems.push(i);
      const taken = [];
      let v = n;
      for (;;) {
        const len = v - s + 1;
        if (len >= 3) { const sub = best(J - jU); const val = (s + v) * len / 2 + sub.v; if (val > res.v) res = { v: val, m: { e: { kind: 'run', c, s, elems: elems.slice() }, next: sub.m } }; }
        if (v === 13) break; const ni = c * 13 + v; // v+1 indeksi
        if (cnt[ni] > 0) { cnt[ni]--; taken.push(ni); elems.push(ni); } else if (jU < J) { jU++; elems.push(-1); } else break;
        v++;
      }
      for (const t of taken) cnt[t]++; cnt[i]++;
    }
    // aynı sayılı per: daha büyük renk indeksleri + okeyler
    const others = []; for (let c2 = c + 1; c2 < 4; c2++) if (cnt[c2 * 13 + n - 1] > 0) others.push(c2 * 13 + n - 1);
    for (let mask = 0; mask < (1 << others.length); mask++) {
      const sub = others.filter((_, b) => mask & (1 << b));
      for (let jk = 0; jk <= J; jk++) {
        const size = 1 + sub.length + jk; if (size < 3 || size > 4) continue;
        cnt[i]--; sub.forEach(x => cnt[x]--);
        const r2 = best(J - jk); const val = n * size + r2.v;
        if (val > res.v) res = { v: val, m: { e: { kind: 'set', n, elems: [i, ...sub, ...Array(jk).fill(-1)] }, next: r2.m } };
        cnt[i]++; sub.forEach(x => cnt[x]++);
      }
    }
    memo.set(key, res); return res;
  }
  const r = best(jokers.length);
  // soyut çözümü taş kimliklerine çevir
  const p = pools.map(x => x.slice()), jk = jokers.slice(), melds = [], used = new Set();
  for (let m = r.m; m; m = m.next) {
    const ids = m.e.elems.map(e => (e < 0 ? jk.shift() : p[e].shift()));
    if (m.e.kind === 'set') { /* okeyler sonda; sıra önemli değil */ }
    ids.forEach(id => used.add(id)); melds.push(ids);
  }
  return { value: r.v, melds, used };
}
/** Çift diziliş: aynı taş ikilileri + okeyle tamamlanan çiftler. */
function bestPairs(hand, K) {
  const groups = new Map(), jokers = [];
  for (const id of hand) { if (K.isJoker(id)) { jokers.push(id); continue; } const f = K.face(id), k = f.c * 13 + f.n; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); }
  const pairs = [], singles = [];
  for (const ids of groups.values()) { if (ids.length >= 2) pairs.push([ids[0], ids[1]]); if (ids.length === 1) singles.push(ids[0]); }
  singles.sort((a, b) => K.face(b).n - K.face(a).n);
  while (jokers.length && singles.length) pairs.push([singles.shift(), jokers.shift()]);
  while (jokers.length >= 2) pairs.push([jokers.shift(), jokers.shift()]);
  const used = new Set(pairs.flat());
  return { count: pairs.length, pairs, used };
}

/** Elde kalan taşların ceza değeri: yüz değerleri (çift açana 2 kat) + her okey için 101. */
function leftoverPenalty(rack, K, pairsOpener) {
  let face = 0, ok = 0; for (const id of rack) { if (K.isJoker(id)) ok++; else face += K.face(id).n; }
  return face * (pairsOpener ? 2 : 1) + ok * 101;
}

const R = { analyze };
// DÜZ OKEY kuralları (klasik okey): 14 taş (başlayan 15), açma yok.
// El, atılacak son taş hariç 14 taşın tamamı geçerli perlere (seri / aynı sayı farklı renk, en az 3)
// ya da 7 çifte ayrılabiliyorsa bitirilir. Okey (joker) her taşın yerini tutar; sahte okey okeyin yüzünü taşır.
// Doğrulama tamamen sunucuda yapılır; istemci yalnızca "şu taşı atarak bitir" niyetini gönderir.


/** 7 çift: aynı renk ve sayıdan ikişer (okey eşleşir). */
function asSevenPairs(ids, K) {
  if (ids.length !== 14) return null;
  const js = ids.filter(K.isJoker); const by = new Map();
  for (const id of ids) { if (K.isJoker(id)) continue; const f = K.face(id), k = f.c * 16 + f.n; if (!by.has(k)) by.set(k, []); by.get(k).push(id); }
  const pairs = []; const singles = [];
  for (const arr of by.values()) { while (arr.length >= 2) pairs.push([arr.pop(), arr.pop()]); if (arr.length) singles.push(arr.pop()); }
  if (singles.length > js.length) return null;
  const jj = js.slice(); for (const s of singles) pairs.push([s, jj.pop()]);
  while (jj.length >= 2) pairs.push([jj.pop(), jj.pop()]);
  return pairs.length === 7 ? pairs : null;
}

/** 14 taşı perlere tam olarak bölmeyi dener (geri izleme). Bulursa grup listesi döner. */
function partition(ids, K) {
  const jokers = ids.filter(K.isJoker);
  const rest = ids.filter(id => !K.isJoker(id)).map(id => ({ id, ...K.face(id) })).sort((a, b) => a.n - b.n || a.c - b.c);
  const out = [];
  function go(tiles, js) {
    if (!tiles.length) {
      if (!js.length) return true;
      return false; // tek başına kalan okeyler per oluşturamaz (en az bir gerçek taş gerekir)
    }
    const t = tiles[0], others = tiles.slice(1);
    // 1) aynı sayı, farklı renk (3–4)
    const same = others.filter(x => x.n === t.n && x.c !== t.c);
    const byColor = new Map(); for (const x of same) if (!byColor.has(x.c)) byColor.set(x.c, x);
    const cand = [...byColor.values()];
    for (let mask = 0; mask < (1 << cand.length); mask++) {
      const pick = cand.filter((_, i) => mask & (1 << i));
      for (let useJ = 0; useJ <= Math.min(js.length, 3); useJ++) {
        const size = 1 + pick.length + useJ; if (size < 3 || size > 4) continue;
        const used = new Set(pick.map(x => x.id));
        out.push([t.id, ...pick.map(x => x.id), ...js.slice(0, useJ)]);
        if (go(others.filter(x => !used.has(x.id)), js.slice(useJ))) return true;
        out.pop();
      }
    }
    // 2) seri: t'nin rengi; t serinin en küçük GERÇEK taşı (öncesinde okey olabilir)
    for (let before = 0; before <= js.length && t.n - before >= 1; before++) {
      let pool = others.filter(x => x.c === t.c); const grp = [t.id]; let jl = js.length - before; const jUsed = js.slice(0, before); let jIdx = before;
      grp.unshift(...jUsed);
      let n = t.n + 1, len = 1 + before;
      const usedIds = new Set();
      while (n <= 13) {
        const hit = pool.find(x => x.n === n && !usedIds.has(x.id));
        if (hit) { grp.push(hit.id); usedIds.add(hit.id); }
        else if (jl > 0) { grp.push(js[jIdx++]); jl--; }
        else break;
        len++; n++;
        if (len >= 3) {
          out.push(grp.slice());
          if (go(others.filter(x => !usedIds.has(x.id)), js.slice(jIdx))) return true;
          out.pop();
        }
      }
    }
    return false;
  }
  return go(rest, jokers) ? out.map(g => g.slice()) : null;
}

/** Rack (15 taş) içinden "tile" atılınca kalan 14 taşla el biter mi? */
function finishGroups(rack, tile, K) {
  const i = rack.indexOf(tile); if (i < 0) return null;
  const rest = rack.slice(0, i).concat(rack.slice(i + 1)); if (rest.length !== 14) return null;
  const pairs = asSevenPairs(rest, K); if (pairs) return { kind: 'pairs', groups: pairs };
  const g = partition(rest, K); if (g && g.every(x => R.analyze(x, K))) return { kind: 'melds', groups: g };
  return null;
}
function findFinish(rack, K) {
  // önce okey olmayan taşla bitirmeyi dene; okey atarak bitirmek (çift puan) bot tarafından da tercih edilir
  const order = rack.slice().sort((a, b) => (K.isJoker(b) ? 1 : 0) - (K.isJoker(a) ? 1 : 0));
  for (const t of order) { const r = finishGroups(rack, t, K); if (r) return { tile: t, ...r }; }
  return null;
}

/* ------------------- bot ------------------- */
/** Elin "bitmeye yakınlığı": perlerde kullanılabilen taş sayısı (basit sezgisel). */
function usefulness(rack, K) {
  const js = rack.filter(K.isJoker).length; let score = js * 3;
  const f = rack.filter(id => !K.isJoker(id)).map(id => K.face(id));
  for (let i = 0; i < f.length; i++) {
    let s = 0;
    for (let j = 0; j < f.length; j++) {
      if (i === j) continue; const a = f[i], b = f[j];
      if (a.n === b.n && a.c !== b.c) s += 2;
      if (a.c === b.c && Math.abs(a.n - b.n) === 1) s += 2.2;
      if (a.c === b.c && Math.abs(a.n - b.n) === 2) s += 0.8;
      if (a.c === b.c && a.n === b.n) s += 0.9; // çift
    }
    score += Math.min(s, 6);
  }
  return score;
}
function duzDiscard(rack, K) {
  let best = null, bv = -Infinity;
  for (const t of new Set(rack)) {
    if (K.isJoker(t)) continue;
    const r = rack.slice(); r.splice(r.indexOf(t), 1);
    const v = usefulness(r, K); if (v > bv) { bv = v; best = t; }
  }
  return best != null ? best : rack[rack.length - 1];
}
function duzWantTake(rack, top, K) {
  if (top == null) return false;
  if (K.isJoker(top)) return true;
  const r = rack.concat(top); if (findFinish(r, K)) return true;
  return usefulness(r, K) - usefulness(rack, K) >= 4.5;
}

  window.OkeyRules = { COLORS, FAKES, tileColor, tileNum, OPEN_POINTS, okeyOf, kit, shuffle, fullDeck, asRun, asSet, asPair, analyze, addToMeld, isCommittable, canRetrieve, bestMelds, bestPairs, leftoverPenalty, asSevenPairs, partition, finishGroups, findFinish, duzDiscard, duzWantTake };
})();
