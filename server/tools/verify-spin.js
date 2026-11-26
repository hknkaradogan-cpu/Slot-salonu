#!/usr/bin/env node
'use strict';
/*
 * Spin denetleme aracı: açıklanmış sunucu tohumu ile bir spini yeniden hesaplar.
 *   node tools/verify-spin.js --server-seed <hex> --client-seed <str> --nonce <n> --game zeus --bet 1000
 * Çıktıdaki kazanç, uygulamadaki spin geçmişiyle birebir aynı olmalıdır.
 * Ayrıca sunucu tohumunun SHA-256 özetini yazdırır; bu, spinden önce gösterilen özetle eşleşmelidir.
 */
const { buildGames } = require('../src/games/engine');
const { FairRng, hashSeed } = require('../src/games/rng');
const a = process.argv.slice(2); const o = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
const ss = o('server-seed'), cs = o('client-seed'), nonce = Number(o('nonce')), game = o('game'), bet = Number(o('bet') || 100);
if (!ss || !cs || !Number.isInteger(nonce) || !game) { console.error('Kullanım: --server-seed --client-seed --nonce --game [--bet]'); process.exit(1); }
const g = buildGames()[game]; if (!g) { console.error('Bilinmeyen oyun'); process.exit(1); }
const r = g.play(new FairRng(ss, cs, nonce), true);
console.log(JSON.stringify({ serverSeedHash: hashSeed(ss), game, nonce, winX: r.win, win: Math.round(r.win * bet) }, null, 2));
