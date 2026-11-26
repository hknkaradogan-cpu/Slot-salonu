/* Ortak arayüz yardımcıları: ekranlar, modal, bildirim, sayı biçimi, parçacık efektleri */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
  const short = (n) => n >= 1e9 ? (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms * (window.UI && UI.speed || 1)));
  // Çizim avatarlar (oyunun kendi karakterlerinden): HTML olarak her yerde aynı kullanılır
  const AVATARS = Array.from({ length: 12 }, (_, i) => `<img class="avimg" src="assets/av${i}.webp" alt="" draggable="false">`);

  function show(id) {
    $$('#app > .screen').forEach(s => s.classList.toggle('active', s.id === id));
  }
  function screen(id, html, cls = '') {
    let s = document.getElementById(id);
    if (!s) { s = document.createElement('div'); s.id = id; $('#app').appendChild(s); }
    s.className = 'screen ' + cls; s.innerHTML = html; return s;
  }
  function toast(msg, bad) {
    const d = document.createElement('div'); d.textContent = msg; if (bad) d.className = 'bad';
    $('#toast').appendChild(d); setTimeout(() => d.remove(), 3200);
    if (bad) Sound.play('error');
  }
  let modalClose = null;
  function modal(html, opts = {}) {
    const o = $('#overlay'); o.innerHTML = `<div class="modal ${opts.cls || ''}">${opts.noClose ? '' : '<button class="x" data-close>✕</button>'}${html}</div>`;
    o.classList.add('show');
    return new Promise(res => {
      modalClose = (v) => { o.classList.remove('show'); o.innerHTML = ''; modalClose = null; res(v); };
      o.onclick = (e) => { if (e.target === o && !opts.noClose) modalClose(null); const c = e.target.closest('[data-close]'); if (c) modalClose(c.dataset.close || null); };
      opts.onOpen && opts.onOpen(o.firstElementChild, modalClose);
    });
  }
  function closeModal(v) { if (modalClose) modalClose(v); else { const o = $('#overlay'); o.classList.remove('show'); o.innerHTML = ''; } }
  function confirm(text, yes = 'Evet', no = 'Vazgeç') {
    return modal(`<h3 class="gold">Emin misin?</h3><p class="center">${esc(text)}</p><div class="row"><button class="btn ghost grow" data-close="0">${no}</button><button class="btn green grow" data-close="1">${yes}</button></div>`).then(v => v === '1');
  }
  function errMsg(e) { return (e && e.message) || 'Bir hata oluştu.'; }
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(errMsg(e), true); } finally { if (btn) btn.disabled = false; }
  }

  /* ---------- parçacık efektleri (hafif: önceden çizilmiş sprite, gölge/karışım yok) ---------- */
  const cv = $('#fxCanvas'); const cx = cv.getContext('2d'); let parts = [], running = false;
  function resize() { cv.width = innerWidth; cv.height = innerHeight; } // DPR=1: telefonda 4 kat daha az piksel
  addEventListener('resize', resize); resize();
  function sprite(draw, size) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
  const COIN = sprite((g, s) => { const r = s / 2 - 1, gr = g.createRadialGradient(r * .7, r * .7, 1, r, r, r); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(.6, '#ffc72e'); gr.addColorStop(1, '#a86a0a'); g.fillStyle = gr; g.beginPath(); g.arc(s / 2, s / 2, r, 0, 6.3); g.fill(); g.strokeStyle = '#7a4a00'; g.lineWidth = 1.5; g.stroke(); }, 28);
  const SPARK = {}; const spark = (c) => SPARK[c] || (SPARK[c] = sprite((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 16));
  function loop() {
    cx.clearRect(0, 0, cv.width, cv.height);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      if (p.life <= 0 || p.y > innerHeight + 30) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      cx.globalAlpha = p.life < 20 ? p.life / 20 : 1;
      if (p.kind === 'coin') { const w = p.r * 2 * (Math.abs(Math.cos(p.rot)) * .85 + .15); cx.drawImage(COIN, p.x - w / 2, p.y - p.r, w, p.r * 2); }
      else if (p.kind === 'spark') cx.drawImage(spark(p.c), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
      else { cx.fillStyle = p.c; cx.fillRect(p.x - p.r, p.y - p.r / 2, p.r * 2 * Math.abs(Math.cos(p.rot)) + 1, p.r); }
    }
    cx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop); else { running = false; cx.clearRect(0, 0, cv.width, cv.height); }
  }
  function add(p) { if (parts.length > 140) return; parts.push(p); if (!running) { running = true; requestAnimationFrame(loop); } }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function burst(x, y, n = 12, colors = ['#ffd34d', '#ff7acf', '#7fd8ff']) { n = Math.min(n, 12); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = rnd(2, 6); add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12, r: rnd(2, 4), rot: 0, vr: 0, life: rnd(18, 34), c: colors[i % colors.length] }); } }
  function coinShower(n = 24) { for (let i = 0; i < n; i++) add({ kind: 'coin', x: rnd(0, innerWidth), y: rnd(-260, -20), vx: rnd(-1.2, 1.2), vy: rnd(3, 6), g: 0.16, r: rnd(8, 13), rot: Math.random() * 6, vr: rnd(-.2, .2), life: 160 }); }
  function coinBurst(x, y, n = 12) { for (let i = 0; i < n; i++) { const a = rnd(-Math.PI, 0), v = rnd(4, 10); add({ kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.35, r: rnd(7, 11), rot: Math.random() * 6, vr: rnd(-.3, .3), life: 90 }); } }
  function confetti(n = 40) { const c = ['#ff5d73', '#35d6ff', '#ffd23f', '#6bff7a', '#c07bff']; for (let i = 0; i < n; i++) add({ kind: 'conf', x: rnd(0, innerWidth), y: rnd(-200, 0), vx: rnd(-1.5, 1.5), vy: rnd(1, 3.5), g: 0.05, r: rnd(4, 7), rot: Math.random() * 6, vr: rnd(-.2, .2), life: 200, c: c[i % c.length] }); }

  window.UI = { $, $$, esc, fmt, short, sleep, show, screen, toast, modal, closeModal, confirm, errMsg, guard, burst, coinShower, coinBurst, confetti, AVATARS, speed: 1 };
})();
