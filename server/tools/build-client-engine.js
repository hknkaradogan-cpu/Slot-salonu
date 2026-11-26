#!/usr/bin/env node
// Oyun motorunu ve kalibrasyonu istemci "yerel mod" için tek dosyada paketler: client/js/engine.bundle.js
import fs from 'node:fs';
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
let src = rd('../src/games/engine.js').replace(/^export \{[^}]*\};?$/gm, '').replace(/^export (const|function|class) /gm, '$1 ');
const cal = rd('../src/games/calibration.json');
const out = `/* OTOMATİK ÜRETİLDİ: server/tools/build-client-engine.js — elle düzenlemeyin */
(function () {
  var CAL = ${cal.trim()};
${src}
  window.SlotEngine = { buildGames: function (rtp) { return buildGames(CAL, rtp || {}); }, ORDER: ORDER, DEFAULT_RTP: DEFAULT_RTP };
})();
`;
fs.writeFileSync(new URL('../../client/js/engine.bundle.js', import.meta.url), out);
console.log('client/js/engine.bundle.js yazıldı', out.length);
