/* 101 Okey: el ve oyun bitişi (sunucu durumu üzerinden) */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/okey/rules.js';
import * as TB from '../src/okey/table.js';

const seeded = (s) => () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
function fresh(cfg = {}) { const rnd = seeded(7); const T = TB.newTable({ mode: 'tekli', rounds: 2, katlamali: false, ...cfg }, 0); TB.fillBots(T, rnd); TB.startRound(T, 0, rnd); return { T, rnd }; }

test('ortada çekilecek taş bitince el kendiliğinden biter ve puanlanır (oyun kilitlenmez)', () => {
  const { T, rnd } = fresh();
  const H = T.hand; const s = H.turn;
  // ortadaki taşları neredeyse bitir: oyuncu son taşı çeker, bir taş atar → el bitmeli
  if (H.phase === 'draw') { H.pile.splice(1); TB.act(T, s, { type: 'draw' }, 1000, rnd); } // ortadaki son taş çekilir
  else H.pile.splice(0); // ilk oyuncu (22 taş) çekmeden atar; ortada taş kalmamış
  assert.equal(H.pile.length, 0);
  const tile = H.racks[s].find(id => !R.kit(H.okey).isJoker(id));
  const r = TB.act(T, s, { type: 'discard', tile }, 1100, rnd);
  assert.ok(r.roundEnd, 'el bitmeli');
  assert.equal(T.status, 'round_end');
  assert.equal(H.result.finisher, null);
  // kimse açmadıysa el sayılmaz; açan varsa elde kalanlar sayılır
  assert.equal(H.result.detail.length, 4);
  assert.equal(T.history.length, 1);
});

test('açarken/koyarken elde atacak taş kalmalı: son taşı masaya koymak reddedilir', () => {
  const { T } = fresh();
  const H = T.hand; const s = H.turn; const k = R.kit(H.okey);
  if (H.phase === 'draw') TB.act(T, s, { type: 'draw' }, 1000);
  // eli tamamen geçerli perlere ayrılmış gibi kur: 3 taşlık bir per + hiç artı taş
  H.opened[s] = { route: 'points', value: 120 };
  const rack = H.racks[s];
  // 3 taş kalsın ve bunlar bir per olsun
  const all = [...rack]; rack.length = 0;
  const pick = (n, c) => { for (let id = 0; id < 106; id++) { const f = k.face(id); if (f && f.n === n && f.c === c && !k.isJoker(id) && id !== H.indicator && !H.pile.includes(id)) return id; } return null; };
  // ıstakaya doğrudan geçerli bir seri koy (test: taşları elle yerleştiriyoruz)
  const run = [pick(3, 0), pick(4, 0), pick(5, 0)].filter(x => x != null);
  if (run.length === 3) {
    run.forEach(id => { for (const p of [H.pile, ...H.racks, ...H.discards]) { const i = p.indexOf(id); if (i >= 0) p.splice(i, 1); } });
    rack.push(...run);
    assert.throws(() => TB.act(T, s, { type: 'lay', group: run }, 1200), (e) => e.code === 'keep_one');
  }
  rack.length = 0; rack.push(...all); // durumu geri al
});

test('elde taş kalmamış bozuk durum: sunucu eli kurallara göre kapatır', () => {
  const { T, rnd } = fresh();
  const H = T.hand; const s = H.turn; H.phase = 'play'; H.opened[s] = { route: 'points', value: 101 };
  const moved = H.racks[s].splice(0); H.discards[s].push(...moved);
  const changed = TB.tick(T, 5000, rnd);
  assert.ok(changed); assert.ok(T.status === 'round_end' || T.status === 'finished');
  assert.equal(H.result.finisher, s);
});

test('elini bitiren oyuncu: son taşı atınca kazanan belirlenir, tek kazanan olur', () => {
  const { T, rnd } = fresh({ rounds: 1 });
  const H = T.hand; const s = H.turn; const k = R.kit(H.okey);
  if (H.phase === 'draw') TB.act(T, s, { type: 'draw' }, 1000, rnd);
  H.opened[s] = { route: 'points', value: 101 }; H.openTurn[s] = -5;
  // oyuncunun elinde tek taş kalmış olsun
  const keep = H.racks[s].find(id => !k.isJoker(id)); const rest = H.racks[s].filter(id => id !== keep);
  H.racks[s].length = 0; H.racks[s].push(keep); H.discards[s].push(...rest);
  const r = TB.act(T, s, { type: 'discard', tile: keep }, 2000, rnd);
  assert.ok(r.roundEnd); assert.equal(T.status, 'finished');
  assert.equal(H.result.finisher, s);
  assert.equal(H.result.scores[s], -101);
  assert.equal(T.final.winners.length >= 1, true);
  assert.ok(T.final.winners.includes(s));
});

test('bot-bot 100 oyun: hepsi biter, el sonlarında ya bitiren var ya da ortada taş bitmiş', () => {
  for (let g = 0; g < 100; g++) {
    const rnd = seeded(1000 + g);
    const T = TB.newTable({ mode: g % 2 ? 'esli' : 'tekli', rounds: 2, katlamali: g % 3 > 0, players: g % 5 === 0 ? 2 : 4 }, 0); TB.fillBots(T, rnd); TB.startRound(T, 0, rnd);
    let now = 0, rounds = 0;
    for (let i = 0; i < 4000 && T.status !== 'finished'; i++) {
      now += 3000; const before = T.status; TB.tick(T, now, rnd);
      if (before === 'playing' && T.status !== 'playing') { rounds++; const H = T.hand; assert.ok(H.result.finisher != null || H.pile.length === 0, 'el sebepsiz bitti'); }
    }
    assert.equal(T.status, 'finished', 'oyun ' + g + ' bitmedi');
    assert.equal(rounds, 2);
  }
});
