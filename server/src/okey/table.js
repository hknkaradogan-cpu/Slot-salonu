// 101 Okey masa durum makinesi. Durum tamamen JSON'dur (veritabanında saklanır).
// Tüm hamleler sunucuda doğrulanır; istemci yalnızca niyet gönderir.
import * as R from './rules.js';
import { botTurn, botDiscard } from './bot.js';

export const TURN_MS = 30000, BOT_MIN_MS = 1100, BOT_MAX_MS = 2600, ROUND_PAUSE_MS = 9000, FILL_BOTS_MS = 20000;
export const BOT_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Burak', 'Selin', 'Hakan', 'Derya', 'Kerem', 'Merve', 'Oğuz', 'Gizem', 'Serkan', 'Ece', 'Tolga', 'Pınar', 'Cem', 'Ebru', 'Murat'];

const next = (s) => (s + 1) % 4, prev = (s) => (s + 3) % 4;
export const partner = (s) => (s + 2) % 4;
export class OkeyError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new OkeyError(code, msg); };

export function newTable(cfg, now) {
  const bots = cfg.bots !== false, fillMs = cfg.fillMs || FILL_BOTS_MS;
  return { cfg: { mode: cfg.mode === 'esli' ? 'esli' : 'tekli', rounds: cfg.rounds || 1, katlamali: cfg.katlamali !== false, stake: cfg.stake || 0, private: !!cfg.private, turnMs: cfg.turnMs || TURN_MS, bots },
    status: 'waiting', seats: [null, null, null, null], round: 0, startSeat: Math.floor(Math.random() * 4), totals: [0, 0, 0, 0], history: [], hand: null,
    createdAt: now, fillAt: cfg.private || !bots ? null : now + fillMs, deadline: null, botAt: null, seq: 0, chat: [] };
}
/** Masadan ayrılmış (ya da bağlantısı kopmuş) oyuncu aynı koltuğa geri döner; bot yerine tekrar kendisi oynar. */
export function rejoin(T, uid) {
  const s = T.seats.findIndex(x => x && x.uid === uid); if (s < 0) fail('no_seat', 'Bu masada koltuğun yok.');
  if (T.status === 'finished' || T.status === 'abandoned') fail('table_over', 'Bu masadaki oyun bitti.');
  const x = T.seats[s]; x.left = false; x.away = false; x.timeouts = 0; T.seq++;
  if (T.status === 'playing' && T.hand.turn === s) T.botAt = null;
  return s;
}
export function seatHuman(T, user, seat) {
  if (T.status !== 'waiting') fail('table_started', 'Oyun başladı.');
  const s = seat != null ? seat : T.seats.findIndex(x => !x);
  if (s < 0 || T.seats[s]) fail('table_full', 'Masa dolu.');
  T.seats[s] = { uid: user.id, name: user.username, avatar: user.avatar || 0, level: user.level || 1, bot: false, left: false, away: false, timeouts: 0 };
  return s;
}
export function fillBots(T, rnd = Math.random) {
  const used = new Set(T.seats.filter(Boolean).map(s => s.name));
  for (let i = 0; i < 4; i++) if (!T.seats[i]) {
    let name; do { name = BOT_NAMES[Math.floor(rnd() * BOT_NAMES.length)]; } while (used.has(name)); used.add(name);
    T.seats[i] = { uid: null, name, avatar: Math.floor(rnd() * 12), level: 5 + Math.floor(rnd() * 120), bot: true, left: false, away: false, timeouts: 0 };
  }
}
const isAuto = (seat) => seat.bot || seat.left || seat.away;
const log = (T, e) => { const H = T.hand; H.log.push({ k: ++T.seq, ...e }); if (H.log.length > 40) H.log.shift(); };

export function startRound(T, now, rnd = Math.random) {
  T.round++; T.status = 'playing';
  const start = T.round === 1 ? T.startSeat : next(T.hand ? T.hand.start : T.startSeat);
  let deck = R.shuffle(R.fullDeck(), rnd);
  let ii = deck.findIndex(id => id < 104); const indicator = deck.splice(ii, 1)[0]; // gösterge sahte okey olamaz
  const okey = R.okeyOf(indicator);
  const racks = [[], [], [], []];
  for (let k = 0; k < 4; k++) { const s = (start + k) % 4; racks[s] = deck.splice(0, s === start ? 22 : 21); }
  T.hand = { start, indicator, okey, pile: deck, racks, discards: [[], [], [], []], melds: [], opened: [null, null, null, null], penalties: [0, 0, 0, 0], siler: [0, 0, 0, 0],
    turn: start, phase: 'play', took: null, laidThisTurn: false, okeyBlocked: false, turnNo: 1, openTurn: [0, 0, 0, 0], meldSeq: 0, log: [], result: null };
  log(T, { t: 'deal', s: start });
  beginTurn(T, now, rnd);
}
/** "Topla" için: oyuncu taş aldıktan sonraki masa/el durumunun kopyası (o tur masaya koyduklarını geri alabilir). */
function snapshot(T) {
  const H = T.hand, s = H.turn;
  H.snap = { rack: H.racks[s].slice(), melds: JSON.parse(JSON.stringify(H.melds)), opened: H.opened[s] ? { ...H.opened[s] } : null, openTurn: H.openTurn[s], penalties: H.penalties.slice(), siler: H.siler.slice(), took: H.took ? { ...H.took } : null, meldSeq: H.meldSeq };
}
function beginTurn(T, now, rnd = Math.random) {
  if (T.hand.phase === 'play') snapshot(T);
  const s = T.seats[T.hand.turn];
  T.deadline = now + (T.cfg.turnMs || TURN_MS);
  T.botAt = isAuto(s) ? now + BOT_MIN_MS + Math.floor(rnd() * (BOT_MAX_MS - BOT_MIN_MS)) : null;
}
const K = (T) => R.kit(T.hand.okey);
function needTurn(T, s, phase) {
  if (T.status !== 'playing') fail('not_playing', 'El şu anda oynanmıyor.');
  if (T.hand.turn !== s) fail('not_your_turn', 'Sıra sende değil.');
  if (phase && T.hand.phase !== phase) fail('bad_phase', phase === 'draw' ? 'Önce taş çekmelisin.' : 'Önce ortadan ya da yandan taş al.');
}
function takeFromRack(rack, ids) { for (const id of ids) { const i = rack.indexOf(id); if (i < 0) fail('not_in_rack', 'Bu taş elinde değil.'); rack.splice(i, 1); } }
function inRack(rack, ids) { const c = rack.slice(); for (const id of ids) { const i = c.indexOf(id); if (i < 0) return false; c.splice(i, 1); } return true; }

/** Açma eşiği: katlamalıda rakiplerin (eşlide karşı takımın) en yüksek açışından fazlası. */
export function openThreshold(T, s, route) {
  const H = T.hand, base = route === 'pairs' ? R.OPEN_PAIRS : R.OPEN_POINTS;
  if (!T.cfg.katlamali) return base;
  let mx = 0;
  for (let o = 0; o < 4; o++) {
    if (o === s || !H.opened[o] || H.opened[o].route !== route) continue;
    if (T.cfg.mode === 'esli' && o === partner(s)) continue;
    mx = Math.max(mx, H.opened[o].value);
  }
  return Math.max(base, mx + 1);
}

/* ===================== HAMLELER ===================== */
export function act(T, s, a, now, rnd = Math.random) {
  const H = T.hand, seat = T.seats[s];
  if (!seat) fail('no_seat', 'Masada değilsin.');
  if (a.type !== 'auto') { seat.timeouts = 0; if (seat.away && !seat.bot) seat.away = false; }
  const k = H && K(T);
  switch (a.type) {
    case 'draw': {
      needTurn(T, s, 'draw');
      if (!H.pile.length) return endRound(T, null, now);
      const id = H.pile.shift(); H.racks[s].push(id); H.phase = 'play'; H.took = null; H.okeyBlocked = false; snapshot(T);
      log(T, { t: 'draw', s }); return { drawn: id };
    }
    case 'take': {
      needTurn(T, s, 'draw');
      const d = H.discards[prev(s)]; if (!d.length) fail('empty', 'Alınacak taş yok.');
      if (H.okeyBlocked) fail('okey_blocked', 'Atılan okey alınamaz.');
      const id = d.pop(); H.racks[s].push(id); H.phase = 'play'; H.took = { id, from: prev(s) }; snapshot(T);
      log(T, { t: 'take', s, tile: id }); return { taken: id };
    }
    case 'return': {
      needTurn(T, s, 'play');
      if (!H.took) fail('nothing', 'Geri bırakılacak taş yok.');
      if (H.laidThisTurn) fail('already_laid', 'Masaya taş koyduktan sonra geri bırakamazsın.');
      takeFromRack(H.racks[s], [H.took.id]); H.discards[H.took.from].push(H.took.id); H.took = null; H.phase = 'draw';
      log(T, { t: 'return', s }); return {};
    }
    case 'undo': { // TOPLA: bu tur masaya koyulan taşlar ıstakaya geri döner (taş atmadan önce)
      needTurn(T, s, 'play');
      if (!H.laidThisTurn || !H.snap) fail('nothing_to_undo', 'Bu tur masaya koyduğun taş yok.');
      const S = H.snap; H.racks[s] = S.rack.slice(); H.melds = JSON.parse(JSON.stringify(S.melds)); H.opened[s] = S.opened; H.openTurn[s] = S.openTurn;
      H.penalties = S.penalties.slice(); H.siler = S.siler.slice(); H.took = S.took ? { ...S.took } : null; H.meldSeq = S.meldSeq; H.laidThisTurn = false;
      log(T, { t: 'undo', s }); return {};
    }
    case 'open': {
      needTurn(T, s, 'play');
      if (H.opened[s]) fail('already_open', 'Elini zaten açtın.');
      const groups = a.groups; if (!Array.isArray(groups) || !groups.length || groups.length > 20) fail('bad_groups', 'Geçersiz per.');
      const all = groups.flat(); if (!inRack(H.racks[s], all) || new Set(all).size !== all.length) fail('not_in_rack', 'Bu taşlar elinde değil.');
      const route = a.route === 'pairs' ? 'pairs' : 'points';
      const melds = groups.map(g => R.analyze(g, k, route === 'pairs' ? 'pair' : (g.hint || undefined)));
      if (melds.some(m => !m)) fail('invalid_meld', 'Geçersiz per var. Seriler aynı renk ve ardışık, aynı sayılar farklı renk olmalı (12-13-1 geçersiz).');
      if (route === 'points' && melds.some(m => m.kind === 'pair')) fail('mixed', 'Seri/per ile çift aynı açılışta karıştırılamaz.');
      if (route === 'pairs' && melds.some(m => m.kind !== 'pair')) fail('mixed', 'Çift açarken yalnızca çiftler konur.');
      const value = route === 'pairs' ? melds.length : melds.reduce((x, m) => x + m.value, 0);
      const need = openThreshold(T, s, route);
      if (value < need) fail('below_threshold', route === 'pairs' ? `Açmak için en az ${need} çift gerekli (sende ${value}).` : `Açmak için en az ${need} sayı gerekli (sende ${value}).`);
      if (H.took && !all.includes(H.took.id)) fail('must_use_taken', 'Yandan aldığın taşı açışında kullanmalısın (ya da geri bırak).');
      takeFromRack(H.racks[s], all);
      for (const m of melds) H.melds.push({ id: ++H.meldSeq, owner: s, kind: m.kind, tiles: m.tiles });
      H.opened[s] = { route, value }; H.openTurn[s] = H.turnNo; H.laidThisTurn = true;
      if (route === 'points' ? value >= R.SILER_POINTS : value >= R.SILER_PAIRS) H.siler[s] = -101;
      if (H.took) { const f = k.face(H.took.id).n; if (!k.isJoker(H.took.id)) H.penalties[H.took.from] += f * (route === 'pairs' ? 20 : 10); H.took = null; }
      log(T, { t: 'open', s, route, value }); return { value };
    }
    case 'lay': {
      needTurn(T, s, 'play');
      const op = H.opened[s]; if (!op) fail('not_open', 'Önce elini açmalısın.');
      const g = a.group; if (!Array.isArray(g) || !inRack(H.racks[s], g)) fail('not_in_rack', 'Bu taşlar elinde değil.');
      const pairsExist = H.opened.some(o => o && o.route === 'pairs');
      const m = R.analyze(g, k, op.route === 'pairs' ? 'pair' : g.length === 2 ? 'pair' : a.hint);
      if (!m) fail('invalid_meld', 'Geçersiz per.');
      if (op.route === 'pairs' && m.kind !== 'pair') fail('pairs_only', 'Çift açan oyuncu masaya yalnızca çift koyabilir (işleme serbest).');
      if (m.kind === 'pair' && !pairsExist) fail('no_pairs_area', 'Masada çift açan olmadığı için çift konamaz.');
      takeFromRack(H.racks[s], g); H.melds.push({ id: ++H.meldSeq, owner: s, kind: m.kind, tiles: m.tiles }); H.laidThisTurn = true;
      if (H.took && g.includes(H.took.id)) H.took = null;
      log(T, { t: 'lay', s, meld: H.meldSeq }); return {};
    }
    case 'add': {
      needTurn(T, s, 'play');
      if (!H.opened[s]) fail('not_open', 'İşlemek için önce elini açmalısın.');
      const id = a.tile; if (!inRack(H.racks[s], [id])) fail('not_in_rack', 'Bu taş elinde değil.');
      const m = H.melds.find(x => x.id === a.meld); if (!m) fail('no_meld', 'Per bulunamadı.');
      const nt = R.addToMeld(m, id, k, a.side); if (!nt) fail('cannot_add', 'Bu taş bu pere işlenemez.');
      takeFromRack(H.racks[s], [id]); m.tiles = nt; H.laidThisTurn = true; if (H.took && H.took.id === id) H.took = null;
      log(T, { t: 'add', s, meld: m.id, tile: id }); return {};
    }
    case 'retrieve': {
      needTurn(T, s, 'play');
      if (!H.opened[s]) fail('not_open', 'Okey almak için önce elini açmalısın.');
      const m = H.melds.find(x => x.id === a.meld); if (!m) fail('no_meld', 'Per bulunamadı.');
      const idx = m.tiles.findIndex(t => t.j); const ix = a.index != null ? a.index : idx;
      if (!inRack(H.racks[s], [a.tile])) fail('not_in_rack', 'Bu taş elinde değil.');
      if (!R.canRetrieve(m, ix, a.tile, k)) fail('cannot_retrieve', m.kind === 'set' ? 'Okeyi almak için perde 4 renk de tamamlanmış olmalı.' : 'Okeyin yerine geçtiği taşın aynısını koymalısın.');
      const slot = m.tiles[ix]; takeFromRack(H.racks[s], [a.tile]); H.racks[s].push(slot.id);
      m.tiles = m.tiles.map((t, i) => (i === ix ? { id: a.tile, c: slot.c, n: slot.n, j: false } : t));
      if (m.owner !== s) H.penalties[m.owner] += 101;
      H.laidThisTurn = true; log(T, { t: 'retrieve', s, meld: m.id }); return { got: slot.id };
    }
    case 'discard': {
      needTurn(T, s, 'play');
      const id = a.tile; const rack = H.racks[s]; if (!inRack(rack, [id])) fail('not_in_rack', 'Bu taş elinde değil.');
      if (H.took && rack.includes(H.took.id) && a.force && H.laidThisTurn) { H.penalties[s] += 101; H.took = null; } // yalnızca sunucu içi güvenlik ağı: ceza ile devam
      if (H.took && rack.includes(H.took.id)) fail('must_use_taken', H.opened[s] ? 'Yandan aldığın taşı bu el masaya koymalısın ya da geri bırakmalısın.' : 'Yandan aldığın taşla elini açmalısın ya da geri bırakmalısın.');
      takeFromRack(rack, [id]); H.discards[s].push(id);
      const joker = k.isJoker(id);
      if (!rack.length) { log(T, { t: 'discard', s, tile: id, finish: true }); return endRound(T, { seat: s, okey: joker }, now); }
      if (joker) { H.penalties[s] += 101; H.okeyBlocked = true; }
      else if (R.isCommittable(id, H.melds, k)) H.penalties[s] += 101;
      log(T, { t: 'discard', s, tile: id, pen: joker || R.isCommittable(id, H.melds, k) ? 101 : 0 });
      H.turn = next(s); H.phase = 'draw'; H.took = null; H.laidThisTurn = false; H.turnNo++;
      if (!joker) H.okeyBlocked = false;
      beginTurn(T, now, rnd); return {};
    }
    case 'auto': return autoTurn(T, s, now, rnd);
    default: fail('bad_action', 'Geçersiz hamle.');
  }
}

/** Zaman aşımı / bot: tüm turu kurallara uygun oynar. */
function autoTurn(T, s, now, rnd) {
  const H = T.hand, seat = T.seats[s];
  if (seat.bot || seat.left || seat.away) return botTurn(T, s, (a) => act(T, s, a, now, rnd));
  // insan oyuncu süresini doldurdu: basit hamle (ceza almadan), iki kez üst üste olursa bot devralır
  seat.timeouts++; if (seat.timeouts >= 2) seat.away = true;
  if (H.phase === 'play' && H.took && !H.laidThisTurn) act(T, s, { type: 'return' }, now, rnd);
  if (H.phase === 'draw') { const r = act(T, s, { type: 'draw' }, now, rnd); if (T.status !== 'playing' || T.hand !== H) return r; }
  if (H.took && H.racks[s].includes(H.took.id)) { /* masaya koyamadıysa: güvenli yol yok, okeyi değilse geri yine atılır */ }
  const id = botDiscard(T, s);
  return act(T, s, { type: 'discard', tile: id }, now, rnd);
}

/* ===================== EL SONU / PUANLAMA ===================== */
export function endRound(T, fin, now) {
  const H = T.hand, k = K(T), sc = [0, 0, 0, 0], detail = [];
  const anyOpen = H.opened.some(Boolean);
  if (!fin && !anyOpen) {
    for (let s = 0; s < 4; s++) detail.push({ s, note: 'Kimse açmadı — el sayılmadı', score: 0 });
  } else {
    let mult = 1, direct = false, pairsFin = false;
    if (fin) {
      const f = fin.seat, op = H.opened[f];
      direct = H.openTurn[f] === H.turnNo && H.opened.every((o, i) => i === f || !o); // kimse açmadan, aynı turda açıp bitirdi
      pairsFin = op && op.route === 'pairs';
      if (fin.okey) mult *= 2; if (pairsFin) mult *= 2;
    }
    for (let s = 0; s < 4; s++) {
      let v, note;
      if (fin && s === fin.seat) {
        v = direct ? (fin.okey ? -404 : -202) : pairsFin ? (fin.okey ? -404 : -202) : (fin.okey ? -202 : -101);
        note = direct ? 'Elden bitti' : pairsFin ? 'Çiftle bitti' : 'Bitti'; if (fin.okey) note += ' (okey atarak)';
      } else if (fin && T.cfg.mode === 'esli' && s === partner(fin.seat)) { v = 0; note = 'Eşi bitti'; }
      else if (!H.opened[s]) { v = fin ? (direct ? (fin.okey ? 808 : 404) : 202 * mult) : 202; note = 'Açmadı'; }
      else { v = R.leftoverPenalty(H.racks[s], k, H.opened[s].route === 'pairs'); note = H.opened[s].route === 'pairs' ? 'Elde kalan ×2' : 'Elde kalan'; }
      const extra = H.penalties[s] + H.siler[s];
      sc[s] = v + extra; detail.push({ s, base: v, penalties: H.penalties[s], siler: H.siler[s], score: sc[s], note, left: H.racks[s].length });
    }
  }
  for (let s = 0; s < 4; s++) T.totals[s] += sc[s];
  H.result = { finisher: fin ? fin.seat : null, okeyFinish: fin ? fin.okey : false, scores: sc, detail, racks: H.racks.map(r => r.slice()) };
  T.history.push(sc);
  log(T, { t: 'round_end', s: fin ? fin.seat : -1 });
  if (T.round >= T.cfg.rounds) finishGame(T, now);
  else { T.status = 'round_end'; T.deadline = now + ROUND_PAUSE_MS; T.botAt = null; }
  return { roundEnd: true };
}
export function finishGame(T, now) {
  T.status = 'finished'; T.deadline = null; T.botAt = null;
  const order = [0, 1, 2, 3];
  if (T.cfg.mode === 'esli') {
    const t0 = T.totals[0] + T.totals[2], t1 = T.totals[1] + T.totals[3];
    T.final = { teams: [t0, t1], winners: t0 === t1 ? [0, 1, 2, 3] : t0 < t1 ? [0, 2] : [1, 3], ranking: order.sort((a, b) => T.totals[a] - T.totals[b]) };
  } else {
    order.sort((a, b) => T.totals[a] - T.totals[b]);
    T.final = { ranking: order, winners: order.filter(s => T.totals[s] === T.totals[order[0]]) };
  }
  T.finishedAt = now;
}

/** Zaman temelli ilerletme: botlar, süre dolan oyuncular, el arası, masa doldurma. Değişiklik olduysa true. */
export function tick(T, now, rnd = Math.random) {
  let changed = false;
  for (let guard = 0; guard < 12; guard++) {
    if (T.status === 'waiting') {
      if (T.fillAt && now >= T.fillAt && T.seats.some(x => x && !x.bot)) { fillBots(T, rnd); startRound(T, now, rnd); changed = true; continue; }
      break;
    }
    if (T.status === 'round_end') { if (now >= T.deadline) { startRound(T, now, rnd); changed = true; continue; } break; }
    if (T.status !== 'playing') break;
    const s = T.hand.turn, seat = T.seats[s];
    if (isAuto(seat) ? now >= T.botAt : now >= T.deadline) {
      const before = T.seq;
      try { act(T, s, { type: 'auto' }, now, rnd); }
      catch (e) { // güvenlik ağı: botun hamlesi reddedilirse en basit geçerli hamle
        const H = T.hand; if (H.phase === 'play' && H.took && !H.laidThisTurn) { try { act(T, s, { type: 'return' }, now, rnd); } catch (e2) { /* */ } }
        if (H.phase === 'draw') act(T, s, { type: 'draw' }, now, rnd);
        if (T.status === 'playing' && T.hand.turn === s) act(T, s, { type: 'discard', tile: botDiscard(T, s), force: true }, now, rnd);
      }
      changed = changed || T.seq !== before; continue;
    }
    break;
  }
  return changed;
}

/** Oyuncuya özel görünüm: diğerlerinin elleri gizli. */
export function view(T, me, now) {
  const H = T.hand;
  const v = { cfg: T.cfg, status: T.status, round: T.round, seats: T.seats.map(x => x && { name: x.name, avatar: x.avatar, level: x.level, bot: x.bot, left: x.left, away: x.away, human: !!x.uid }),
    me, totals: T.totals, history: T.history, deadline: T.deadline, now, fillAt: T.fillAt, final: T.final || null, seq: T.seq };
  if (H) {
    v.hand = { start: H.start, indicator: H.indicator, okey: H.okey, pile: H.pile.length, discards: H.discards, melds: H.melds, opened: H.opened, penalties: H.penalties, siler: H.siler,
      turn: H.turn, phase: H.phase, took: H.took, laidThisTurn: H.laidThisTurn, okeyBlocked: H.okeyBlocked, counts: H.racks.map(r => r.length), log: H.log.slice(-12),
      threshold: me != null ? { points: openThreshold(T, me, 'points'), pairs: openThreshold(T, me, 'pairs') } : null,
      rack: me != null ? H.racks[me] : null, result: H.result };
  }
  return v;
}
