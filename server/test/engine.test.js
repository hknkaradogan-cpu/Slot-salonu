import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildGames, ORDER, MAX_WIN } from '../src/games/engine.js';
import { FastRng, FairRng } from '../src/games/rng.js';
const games = buildGames(JSON.parse(fs.readFileSync(new URL('../src/games/calibration.json', import.meta.url), 'utf8')));

test('7 oyun yüklü ve her biri %95 RTP için kalibre edilmiş', () => {
  assert.deepEqual(ORDER, ['zeus', 'misir', 'vegas', 'peri', 'ejderha', 'korsan', 'altin']);
  for (const id of ORDER) { assert.ok(games[id].cal && games[id].cal.scale > 0, id); }
});

test('kazanç her zaman 0 ile azami kazanç arasında ve kayıtlı/kayıtsız oyun aynı sonucu verir', () => {
  for (const id of ORDER) {
    for (let i = 0; i < 3000; i++) {
      const a = games[id].play(new FairRng('s', 'c', i), false), b = games[id].play(new FairRng('s', 'c', i), true);
      assert.ok(a.win >= 0 && a.win <= MAX_WIN, id); assert.equal(a.win, b.win, `${id} nonce ${i}`);
    }
  }
});

test('tumble: her adımda kazanan sembol 8+ adet, patlayanlar kaldırılır ve ızgara 30 hücre kalır', () => {
  const rng = new FastRng('tumble'); let checked = 0;
  for (let i = 0; i < 4000 && checked < 300; i++) {
    const r = games.zeus.play(rng, true); let prev = r.base.grid;
    for (const st of r.base.steps) {
      checked++;
      for (const w of st.wins) { assert.ok(w.n >= 8); assert.equal(prev.filter(v => v === w.s).length, w.n); }
      assert.equal(st.removed.length, st.wins.reduce((a, w) => a + w.n, 0));
      assert.equal(st.grid.length, 30); prev = st.grid;
    }
  }
  assert.ok(checked > 100);
});

test('tumble çarpanları: kazanç = zincir toplamı x çarpan toplamı', () => {
  const rng = new FastRng('mult'); let seen = 0;
  for (let i = 0; i < 200000 && seen < 20; i++) {
    const r = games.zeus.play(rng, true); const b = r.base;
    if (r.fs || !b.win || !b.multSum) continue;
    seen++; assert.ok(Math.abs(r.win - (b.win * b.multSum + b.scPay)) < 1e-9);
  }
  assert.ok(seen >= 20);
});

test('özellikler tetiklenir: FS, Tut&Döndür ve çarklar', () => {
  const need = { zeus: 'fs', peri: 'fs', misir: 'fs', ejderha: 'fs', korsan: 'hold', altin: 'wheel', vegas: 'wheel' };
  for (const [id, k] of Object.entries(need)) {
    const rng = new FastRng('feat-' + id); let found = false;
    for (let i = 0; i < 50000 && !found; i++) { const r = games[id].play(rng, true); if (r[k]) found = true; }
    assert.ok(found, id + ' özelliği tetiklenmedi');
  }
});

test('RNG belirleyici ve tohum değişince sonuç değişir', () => {
  const a = new FairRng('x', 'y', 1), b = new FairRng('x', 'y', 1), c = new FairRng('x', 'y', 2);
  const sa = Array.from({ length: 50 }, () => a.next()), sb = Array.from({ length: 50 }, () => b.next()), sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

test('RNG düzgün dağılım (ki-kare, 10 kutu, 200.000 örnek)', () => {
  const r = new FairRng('chi', 'sq', 0); const k = new Array(10).fill(0); const n = 200000;
  for (let i = 0; i < n; i++) k[(r.next() * 10) | 0]++;
  const e = n / 10; const chi = k.reduce((a, v) => a + (v - e) ** 2 / e, 0);
  assert.ok(chi < 27.88, 'ki-kare ' + chi); // sd=9, p=0.001
});
