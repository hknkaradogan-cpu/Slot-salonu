#!/usr/bin/env node
/*
 * Oyun matematiği simülatörü.
 *   node tools/simulate.js --spins 10000000            -> doğrulama raporu (mevcut kalibrasyon)
 *   node tools/simulate.js --calibrate --spins 4000000 -> %95 RTP için SCALE hesaplar, calibration.json yazar
 *   --games zeus,peri   (opsiyonel)   --out rapor.json (opsiyonel)
 * Çalışanlar (worker_threads) CPU çekirdekleri arasında paylaştırılır.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGames, ORDER, DEFS } from '../src/games/engine.js';
import { FastRng } from '../src/games/rng.js';
const __filename = fileURLToPath(import.meta.url);
const CAL_FILE = path.join(path.dirname(__filename), '../src/games/calibration.json');
const readCal = () => { try { return JSON.parse(fs.readFileSync(CAL_FILE, 'utf8')); } catch { return {}; } };

if (!isMainThread) {
  const { id, spins, seed, scales, buyKind, rtp, vol } = workerData;
  const g = buildGames(scales, rtp || { [id]: 0.95 }, vol ? { [id]: vol } : {})[id];
  const rng = new FastRng(seed);
  let sum = 0, sumSq = 0, hits = 0, feat = 0, max = 0, featWin = 0;
  const buckets = new Float64Array(9); // 0, <1, 1-2, 2-5, 5-20, 20-100, 100-500, 500-1000, 1000+
  const edges = [1e-12, 1, 2, 5, 20, 100, 500, 1000];
  for (let i = 0; i < spins; i++) {
    const r = buyKind ? g.buy(rng, false, buyKind) : g.play(rng, false);
    const w = r.win;
    sum += w; sumSq += w * w;
    if (w > 0) hits++;
    if (r.fs || r.hold || r.wheel) { feat++; featWin += w; }
    if (w > max) max = w;
    let b = 0; while (b < edges.length && w >= edges[b]) b++;
    buckets[b]++;
  }
  parentPort.postMessage({ sum, sumSq, hits, feat, featWin, max, buckets: Array.from(buckets) });
} else {

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const spins = Number(opt('spins', 2000000));
const games = (opt('games', '') || ORDER.join(',')).split(',');
const threads = Math.max(1, os.cpus().length);
const calibrate = flag('calibrate');
const baseSeed = opt('seed', String(Date.now()));

const rtpArg = opt('rtp', null); // 'profil' = varsayılan oyun profilleri, sayı = hepsi için
const volArg = opt('vol', null); // dusuk|orta|yuksek|profil
function runGame(id, scales, buyKind, rtpMap, vol) {
  vol = vol || (volArg && volArg !== 'profil' ? volArg : null);
  const per = Math.ceil(spins / threads);
  return Promise.all(Array.from({ length: threads }, (_, t) => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: { id, spins: per, seed: `${baseSeed}:${id}:${t}${buyKind || ''}${vol || ''}`, scales, buyKind, rtp: rtpMap, vol } });
    w.on('message', res); w.on('error', rej);
  }))).then(parts => {
    const a = parts.reduce((x, y) => ({ sum: x.sum + y.sum, sumSq: x.sumSq + y.sumSq, hits: x.hits + y.hits, feat: x.feat + y.feat, featWin: x.featWin + y.featWin, max: Math.max(x.max, y.max), buckets: x.buckets.map((v, i) => v + y.buckets[i]) }));
    const n = per * threads; const mean = a.sum / n; const sd = Math.sqrt(a.sumSq / n - mean * mean);
    return { id, name: DEFS[id].name, spins: n, rtp: mean, sd, ci95: 1.96 * sd / Math.sqrt(n), hitRate: a.hits / n, featureRate: a.feat / n, featureShare: a.featWin / a.sum, maxWin: a.max, buckets: a.buckets.map(v => v / n) };
  });
}

(async () => {
  const t0 = Date.now();
  let cal = readCal();
  const { DEFAULT_RTP } = await import('../src/games/engine.js');
  const rtpFor = (id) => rtpArg === 'profil' ? { [id]: DEFAULT_RTP[id] } : rtpArg ? { [id]: Number(rtpArg) } : { [id]: 0.95 };
  const results = [];
  for (const id of games) {
    const t1 = Date.now();
    if (flag('calibrate-vol')) {
      // düşük / yüksek volatilite seviyeleri için ayrı ölçek + bonus satın alma fiyatı (%95'te)
      const { VOL_LEVELS } = await import('../src/games/engine.js');
      for (const lvl of VOL_LEVELS.filter(l => l !== 'orta')) {
        const tmp = JSON.parse(JSON.stringify(cal)); tmp[id].vol = { ...(tmp[id].vol || {}), [lvl]: { scale: 1 } };
        const raw = await runGame(id, tmp, null, null, lvl); let scale = 0.95 / raw.rtp;
        tmp[id].vol[lvl].scale = scale; const chk = await runGame(id, tmp, null, null, lvl); scale = scale * 0.95 / chk.rtp;
        tmp[id].vol[lvl].scale = scale;
        const G = buildGames(tmp, { [id]: 0.95 }, { [id]: lvl })[id]; const buy = {};
        for (const k of G.buyKinds) { const r = await runGame(id, tmp, k, null, lvl); buy[k] = Math.round(r.rtp / 0.95 * 10) / 10; }
        cal[id].vol = { ...(cal[id].vol || {}), [lvl]: { scale: +scale.toPrecision(8), buy, calibratedWithSpins: raw.spins + chk.spins, date: new Date().toISOString() } };
        console.log(`${id} ${lvl}: ölçek ${scale.toFixed(5)} (orta ${cal[id].scale.toFixed(5)}) · satın alma ${JSON.stringify(buy)} (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
      }
      continue;
    }
    if (flag('buy')) {
      const G = buildGames(cal)[id];
      for (const k of G.buyKinds) {
        const r = await runGame(id, cal, k);
        if (flag('set')) { cal[id].buy = cal[id].buy || {}; cal[id].buy[k] = Math.round(r.rtp / 0.95 * 10) / 10; }
        const cost = (cal[id].buy || {})[k];
        console.log(`${r.name.padEnd(18)} SATIN AL ${k.padEnd(5)} beklenen ${r.rtp.toFixed(2)}x ±${r.ci95.toFixed(2)} · fiyat ${cost}x bahis · RTP ${cost ? (r.rtp / cost * 100).toFixed(2) + '%' : '-'} · maks ${r.maxWin.toFixed(0)}x (${r.spins} satın alma)`);
        results.push({ ...r, buyKind: k, cost, buyRtp: cost ? r.rtp / cost : null });
      }
      continue;
    }
    if (calibrate) {
      const raw = await runGame(id, { [id]: { scale: 1 } });
      let scale = 0.95 / raw.rtp;
      // azami kazanç sınırı doğrusal olmadığı için bir düzeltme turu
      const chk = await runGame(id, { [id]: { scale } });
      scale = scale * 0.95 / chk.rtp;
      cal[id] = { scale: +scale.toPrecision(8), calibratedWithSpins: raw.spins + chk.spins, date: new Date().toISOString() };
      console.log(`${id}: raw RTP ${(raw.rtp * 100).toFixed(2)}% -> scale ${scale.toFixed(6)} (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
    } else {
      const { DEFAULT_VOL } = await import('../src/games/engine.js'); const vl = volArg === 'profil' ? DEFAULT_VOL[id] : (volArg || null);
      const r = await runGame(id, cal, null, rtpFor(id), vl); r.target = rtpFor(id)[id]; r.vol = vl || 'orta';
      results.push(r);
      console.log(`${r.name.padEnd(18)} ${String(r.vol).padEnd(6)} hedef ${(r.target * 100).toFixed(1)}% · RTP ${(r.rtp * 100).toFixed(3)}% ±${(r.ci95 * 100).toFixed(3)}  hit ${(r.hitRate * 100).toFixed(1)}%  SD ${r.sd.toFixed(2)}  feature 1/${(1 / r.featureRate).toFixed(0)}  max ${r.maxWin.toFixed(0)}x  (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
    }
  }
  if (calibrate || flag('calibrate-vol') || (flag('buy') && flag('set'))) fs.writeFileSync(CAL_FILE, JSON.stringify(cal, null, 2));
  else {
    const out = opt('out', null);
    if (out) fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), seed: baseSeed, spinsPerGame: spins, results }, null, 2));
  }
  console.log(`Toplam süre ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})();
}
