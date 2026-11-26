#!/usr/bin/env node
// Spin denetleme aracı: açıklanmış sunucu tohumu ile bir spini yeniden hesaplar.
//   node tools/verify-spin.js --server-seed <hex> --client-seed <str> --nonce <n> --game zeus --bet 1000 --rtp 0.965 [--buy fs]
import fs from 'node:fs';
import { buildGames } from '../src/games/engine.js';
import { FairRng, hashSeed } from '../src/games/rng.js';
const cal = JSON.parse(fs.readFileSync(new URL('../src/games/calibration.json', import.meta.url), 'utf8'));
const a = process.argv.slice(2); const o = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
const ss = o('server-seed'), cs = o('client-seed'), nonce = Number(o('nonce')), game = o('game'), bet = Number(o('bet') || 100), rtp = o('rtp'), buy = o('buy');
if (!ss || !cs || !Number.isInteger(nonce) || !game) { console.error('Kullanım: --server-seed --client-seed --nonce --game [--bet] [--rtp] [--buy]'); process.exit(1); }
const g = buildGames(cal, rtp ? { [game]: Number(rtp) } : {})[game];
const rng = new FairRng(ss, cs, nonce); const r = buy ? g.buy(rng, true, buy) : g.play(rng, true);
console.log(JSON.stringify({ serverSeedHash: hashSeed(ss), game, nonce, rtp: g.rtp, winX: r.win, win: Math.round(r.win * bet) }, null, 2));
