/* SPINOVA ses motoru (WebAudio ile sentez, harici dosya yok)
 * - Her oyunun kendi ses paketi: Sound.theme(id) çağrılınca play('win') gibi ortak adlar o oyunun sesine dönüşür
 * - Her oyunun kendi müziği (makam/gam, tempo, çalgı ve ritim farklı)
 * - Kullanıcı ayarları: ses efekti / müzik aç-kapa ve ses seviyeleri, titreşim */
(function () {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musBus = null, comp = null;
  const st = { sound: true, music: true, vibrate: true, sfxVol: 0.8, musVol: 0.5 };
  try { Object.assign(st, JSON.parse(localStorage.getItem('slot_audio') || '{}')); } catch (e) { /* */ }
  function save() { try { localStorage.setItem('slot_audio', JSON.stringify(st)); } catch (e) { /* */ } }
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55 * st.sfxVol; sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = 0.32 * st.musVol; musBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  /* ---------- temel üreteçler ---------- */
  function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0, dest, att = 0.008) {
    const c = ac(); if (!c) return; const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  /* filtreli çalgı sesi: saz/ud (pluck), bakır (brass), org/akordeon (reed) */
  function voice(kind, freq, dur, vol, when, dest) {
    const c = ac(); if (!c) return; const t = c.currentTime + when;
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    const cfg = { pluck: ['sawtooth', 'sawtooth', 3200, 400, 0.004], brass: ['sawtooth', 'square', 900, 2400, 0.06], reed: ['square', 'square', 1800, 1800, 0.03], bell: ['sine', 'sine', 8000, 8000, 0.002], pad: ['triangle', 'sawtooth', 700, 1100, 0.25], lead: ['square', 'triangle', 2600, 2600, 0.02] }[kind] || ['sine', 'sine', 4000, 4000, 0.01];
    o.type = cfg[0]; o2.type = cfg[1]; o.frequency.value = freq; o2.frequency.value = kind === 'bell' ? freq * 2.76 : freq * 1.004;
    f.type = 'lowpass'; f.frequency.setValueAtTime(cfg[2], t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cfg[3]), t + Math.min(dur, 0.4));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + cfg[4]); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = kind === 'bell' ? 0.25 : 0.5;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dest || sfxBus);
    if (kind === 'lead') { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.3, when = 0, freq = 800, type = 'highpass', dest, q = 0.8, sweep = 0) {
    const c = ac(); if (!c) return; const t = c.currentTime + when;
    const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(dest || sfxBus); s.start(t);
  }
  const kick = (w, v = 0.5, d) => { tone(150, 0.22, 'sine', v, w, 0.3, d); };
  const hat = (w, v = 0.06, d) => noise(0.04, v, w, 7000, 'highpass', d);
  const snare = (w, v = 0.18, d) => { noise(0.16, v, w, 1800, 'bandpass', d, 0.6); tone(190, 0.08, 'triangle', v * 0.6, w, 0.7, d); };
  const doum = (w, v = 0.45, d) => { tone(95, 0.3, 'sine', v, w, 0.7, d); noise(0.05, v * 0.3, w, 300, 'lowpass', d); };
  const tek = (w, v = 0.16, d) => { noise(0.05, v, w, 3200, 'bandpass', d, 2); tone(720, 0.04, 'sine', v * 0.5, w, 0, d); };
  const taiko = (w, v = 0.55, d) => { tone(70, 0.5, 'sine', v, w, 0.5, d); noise(0.12, v * 0.35, w, 500, 'lowpass', d); };
  const coins = (n = 6, w = 0, v = 0.09) => { for (let i = 0; i < n; i++) { const f = 2200 + Math.random() * 1800; tone(f, 0.09, 'square', v, w + i * 0.045 + Math.random() * 0.02); tone(f * 1.5, 0.06, 'sine', v * 0.6, w + i * 0.045 + 0.02); } };
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi → Hz

  /* ---------- ortak efektler ---------- */
  const base = {
    click() { tone(1200, 0.035, 'square', 0.07); tone(600, 0.05, 'sine', 0.1); },
    spin() { for (let i = 0; i < 8; i++) noise(0.05, 0.08, i * 0.045, 1200 + i * 150, 'bandpass', null, 3); },
    stop() { tone(120, 0.14, 'sine', 0.38, 0, 0.5); noise(0.05, 0.12, 0, 900, 'lowpass'); },
    win() { [N(72), N(76), N(79), N(84)].forEach((f, i) => voice('bell', f, 0.4, 0.16, i * 0.07)); coins(4, 0.25); },
    pop() { noise(0.16, 0.22, 0, 1500); tone(900, 0.12, 'sine', 0.15, 0, 0.3); },
    thunder() { noise(0.9, 0.55, 0, 260, 'lowpass', null, 0.5, 0.4); noise(0.12, 0.4, 0, 3000); tone(55, 0.8, 'sawtooth', 0.2, 0, 0.6); },
    orb() { tone(1200, 0.25, 'sine', 0.2, 0, 1.8); tone(1800, 0.2, 'sine', 0.1, 0.05, 1.5); },
    coin() { coins(2); },
    bigwin() { [67, 72, 76, 79, 84, 88, 91].forEach((m, i) => voice('brass', N(m), 0.4, 0.14, i * 0.09)); coins(12, 0.5); },
    jackpot() { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => { voice('brass', N(m), 0.5, 0.15, i * 0.08); voice('bell', N(m + 12), 0.6, 0.08, i * 0.08); }); [0, 0.6, 0.9].forEach(w => kick(w + 0.6, 0.5)); coins(22, 0.7, 0.08); },
    feature() { [440, 554, 659, 880, 659, 880, 1108].forEach((f, i) => tone(f, 0.22, 'square', 0.1, i * 0.09)); },
    tick() { tone(1000, 0.03, 'square', 0.05); },
    error() { tone(200, 0.2, 'sawtooth', 0.14, 0, 0.6); },
    whoosh() { noise(0.45, 0.25, 0, 400, 'bandpass', null, 1.2, 6); },
    /* okey taşları: gerçek taş "tık"ı, çekme kayması, ıstakaya oturma */
    tile() { noise(0.035, 0.32, 0, 2600, 'bandpass', null, 3); tone(1450, 0.05, 'sine', 0.12); tone(380, 0.06, 'triangle', 0.1); },
    tileDraw() { noise(0.18, 0.12, 0, 900, 'bandpass', null, 1, 2.5); setTimeout(() => base.tile(), 140); },
    tileDrop() { noise(0.04, 0.4, 0, 2000, 'bandpass', null, 2.5); tone(260, 0.09, 'triangle', 0.18); noise(0.03, 0.2, 0.05, 2600, 'bandpass', null, 3); },
    /* tavla: zar tıkırtısı ve pul */
    dice() { for (let i = 0; i < 9; i++) { const w = i * 0.055 + Math.random() * 0.03; noise(0.03, 0.3 - i * 0.02, w, 2200 + Math.random() * 1500, 'bandpass', null, 4); } noise(0.05, 0.35, 0.55, 1400, 'bandpass', null, 2); tone(420, 0.06, 'triangle', 0.15, 0.55); noise(0.04, 0.25, 0.68, 1700, 'bandpass', null, 2); },
    checker() { tone(240, 0.1, 'sine', 0.3, 0, 0.7); noise(0.05, 0.3, 0, 700, 'lowpass'); },
    /* uçak */
    takeoff() { noise(1.2, 0.18, 0, 300, 'lowpass', null, 1, 4); tone(110, 1.2, 'sawtooth', 0.08, 0, 2.2); },
    crash() { noise(1.1, 0.6, 0, 900, 'lowpass', null, 0.7, 0.15); tone(160, 0.6, 'sawtooth', 0.2, 0, 0.25); },
    cashout() { voice('bell', N(84), 0.3, 0.18, 0); voice('bell', N(91), 0.4, 0.15, 0.08); coins(8, 0.1); },
    fanfare() { /* açılış fanfarı */
      const s = [[0, 60, 0.18], [0.16, 64, 0.18], [0.32, 67, 0.18], [0.5, 72, 0.6], [0.95, 71, 0.15], [1.1, 72, 0.15], [1.25, 76, 0.8]];
      s.forEach(([w, m, d]) => { voice('brass', N(m), d + 0.1, 0.17, w); voice('brass', N(m - 12), d + 0.1, 0.1, w); });
      [0.5, 1.25].forEach(w => { kick(w, 0.55); noise(1.2, 0.08, w, 6000, 'highpass'); }); taiko(0, 0.4);
      [79, 84, 88, 91, 96].forEach((m, i) => voice('bell', N(m), 0.7, 0.07, 1.3 + i * 0.06));
      noise(1.4, 0.07, 0, 300, 'bandpass', null, 1, 12); // yükselen parıltı
    },
  };
  /* ---------- oyunlara özel ses paketleri ---------- */
  const packs = {
    okey: { win() { [62, 63, 66, 67, 69].forEach((m, i) => voice('pluck', N(m + 12), 0.35, 0.16, i * 0.08)); coins(5, 0.4); }, stop: base.tileDrop, click: base.tile },
    tavla: { win() { [64, 65, 68, 69, 71, 72].forEach((m, i) => voice('pluck', N(m), 0.4, 0.15, i * 0.07)); }, stop: base.checker, roll: base.dice },
    aviator: { win: base.cashout, pop: base.crash },
    slot: { spin() { for (let i = 0; i < 10; i++) noise(0.05, 0.09, i * 0.04, 1500 + i * 120, 'bandpass', null, 4); tone(220, 0.35, 'triangle', 0.06, 0, 1.6); }, stop() { tone(150, 0.12, 'sine', 0.4, 0, 0.5); noise(0.04, 0.25, 0, 2500, 'bandpass', null, 3); }, win() { [72, 76, 79, 84].forEach((m, i) => voice('bell', N(m), 0.35, 0.16, i * 0.06)); coins(6, 0.2); } },
    zeus: { spin() { noise(0.4, 0.12, 0, 600, 'bandpass', null, 1, 3); tone(65, 0.4, 'sawtooth', 0.08, 0, 1.4); }, stop() { taiko(0, 0.35); }, win() { base.thunder(); [57, 60, 64, 69].forEach((m, i) => voice('brass', N(m), 0.5, 0.12, 0.15 + i * 0.1)); }, bigwin() { base.thunder(); setTimeout(base.thunder, 450); [57, 60, 64, 69, 72, 76].forEach((m, i) => voice('brass', N(m), 0.6, 0.14, 0.2 + i * 0.11)); coins(14, 0.8); }, orb() { noise(0.25, 0.25, 0, 4000, 'highpass'); tone(1600, 0.3, 'sawtooth', 0.06, 0, 0.3); } },
    misir: { spin() { noise(0.5, 0.1, 0, 1200, 'bandpass', null, 0.8, 0.4); }, stop() { tone(98, 0.3, 'sine', 0.3, 0, 0.8); noise(0.06, 0.15, 0, 1200, 'bandpass'); }, win() { [62, 63, 66, 67, 69, 70, 74].forEach((m, i) => voice('lead', N(m + 12), 0.25, 0.1, i * 0.07)); }, feature() { /* gong */ tone(110, 2.5, 'sine', 0.35, 0, 0.98); tone(166, 2.2, 'sine', 0.2, 0, 0.99); tone(241, 1.8, 'sine', 0.12, 0, 0.99); noise(1.5, 0.08, 0, 2500, 'bandpass', null, 2); }, bigwin() { packs.misir.feature(); coins(14, 0.4); } },
    peri: { spin() { [84, 88, 91, 95].forEach((m, i) => voice('bell', N(m), 0.25, 0.05, i * 0.05)); }, stop() { voice('bell', N(96 - Math.floor(Math.random() * 5)), 0.3, 0.07, 0); tone(300, 0.08, 'sine', 0.15); }, win() { [72, 76, 79, 83, 86, 91].forEach((m, i) => voice('bell', N(m), 0.6, 0.11, i * 0.06)); noise(0.8, 0.05, 0, 6000, 'highpass'); }, orb() { [91, 95, 98].forEach((m, i) => voice('bell', N(m), 0.4, 0.1, i * 0.04)); tone(800, 0.5, 'sine', 0.08, 0, 2.5); }, bigwin() { for (let i = 0; i < 14; i++) voice('bell', N([72, 76, 79, 83, 86][i % 5] + 12 * Math.floor(i / 5)), 0.7, 0.1, i * 0.06); coins(10, 0.6); } },
    korsan: { spin() { noise(0.6, 0.1, 0, 500, 'lowpass', null, 0.6, 2); }, stop() { tone(180, 0.12, 'triangle', 0.25, 0, 0.6); noise(0.06, 0.2, 0, 900, 'lowpass'); }, win() { [67, 71, 74, 79].forEach((m, i) => voice('reed', N(m), 0.3, 0.1, i * 0.1)); coins(6, 0.3); }, chest() { tone(140, 0.5, 'sawtooth', 0.05, 0, 1.6); noise(0.5, 0.08, 0, 600, 'bandpass', null, 6, 1.6); coins(16, 0.45); }, bigwin() { packs.korsan.chest(); [67, 71, 74, 79, 83].forEach((m, i) => voice('reed', N(m), 0.4, 0.11, 0.3 + i * 0.1)); }, wave() { noise(1.6, 0.12, 0, 400, 'lowpass', null, 0.5, 1.8); } },
    vegas: { spin() { for (let i = 0; i < 12; i++) tone(700 + (i % 4) * 140, 0.04, 'square', 0.04, i * 0.035); }, stop() { tone(1400, 0.06, 'square', 0.08); tone(160, 0.1, 'sine', 0.3, 0, 0.5); }, win() { for (let i = 0; i < 8; i++) tone(i % 2 ? 1760 : 1320, 0.07, 'square', 0.07, i * 0.06); coins(6, 0.45); }, bigwin() { for (let i = 0; i < 20; i++) tone([1320, 1568, 1760, 2093][i % 4], 0.07, 'square', 0.07, i * 0.055); coins(16, 1.1); } },
    ejderha: { spin() { noise(0.5, 0.18, 0, 700, 'bandpass', null, 0.8, 2.4); }, stop() { taiko(0, 0.4); }, win() { packs.ejderha.roar(); coins(8, 0.5); }, roar() { const c = ac(); if (!c) return; noise(1.0, 0.35, 0, 350, 'lowpass', null, 3, 0.5); tone(90, 0.9, 'sawtooth', 0.16, 0, 0.6); tone(134, 0.8, 'sawtooth', 0.09, 0.05, 0.55); }, bigwin() { packs.ejderha.roar(); [0.3, 0.55, 0.8].forEach(w => taiko(w, 0.5)); [69, 72, 74, 76, 79].forEach((m, i) => voice('brass', N(m), 0.5, 0.12, 0.6 + i * 0.1)); coins(16, 0.9); } },
    altin: { spin() { [79, 83, 86].forEach((m, i) => voice('bell', N(m), 0.18, 0.05, i * 0.06)); }, stop() { tone(200, 0.1, 'sine', 0.3, 0, 0.6); coins(1); }, win() { [72, 74, 76, 79, 81, 84].forEach((m, i) => voice('bell', N(m), 0.4, 0.13, i * 0.06)); coins(8, 0.3); }, bigwin() { tone(140, 0.5, 'sawtooth', 0.05, 0, 1.6); coins(28, 0.3, 0.08); [72, 76, 79, 84, 88].forEach((m, i) => voice('brass', N(m), 0.5, 0.13, 0.4 + i * 0.1)); } },
  };
  let theme = 'hall';
  function play(name) {
    if (!st.sound) return;
    try { const p = packs[theme]; const f = (p && p[name]) || base[name]; f && f(); } catch (e) { /* */ }
  }
  /* ---------- müzik: her oyunun kendi bestesi ---------- */
  // prog: akor kökleri (midi), scale: melodi gamı (yarım ses), bpm, inst: melodi çalgısı, beat: ritim fonksiyonu
  const songs = {
    hall: { bpm: 92, prog: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], scale: [0, 2, 4, 7, 9, 12], inst: 'bell', pad: 'pad', beat(w, s, d) { if (s % 4 === 0) kick(w, 0.25, d); if (s % 2 === 1) hat(w, 0.03, d); } },
    okey: { bpm: 100, prog: [[62, 66, 69], [62, 66, 69], [60, 63, 67], [62, 66, 69]], scale: [0, 1, 4, 5, 7, 8, 10, 12], inst: 'pluck', pad: null, beat(w, s, d) { const p = s % 8; if (p === 0 || p === 3) doum(w, 0.35, d); if (p === 2 || p === 5 || p === 6) tek(w, 0.12, d); } },
    tavla: { bpm: 84, prog: [[64, 67, 71], [62, 65, 69], [64, 67, 71], [60, 64, 67]], scale: [0, 1, 3, 5, 7, 8, 10, 12], inst: 'pluck', pad: 'pad', beat(w, s, d) { const p = s % 8; if (p === 0) doum(w, 0.3, d); if (p === 4 || p === 6) tek(w, 0.1, d); } },
    aviator: { bpm: 118, prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], scale: [0, 3, 5, 7, 10, 12], inst: 'lead', pad: 'pad', beat(w, s, d) { if (s % 2 === 0) kick(w, 0.3, d); if (s % 4 === 2) snare(w, 0.1, d); hat(w + 30 / 118, 0.03, d); } },
    slot: { bpm: 112, prog: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], scale: [0, 2, 4, 7, 9, 12], inst: 'bell', pad: 'reed', beat(w, s, d) { if (s % 2 === 0) kick(w, 0.28, d); if (s % 4 === 2) snare(w, 0.1, d); hat(w, 0.03, d); } },
    zeus: { bpm: 76, prog: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], scale: [0, 2, 3, 7, 8, 12], inst: 'brass', pad: 'pad', beat(w, s, d) { if (s % 4 === 0) taiko(w, 0.45, d); if (s % 8 === 6) taiko(w, 0.3, d); } },
    misir: { bpm: 96, prog: [[62, 65, 69], [62, 65, 69], [63, 67, 70], [62, 66, 69]], scale: [0, 1, 4, 5, 7, 8, 10, 12], inst: 'lead', pad: 'pad', beat(w, s, d) { const p = s % 8; if (p === 0 || p === 3) doum(w, 0.3, d); if (p === 2 || p === 6) tek(w, 0.1, d); } },
    peri: { bpm: 80, prog: [[65, 69, 72, 76], [67, 71, 74, 78], [64, 67, 71, 74], [62, 65, 69, 72]], scale: [0, 2, 4, 6, 7, 9, 11, 12], inst: 'bell', pad: 'pad', beat(w, s, d) { if (s % 8 === 0) hat(w, 0.02, d); } },
    korsan: { bpm: 126, prog: [[67, 71, 74], [62, 66, 69], [67, 71, 74], [60, 64, 67]], scale: [0, 2, 4, 5, 7, 9, 12], inst: 'reed', pad: null, beat(w, s, d) { const p = s % 6; if (p === 0) kick(w, 0.3, d); if (p === 3) snare(w, 0.08, d); } },
    vegas: { bpm: 122, prog: [[60, 64, 67, 70], [65, 69, 72, 75], [60, 64, 67, 70], [67, 71, 74, 77]], scale: [0, 2, 4, 7, 9, 10, 12], inst: 'lead', pad: 'reed', beat(w, s, d) { kick(w, 0.25, d); if (s % 2 === 1) hat(w, 0.05, d); if (s % 4 === 2) snare(w, 0.12, d); } },
    ejderha: { bpm: 88, prog: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 62]], scale: [0, 3, 5, 7, 10, 12], inst: 'pluck', pad: 'pad', beat(w, s, d) { if (s % 4 === 0) taiko(w, 0.45, d); if (s % 4 === 3) taiko(w, 0.25, d); } },
    altin: { bpm: 108, prog: [[62, 66, 69], [67, 71, 74], [64, 67, 71], [69, 73, 76]], scale: [0, 2, 4, 7, 9, 12], inst: 'bell', pad: 'reed', beat(w, s, d) { if (s % 4 === 0) kick(w, 0.22, d); if (s % 2 === 1) hat(w, 0.04, d); } },
  };
  let musicTimer = null, musicTheme = null, step = 0, nextT = 0, motif = [];
  function schedule() {
    const c = ctx; if (!c) return; const S = songs[musicTheme] || songs.hall; const sp = 60 / S.bpm / 2; // sekizlik
    while (nextT < c.currentTime + 0.4) {
      const w = nextT - c.currentTime, bar = Math.floor(step / 8) % S.prog.length, ch = S.prog[bar], s8 = step % 8;
      if (s8 === 0) { tone(N(ch[0] - 12), sp * 8, 'sine', 0.22, w, 0, musBus, 0.05); if (S.pad) ch.forEach(m => voice(S.pad, N(m), sp * 7.5, 0.035, w, musBus)); if (bar === 0) motif = Array.from({ length: 8 }, () => Math.random() < 0.55 ? S.scale[Math.floor(Math.random() * S.scale.length)] : null); }
      const n = motif[s8]; if (n != null) voice(S.inst, N(ch[0] + 12 + n), sp * 1.8, S.inst === 'brass' ? 0.06 : 0.08, w, musBus);
      S.beat(w, step, musBus);
      nextT += sp; step++;
    }
  }
  function startMusic(t) {
    if (t) musicTheme = t; if (!musicTheme) musicTheme = theme;
    if (!st.music || !ac()) return;
    if (musicTimer) return; nextT = ctx.currentTime + 0.05; step = 0; musicTimer = setInterval(schedule, 120); schedule();
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  /* ---------- sürekli sesler (uçak motoru) ---------- */
  const loops = {};
  function loopStart(name) {
    if (!st.sound || loops[name] || !ac()) return; const c = ctx;
    if (name === 'engine') {
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 70; o2.frequency.value = 35.5; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.0001;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxBus); o.start(); o2.start(); g.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 0.6);
      loops.engine = { set(m) { const fr = 70 + Math.min(140, Math.log(Math.max(1, m)) * 45); o.frequency.setTargetAtTime(fr, c.currentTime, 0.2); o2.frequency.setTargetAtTime(fr / 2 + 0.5, c.currentTime, 0.2); f.frequency.setTargetAtTime(500 + fr * 4, c.currentTime, 0.2); }, stop() { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15); setTimeout(() => { o.stop(); o2.stop(); }, 700); } };
    }
  }
  function loopSet(name, v) { loops[name] && loops[name].set(v); }
  function loopStop(name) { if (loops[name]) { loops[name].stop(); delete loops[name]; } }
  /** Oyuna geçiş: ses paketi + müzik bu oyuna geçer (id: hall, okey, tavla, aviator, slot, zeus, misir, peri, korsan, vegas, ejderha, altin) */
  function setTheme(id) {
    theme = packs[id] || songs[id] ? id : 'hall';
    if (musicTheme !== theme) { const was = !!musicTimer; stopMusic(); musicTheme = theme; if (was || st.music) startMusic(); }
  }
  function intro() { if (!st.sound && !st.music) return; const s = st.sound; st.sound = true; try { base.fanfare(); } finally { st.sound = s; } }
  function vibrate(ms) { if (st.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* */ } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopMusic(); Object.keys(loops).forEach(loopStop); } else if (st.music && ctx && musicTheme) startMusic(); });
  window.Sound = {
    play, vibrate, startMusic, stopMusic, intro, theme: setTheme, loopStart, loopSet, loopStop, currentTheme: () => theme, get: () => ({ ...st }),
    set(k, v) {
      st[k] = v; save();
      if (k === 'music') v ? startMusic() : stopMusic();
      if (k === 'sfxVol' && sfxBus) sfxBus.gain.value = 0.55 * v;
      if (k === 'musVol' && musBus) musBus.gain.value = 0.32 * v;
    },
  };
})();
