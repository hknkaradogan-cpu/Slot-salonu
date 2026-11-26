// DÜZ OKEY kuralları (klasik okey): 14 taş (başlayan 15), açma yok.
// El, atılacak son taş hariç 14 taşın tamamı geçerli perlere (seri / aynı sayı farklı renk, en az 3)
// ya da 7 çifte ayrılabiliyorsa bitirilir. Okey (joker) her taşın yerini tutar; sahte okey okeyin yüzünü taşır.
// Doğrulama tamamen sunucuda yapılır; istemci yalnızca "şu taşı atarak bitir" niyetini gönderir.
import * as R from './rules.js';

/** 7 çift: aynı renk ve sayıdan ikişer (okey eşleşir). */
export function asSevenPairs(ids, K) {
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
export function partition(ids, K) {
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
export function finishGroups(rack, tile, K) {
  const i = rack.indexOf(tile); if (i < 0) return null;
  const rest = rack.slice(0, i).concat(rack.slice(i + 1)); if (rest.length !== 14) return null;
  const pairs = asSevenPairs(rest, K); if (pairs) return { kind: 'pairs', groups: pairs };
  const g = partition(rest, K); if (g && g.every(x => R.analyze(x, K))) return { kind: 'melds', groups: g };
  return null;
}
export function findFinish(rack, K) {
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
export function duzDiscard(rack, K) {
  let best = null, bv = -Infinity;
  for (const t of new Set(rack)) {
    if (K.isJoker(t)) continue;
    const r = rack.slice(); r.splice(r.indexOf(t), 1);
    const v = usefulness(r, K); if (v > bv) { bv = v; best = t; }
  }
  return best != null ? best : rack[rack.length - 1];
}
export function duzWantTake(rack, top, K) {
  if (top == null) return false;
  if (K.isJoker(top)) return true;
  const r = rack.concat(top); if (findFinish(r, K)) return true;
  return usefulness(r, K) - usefulness(rack, K) >= 4.5;
}
