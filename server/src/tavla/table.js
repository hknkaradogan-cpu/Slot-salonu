// Tavla masa durum makinesi (2 oyuncu). Durum JSON olarak veritabanında saklanır; zarları sunucu atar.
import * as R from './rules.js';

export const TURN_MS = 40000, BOT_MIN_MS = 900, BOT_MAX_MS = 1900, GAME_PAUSE_MS = 6000, FILL_BOTS_MS = 15000, NO_MOVE_MS = 1600;
const BOT_NAMES = ['Ali Usta', 'Nuri', 'Sevgi', 'Kemal', 'Leyla', 'Cevdet', 'Hülya', 'Rıza', 'Nermin', 'Turgut'];
export class TavlaError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (c, m) => { throw new TavlaError(c, m); };
/** Kriptografik zar: 1..6 (modulo yanlılığı olmadan). */
export function die() { const a = new Uint8Array(1); for (;;) { crypto.getRandomValues(a); if (a[0] < 252) return (a[0] % 6) + 1; } }
const isAuto = (x) => x.bot || x.left || x.away;

export function newTable(cfg, now) {
  const bots = cfg.bots !== false;
  return { cfg: { stake: cfg.stake || 0, points: cfg.points || 1, private: !!cfg.private, turnMs: cfg.turnMs || TURN_MS, bots },
    status: 'waiting', seats: [null, null], score: [0, 0], game: 0, board: null, turn: 0, phase: 'roll', dice: null, legalN: 0, lastMove: null,
    createdAt: now, fillAt: cfg.private || !bots ? null : now + FILL_BOTS_MS, deadline: null, botAt: null, seq: 0, log: [], result: null };
}
export function seatHuman(T, u, seat) {
  if (T.status !== 'waiting') fail('table_started', 'Oyun başladı.');
  const s = seat != null ? seat : T.seats.findIndex(x => !x); if (s < 0 || T.seats[s]) fail('table_full', 'Masa dolu.');
  T.seats[s] = { uid: u.id, name: u.username, avatar: u.avatar || 0, level: u.level || 1, bot: false, left: false, away: false, timeouts: 0 }; return s;
}
export function fillBots(T) {
  for (let i = 0; i < 2; i++) if (!T.seats[i]) T.seats[i] = { uid: null, name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], avatar: Math.floor(Math.random() * 12), level: 5 + Math.floor(Math.random() * 90), bot: true, left: false, away: false, timeouts: 0 };
}
export function rejoin(T, uid) {
  const s = T.seats.findIndex(x => x && x.uid === uid); if (s < 0) fail('no_seat', 'Bu masada koltuğun yok.');
  if (T.status === 'finished' || T.status === 'abandoned') fail('table_over', 'Bu masadaki oyun bitti.');
  Object.assign(T.seats[s], { left: false, away: false, timeouts: 0 }); T.seq++; if (T.status === 'playing' && T.turn === s) T.botAt = null; return s;
}
const log = (T, e) => { T.log.push({ k: ++T.seq, ...e }); if (T.log.length > 30) T.log.shift(); };
function begin(T, now) {
  const x = T.seats[T.turn]; T.deadline = now + T.cfg.turnMs;
  T.botAt = isAuto(x) ? now + BOT_MIN_MS + Math.floor(Math.random() * (BOT_MAX_MS - BOT_MIN_MS)) : null;
}
export function startGame(T, now) {
  T.game++; T.status = 'playing'; T.board = R.newBoard(); T.result = null; T.lastMove = null;
  // açılış: iki oyuncu birer zar atar, büyük atan o zarlarla başlar (eşitse tekrar)
  let a, b; do { a = die(); b = die(); } while (a === b);
  T.turn = a > b ? 0 : 1; T.dice = [a, b]; T.phase = 'move'; T.opening = [a, b];
  T.legalN = R.legalSequences(T.board, T.turn, T.dice).length;
  log(T, { t: 'opening', s: T.turn, dice: [a, b] }); begin(T, now);
}
function need(T, s, phase) {
  if (T.status !== 'playing') fail('not_playing', 'Oyun şu anda oynanmıyor.');
  if (T.turn !== s) fail('not_your_turn', 'Sıra sende değil.');
  if (T.phase !== phase) fail('bad_phase', phase === 'roll' ? 'Önce zar at.' : 'Önce hamleni yap.');
}
function nextTurn(T, now) { T.turn = 1 - T.turn; T.phase = 'roll'; T.dice = null; T.legalN = 0; begin(T, now); }

export function act(T, s, a, now) {
  if (!T.seats[s]) fail('no_seat', 'Masada değilsin.');
  if (a.type !== 'auto' && !a.internal) { T.seats[s].timeouts = 0; if (T.seats[s].away && !T.seats[s].bot) T.seats[s].away = false; }
  switch (a.type) {
    case 'roll': {
      need(T, s, 'roll'); T.dice = [die(), die()]; T.phase = 'move';
      T.legalN = R.legalSequences(T.board, s, T.dice).length; log(T, { t: 'roll', s, dice: T.dice });
      if (!T.legalN) { T.deadline = now + NO_MOVE_MS; T.botAt = now + NO_MOVE_MS; T.noMove = true; } // oynanacak hamle yok: kısa gösterim, sonra sıra geçer
      else { T.noMove = false; begin(T, now); }
      return { dice: T.dice, moves: T.legalN };
    }
    case 'move': {
      need(T, s, 'move');
      const r = R.applySequence(T.board, s, T.dice, a.moves || []); if (!r) fail('illegal', 'Bu hamle kurallara uygun değil. Zarların tamamını (mümkünse) oynamalısın.');
      T.board = r.board; T.lastMove = { s, moves: a.moves || [], dice: T.dice }; log(T, { t: 'move', s, n: (a.moves || []).length, hits: r.hits });
      const w = R.winner(T.board); if (w >= 0) return endGame(T, w, now);
      nextTurn(T, now); return { ok: true };
    }
    case 'auto': {
      const x = T.seats[s];
      if (T.noMove) { T.noMove = false; log(T, { t: 'pass', s }); nextTurn(T, now); return { ok: true }; }
      if (!isAuto(x)) { x.timeouts++; if (x.timeouts >= 2) x.away = true; }
      if (T.phase === 'roll') { act(T, s, { type: 'roll', internal: true }, now); if (!T.legalN) return { ok: true }; }
      return act(T, s, { type: 'move', moves: R.botChoose(T.board, s, T.dice), internal: true }, now);
    }
    default: fail('bad_action', 'Geçersiz hamle.');
  }
}
export function endGame(T, w, now) {
  const pts = R.gamePoints(T.board, w); T.score[w] += pts;
  T.result = { winner: w, points: pts, mars: pts === 2, board: R.clone(T.board) }; log(T, { t: 'game_end', s: w, pts });
  if (T.score[w] >= T.cfg.points) { T.status = 'finished'; T.final = { winner: w }; T.deadline = null; T.botAt = null; T.finishedAt = now; }
  else { T.status = 'game_end'; T.deadline = now + GAME_PAUSE_MS; T.botAt = null; }
  return { gameEnd: true };
}
export function tick(T, now) {
  let changed = false;
  for (let g = 0; g < 8; g++) {
    if (T.status === 'waiting') { if (T.fillAt && now >= T.fillAt && T.seats.some(x => x && !x.bot)) { fillBots(T); startGame(T, now); changed = true; continue; } break; }
    if (T.status === 'game_end') { if (now >= T.deadline) { startGame(T, now); changed = true; continue; } break; }
    if (T.status !== 'playing') break;
    const x = T.seats[T.turn];
    const due = T.noMove ? now >= T.deadline : isAuto(x) ? now >= T.botAt : now >= T.deadline;
    if (due) { act(T, T.turn, { type: 'auto' }, now); changed = true; continue; }
    break;
  }
  return changed;
}
export function needsTick(T, t) {
  if (T.status === 'waiting') return !!(T.fillAt && t >= T.fillAt);
  if (T.status === 'game_end') return t >= T.deadline;
  if (T.status === 'playing') { const x = T.seats[T.turn]; return T.noMove ? t >= T.deadline : isAuto(x) ? t >= T.botAt : t >= T.deadline; }
  return false;
}
export function view(T, me, now) {
  return { cfg: T.cfg, status: T.status, seats: T.seats.map(x => x && { name: x.name, avatar: x.avatar, level: x.level, bot: x.bot, left: x.left, away: x.away, human: !!x.uid }),
    me, score: T.score, game: T.game, board: T.board, turn: T.turn, phase: T.phase, dice: T.dice, noMove: !!T.noMove, legalN: T.legalN, lastMove: T.lastMove,
    opening: T.game && T.log.find(l => l.t === 'opening') ? T.opening : null, deadline: T.deadline, fillAt: T.fillAt, now, result: T.result, final: T.final || null, seq: T.seq };
}
