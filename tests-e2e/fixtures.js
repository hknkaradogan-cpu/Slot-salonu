// Her oyun için bonus özellikli örnek sonuçlar üretir (görsel test ve tanıtım videosu için)
const { buildGames, ORDER } = require('../server/src/games/engine');
const { FastRng } = require('../server/src/games/rng');
const G = buildGames(); const out = {};
for (const id of ORDER) {
  const rng = new FastRng('demo-' + id); out[id] = {};
  for (let i = 0; i < 3e6; i++) {
    const r = G[id].play(rng, true);
    const feat = r.fs || r.hold || r.wheel;
    if (feat && r.win > 40 && r.win < 800 && !out[id].feature) out[id].feature = r;
    if (!feat && r.win >= 15 && !out[id].big) out[id].big = r;
    if (G[id].family === 'tumble' && !feat && r.base.steps.length >= 2 && r.base.multSum > 0 && r.win > 5 && !out[id].cascade) out[id].cascade = r;
    if (out[id].feature && out[id].big && (G[id].family !== 'tumble' || out[id].cascade)) break;
  }
  console.error(id, Object.keys(out[id]));
}
require('fs').writeFileSync('./fixtures.json', JSON.stringify(out));
