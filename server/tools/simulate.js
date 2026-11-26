#!/usr/bin/env node
'use strict';
/*
 * Oyun matematiği simülatörü.
 *   node tools/simulate.js --spins 10000000            -> doğrulama raporu (mevcut kalibrasyon)
 *   node tools/simulate.js --calibrate --spins 4000000 -> %95 RTP için SCALE hesaplar, calibration.json yazar
 *   --games zeus,peri   (opsiyonel)   --out rapor.json (opsiyonel)
 * Çalışanlar (worker_threads) CPU çekirdekleri arasında paylaştırılır.
 */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');

if (!isMainThread) {
  const { buildGames } = require('../src/games/engine');
  const { FastRng } = require('../src/games/rng');
  const { id, spins, seed, scales } = workerData;
  const g = buildGames(scales)[id];
  const rng = new FastRng(seed);
  let sum = 0, sumSq = 0, hits = 0, feat = 0, max = 0, featWin = 0;
  const buckets = new Float64Array(9); // 0, <1, 1-2, 2-5, 5-20, 20-100, 100-500, 500-1000, 1000+
  const edges = [1e-12, 1, 2, 5, 20, 100, 500, 1000];
  for (let i = 0; i < spins; i++) {
    const r = g.play(rng, false);
    const w = r.win;
    sum += w; sumSq += w * w;
    if (w > 0) hits++;
    if (r.fs || r.hold || r.wheel) { feat++; featWin += w; }
    if (w > max) max = w;
    let b = 0; while (b < edges.length && w >= edges[b]) b++;
    buckets[b]++;
  }
  parentPort.postMessage({ sum, sumSq, hits, feat, featWin, max, buckets: Array.from(buckets) });
  return;
}

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const { ORDER, CAL_FILE, DEFS } = require('../src/games/engine');
const spins = Number(opt('spins', 2000000));
const games = (opt('games', '') || ORDER.join(',')).split(',');
const threads = Math.max(1, os.cpus().length);
const calibrate = flag('calibrate');
const baseSeed = opt('seed', String(Date.now()));

function runGame(id, scales) {
  const per = Math.ceil(spins / threads);
  return Promise.all(Array.from({ length: threads }, (_, t) => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { id, spins: per, seed: `${baseSeed}:${id}:${t}`, scales } });
    w.on('message', res); w.on('error', rej);
  }))).then(parts => {
    const a = parts.reduce((x, y) => ({ sum: x.sum + y.sum, sumSq: x.sumSq + y.sumSq, hits: x.hits + y.hits, feat: x.feat + y.feat, featWin: x.featWin + y.featWin, max: Math.max(x.max, y.max), buckets: x.buckets.map((v, i) => v + y.buckets[i]) }));
    const n = per * threads; const mean = a.sum / n; const sd = Math.sqrt(a.sumSq / n - mean * mean);
    return { id, name: DEFS[id].name, spins: n, rtp: mean, sd, ci95: 1.96 * sd / Math.sqrt(n), hitRate: a.hits / n, featureRate: a.feat / n, featureShare: a.featWin / a.sum, maxWin: a.max, buckets: a.buckets.map(v => v / n) };
  });
}

(async () => {
  const t0 = Date.now();
  let cal = {}; try { cal = JSON.parse(fs.readFileSync(CAL_FILE, 'utf8')); } catch {}
  const results = [];
  for (const id of games) {
    const t1 = Date.now();
    if (calibrate) {
      const raw = await runGame(id, { [id]: { scale: 1 } });
      let scale = 0.95 / raw.rtp;
      // azami kazanç sınırı doğrusal olmadığı için bir düzeltme turu
      const chk = await runGame(id, { [id]: { scale } });
      scale = scale * 0.95 / chk.rtp;
      cal[id] = { scale: +scale.toPrecision(8), calibratedWithSpins: raw.spins + chk.spins, date: new Date().toISOString() };
      console.log(`${id}: raw RTP ${(raw.rtp * 100).toFixed(2)}% -> scale ${scale.toFixed(6)} (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
    } else {
      const r = await runGame(id, cal);
      results.push(r);
      console.log(`${r.name.padEnd(18)} RTP ${(r.rtp * 100).toFixed(3)}% ±${(r.ci95 * 100).toFixed(3)}  hit ${(r.hitRate * 100).toFixed(1)}%  SD ${r.sd.toFixed(2)}  feature 1/${(1 / r.featureRate).toFixed(0)}  max ${r.maxWin.toFixed(0)}x  (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
    }
  }
  if (calibrate) fs.writeFileSync(CAL_FILE, JSON.stringify(cal, null, 2));
  else {
    const out = opt('out', null);
    if (out) fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), seed: baseSeed, spinsPerGame: spins, results }, null, 2));
  }
  console.log(`Toplam süre ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})();
