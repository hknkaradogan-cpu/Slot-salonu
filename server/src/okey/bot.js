// 101 Okey botu: kurallara uygun, makul derecede iyi oynar (açmayı hedefler, cezalı taş atmaz, işler, okey alır).
import * as R from './rules.js';
import { openThreshold } from './table.js';

const prevSeat = (s) => (s + 3) % 4;

function pairsPlan(T, s, rack, k) {
  const op = T.hand.opened[s]; if (op) return op.route === 'pairs';
  const bp = R.bestPairs(rack, k); if (bp.count < 4) return false;
  return R.bestMelds(rack, k).value < 70;
}

function wantTake(T, s, top, k) {
  const H = T.hand, rack = H.racks[s], op = H.opened[s];
  if (k.isJoker(top)) return true; // okey her zaman işe yarar (atılan okey zaten alınamaz)
  const withTop = [...rack, top];
  if (!op) {
    if (pairsPlan(T, s, withTop, k)) { const bp = R.bestPairs(withTop, k); return bp.count >= openThreshold(T, s, 'pairs') && bp.used.has(top) && bp.used.size < withTop.length; }
    const bm = R.bestMelds(withTop, k); return bm.value >= openThreshold(T, s, 'points') && bm.used.has(top) && bm.used.size < withTop.length;
  }
  if (R.isCommittable(top, H.melds, k)) return true;
  if (op.route === 'points') return R.bestMelds(withTop, k).used.has(top);
  return false;
}

/** Açılış grupları; elde atılacak en az bir taş kalacak şekilde. */
function openingGroups(rack, melds, k) {
  const used = melds.flat(); if (used.length < rack.length) return melds;
  // tüm taşlar kullanılıyorsa: 4'lü perden ya da uzun serinin ucundan bir taş eksilt
  const g = melds.map(m => m.slice());
  for (const m of g) { const a = R.analyze(m, k); if (a && a.kind === 'set' && m.length === 4) { m.pop(); return g; } }
  for (const m of g) { const a = R.analyze(m, k); if (a && a.kind === 'run' && m.length > 3) { const t = a.tiles; return g.map(x => (x === m ? t.slice(0, -1).map(z => z.id) : x)); } }
  g.sort((a, b) => a.length - b.length); g.shift(); return g;
}

function tryOpen(T, s, k, act) {
  const H = T.hand, rack = H.racks[s];
  const mustUse = H.took ? H.took.id : null;
  if (pairsPlan(T, s, rack, k)) {
    const bp = R.bestPairs(rack, k); let pairs = bp.pairs;
    if (pairs.flat().length >= rack.length) pairs = pairs.slice(0, -1);
    if (pairs.length >= openThreshold(T, s, 'pairs') && (mustUse == null || pairs.flat().includes(mustUse))) { act({ type: 'open', route: 'pairs', groups: pairs }); return true; }
  }
  const bm = R.bestMelds(rack, k);
  if (bm.value < openThreshold(T, s, 'points')) return false;
  const groups = openingGroups(rack, bm.melds, k);
  const val = groups.reduce((a, g) => { const x = R.analyze(g, k); return a + (x ? x.value : 0); }, 0);
  if (val < openThreshold(T, s, 'points')) return false;
  if (mustUse != null && !groups.flat().includes(mustUse)) return false;
  act({ type: 'open', route: 'points', groups }); return true;
}

function layAndAdd(T, s, k, act) {
  const H = T.hand, rack = H.racks[s], op = H.opened[s];
  for (let loop = 0; loop < 30 && rack.length > 1; loop++) {
    let did = false;
    // 1) okeyi masadan al (gerçek taşı elimizdeyse)
    for (const m of H.melds) {
      const ix = m.tiles.findIndex(t => t.j); if (ix < 0) continue;
      const real = rack.find(id => R.canRetrieve(m, ix, id, k));
      if (real != null) { act({ type: 'retrieve', meld: m.id, index: ix, tile: real }); did = true; break; }
    }
    if (did) continue;
    // 2) yeni perler / çiftler
    if (op.route === 'points') {
      const bm = R.bestMelds(rack, k);
      for (const g of bm.melds) { if (rack.length - g.length < 1) continue; act({ type: 'lay', group: g }); did = true; break; }
    }
    if (did) continue;
    if (H.opened.some(o => o && o.route === 'pairs')) {
      const bp = R.bestPairs(rack.filter(id => !k.isJoker(id)), k);
      if (bp.pairs.length && rack.length > 2) { act({ type: 'lay', group: bp.pairs[0] }); did = true; continue; }
    }
    // 3) işleme (okey hariç; okey eli bitirirken atılırsa ödül katlanır)
    for (const id of rack) {
      if (k.isJoker(id) || rack.length <= 1) continue;
      const m = H.melds.find(x => R.addToMeld(x, id, k) !== null);
      if (m) { act({ type: 'add', tile: id, meld: m.id }); did = true; break; }
    }
    if (!did) break;
  }
}

export function botTurn(T, s, act) {
  const H = T.hand, k = R.kit(H.okey);
  if (H.phase === 'draw') {
    const d = H.discards[prevSeat(s)], top = d[d.length - 1];
    if (top != null && !H.okeyBlocked && wantTake(T, s, top, k)) act({ type: 'take' });
    else { act({ type: 'draw' }); if (T.status !== 'playing' || T.hand !== H) return {}; }
  }
  if (!H.opened[s]) tryOpen(T, s, k, act);
  if (H.opened[s]) layAndAdd(T, s, k, act);
  if (H.took && H.racks[s].includes(H.took.id)) {
    if (!H.laidThisTurn) { act({ type: 'return' }); act({ type: 'draw' }); if (T.status !== 'playing' || T.hand !== H) return {}; }
  }
  if (T.status !== 'playing' || T.hand !== H || H.turn !== s) return {};
  return act({ type: 'discard', tile: botDiscard(T, s), force: true });
}

/** Atılacak taş: okey ve işlenebilir (cezalı) taşlardan kaçınır, en az işe yarayan taşı seçer. */
export function botDiscard(T, s) {
  const H = T.hand, k = R.kit(H.okey), rack = H.racks[s];
  if (rack.length === 1) return rack[0];
  const took = H.took ? H.took.id : null;
  const safe = rack.filter(id => !k.isJoker(id) && id !== took && !R.isCommittable(id, H.melds, k));
  let cands = safe.length ? safe : rack.filter(id => !k.isJoker(id) && id !== took);
  if (!cands.length) cands = rack.slice();
  const opened = !!H.opened[s];
  // eli bitirebiliyorsa: son taş okey ise okeyi at (ödül katlanır)
  if (rack.length === 2 && rack.some(k.isJoker) && opened) { const other = rack.find(id => !k.isJoker(id)); if (other != null && R.isCommittable(other, H.melds, k)) return rack.find(k.isJoker); }
  const faces = rack.map(id => ({ id, f: k.face(id), j: k.isJoker(id) }));
  const conn = (id) => {
    const f = k.face(id); let c = 0;
    for (const o of faces) { if (o.id === id) continue; if (o.j) { c += 0.5; continue; }
      if (o.f.c === f.c && Math.abs(o.f.n - f.n) <= 2 && o.f.n !== f.n) c += o.f.n === f.n + 1 || o.f.n === f.n - 1 ? 2 : 1;
      if (o.f.n === f.n && o.f.c !== f.c) c += 1.5; if (o.f.n === f.n && o.f.c === f.c) c += pairsPlan(T, s, rack, k) ? 3 : 0.5; }
    return c;
  };
  let pool;
  if (pairsPlan(T, s, rack, k)) { const bp = R.bestPairs(rack, k); pool = cands.filter(id => !bp.used.has(id)); }
  else { const bm = R.bestMelds(rack, k); pool = cands.filter(id => !bm.used.has(id)); }
  if (!pool.length) pool = cands;
  pool.sort((a, b) => conn(a) - conn(b) || (opened ? k.face(b).n - k.face(a).n : k.face(a).n - k.face(b).n));
  return pool[0];
}
