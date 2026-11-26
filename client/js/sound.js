/* Sentezlenmiş ses efektleri ve arka plan müziği (WebAudio, harici dosya gerekmez) */
(function () {
  'use strict';
  let ctx = null, master = null, musicGain = null, musicTimer = null;
  const st = { sound: true, music: true, vibrate: true };
  try { Object.assign(st, JSON.parse(localStorage.getItem('slot_audio') || '{}')); } catch (e) {}
  function save() { try { localStorage.setItem('slot_audio', JSON.stringify(st)); } catch (e) {} }
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.12; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0, dest) {
    const c = ac(); if (!c) return; const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.3, when = 0, hp = 800) {
    const c = ac(); if (!c) return; const t = c.currentTime + when;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const fx = {
    click() { tone(660, 0.06, 'square', 0.12); },
    spin() { for (let i = 0; i < 6; i++) tone(300 + i * 40, 0.05, 'triangle', 0.1, i * 0.05); },
    stop() { tone(140, 0.12, 'sine', 0.35, 0, 0.5); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, i * 0.07)); },
    pop() { noise(0.18, 0.25, 0, 1500); tone(900, 0.12, 'sine', 0.15, 0, 0.3); },
    thunder() { noise(0.6, 0.5, 0, 200); tone(80, 0.5, 'sawtooth', 0.25, 0, 0.4); },
    orb() { tone(1200, 0.25, 'sine', 0.2, 0, 1.8); tone(1800, 0.2, 'sine', 0.1, 0.05, 1.5); },
    coin() { tone(1568, 0.08, 'square', 0.1); tone(2093, 0.12, 'square', 0.1, 0.06); },
    bigwin() { [392, 523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.1)); },
    feature() { [440, 554, 659, 880, 659, 880, 1108].forEach((f, i) => tone(f, 0.22, 'square', 0.12, i * 0.09)); },
    tick() { tone(1000, 0.03, 'square', 0.06); },
    error() { tone(200, 0.2, 'sawtooth', 0.15, 0, 0.6); },
  };
  function play(name) { if (!st.sound) return; try { fx[name] && fx[name](); } catch (e) {} }
  // basit arpej müziği
  const prog = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
  function startMusic() {
    if (!st.music || musicTimer || !ac()) return; let bar = 0;
    const step = () => {
      const ch = prog[bar++ % prog.length];
      ch.forEach((f, i) => { tone(f, 0.5, 'sine', 0.25, i * 0.25, 0, musicGain); tone(f * 2, 0.3, 'triangle', 0.1, 0.75 + i * 0.25, 0, musicGain); });
      tone(ch[0] / 2, 1.8, 'sine', 0.3, 0, 0, musicGain);
    };
    step(); musicTimer = setInterval(step, 2000);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  function vibrate(ms) { if (st.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMusic(); else if (st.music && ctx) startMusic(); });
  window.Sound = {
    play, vibrate, startMusic, stopMusic, get: () => ({ ...st }),
    set(k, v) { st[k] = v; save(); if (k === 'music') v ? startMusic() : stopMusic(); },
  };
})();
