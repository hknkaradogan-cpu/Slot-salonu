#!/usr/bin/env node
'use strict';
// Oyun motorunu ve kalibrasyonu tarayıcı/APK "yerel mod" için tek dosyada paketler: client/js/engine.bundle.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/games/engine.js'), 'utf8');
const cal = fs.readFileSync(path.join(__dirname, '../src/games/calibration.json'), 'utf8');
const out = `/* OTOMATİK ÜRETİLDİ: server/tools/build-client-engine.js — elle düzenlemeyin */
(function () {
  var CAL = ${cal.trim()};
  var module = { exports: {} };
  function require(n) { if (n === 'fs') return { readFileSync: function () { return JSON.stringify(CAL); } }; if (n === 'path') return { join: function () { return ''; } }; throw new Error(n); }
  var __dirname = '';
${src}
  window.SlotEngine = module.exports;
})();
`;
fs.writeFileSync(path.join(__dirname, '../../client/js/engine.bundle.js'), out);
console.log('client/js/engine.bundle.js yazıldı', out.length);
