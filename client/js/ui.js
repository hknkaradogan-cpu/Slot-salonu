/* Ortak arayüz yardımcıları: ekranlar, modal, bildirim, sayı biçimi, parçacık efektleri */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
  const short = (n) => n >= 1e9 ? (n / 1e9).toFixed(n % 1e9 ? 1 : 0) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : fmt(n);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms * (window.UI && UI.speed || 1)));
  const AVATARS = ['🧙‍♂️', '🧚', '🤴', '👸', '🧛', '🦸', '🧝‍♀️', '🐉', '🦁', '🐺', '🦄', '😎'];

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
  function closeModal(v) { modalClose && modalClose(v); }
  function confirm(text, yes = 'Evet', no = 'Vazgeç') {
    return modal(`<h3 class="gold">Emin misin?</h3><p class="center">${esc(text)}</p><div class="row"><button class="btn ghost grow" data-close="0">${no}</button><button class="btn green grow" data-close="1">${yes}</button></div>`).then(v => v === '1');
  }
  function errMsg(e) { return (e && e.message) || 'Bir hata oluştu.'; }
  async function guard(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { toast(errMsg(e), true); } finally { if (btn) btn.disabled = false; }
  }

  /* ---------- parçacık efektleri (tam ekran tuval) ---------- */
  const cv = $('#fxCanvas'); const cx = cv.getContext('2d'); let parts = [], running = false, dpr = 1;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  addEventListener('resize', resize); resize();
  function loop() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      cx.save(); cx.translate(p.x, p.y); cx.globalAlpha = Math.min(1, p.life / 20);
      if (p.kind === 'coin') {
        cx.scale(Math.abs(Math.cos(p.rot)) * 0.9 + 0.1, 1);
        const g = cx.createRadialGradient(-p.r * .3, -p.r * .3, 1, 0, 0, p.r); g.addColorStop(0, '#fff6b0'); g.addColorStop(.6, '#ffc72e'); g.addColorStop(1, '#a86a0a');
        cx.beginPath(); cx.arc(0, 0, p.r, 0, 6.3); cx.fillStyle = g; cx.fill(); cx.lineWidth = 1.5; cx.strokeStyle = '#7a4a00'; cx.stroke();
      } else if (p.kind === 'spark') {
        cx.globalCompositeOperation = 'lighter'; cx.beginPath(); cx.arc(0, 0, p.r, 0, 6.3); cx.fillStyle = p.c; cx.shadowBlur = 12; cx.shadowColor = p.c; cx.fill();
      } else { cx.rotate(p.rot); cx.fillStyle = p.c; cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); }
      cx.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; cx.clearRect(0, 0, cv.width, cv.height); }
  }
  function add(p) { if (parts.length > 600) return; parts.push(p); if (!running) { running = true; requestAnimationFrame(loop); } }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function burst(x, y, n = 24, colors = ['#fff6b0', '#ffd34d', '#ff7acf', '#7fd8ff']) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = rnd(2, 8); add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12, r: rnd(2, 5), rot: 0, vr: 0, life: rnd(25, 50), c: colors[i % colors.length] }); }
  }
  function coinShower(n = 80) { for (let i = 0; i < n; i++) add({ kind: 'coin', x: rnd(0, innerWidth), y: rnd(-300, -20), vx: rnd(-1.5, 1.5), vy: rnd(2, 6), g: 0.18, r: rnd(7, 13), rot: Math.random() * 6, vr: rnd(-.25, .25), life: 220 }); }
  function coinBurst(x, y, n = 30) { for (let i = 0; i < n; i++) { const a = rnd(-Math.PI, 0), v = rnd(4, 11); add({ kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.35, r: rnd(6, 11), rot: Math.random() * 6, vr: rnd(-.3, .3), life: 120 }); } }
  function confetti(n = 120) { const c = ['#ff5d73', '#35d6ff', '#ffd23f', '#6bff7a', '#c07bff', '#ff9ae8']; for (let i = 0; i < n; i++) add({ kind: 'conf', x: rnd(0, innerWidth), y: rnd(-200, 0), vx: rnd(-2, 2), vy: rnd(1, 4), g: 0.06, r: rnd(4, 8), rot: Math.random() * 6, vr: rnd(-.2, .2), life: 260, c: c[i % c.length] }); }

  window.UI = { $, $$, esc, fmt, short, sleep, show, screen, toast, modal, closeModal, confirm, errMsg, guard, burst, coinShower, coinBurst, confetti, AVATARS, speed: 1 };
})();
