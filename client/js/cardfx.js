/* SPINOVA — canlı oyun kartları ve oyun açılış gösterileri.
 * Her oyunun KENDİ animasyonu vardır (aynı efekt kopyalanmaz):
 *  101 Okey: ıstakaya taş çekilir, oturur, taş atılır · Düz Okey: seri dizilir, desteden taş çekilir, atılır
 *  Tavla: zarlar yuvarlanır, pul ilerler · Avivasor: kamera uçağı izler, hız çizgileri, çarpan sayacı
 *  Slot Salonu: 3 makara gerçekten döner ve sırayla durur · Vegas: 4 makara, sembol yağmuru + neon ampuller
 *  Zeus: şimşekler eline iner · Mısır: altın tozu, meşale, göz parıltısı · Peri: kanat çırpar, büyü küresi, kelebekler
 *  Korsan: dalgalar, gemi sallanır, sandıktan altın fışkırır · Ejderha: alev püskürtür, kıvılcımlar · Altın Şans: ışık huzmeleri, altın fıskiyesi
 * Kart görünmüyorsa veya uygulama arka plandaysa animasyon durur (pil/performans). */
(function () {
  'use strict';
  const R = Math.random, TAU = Math.PI * 2;
  const live = new Set(); let raf = 0, last = 0;
  const tileH = (n, c, cls = '') => `<i class="ct ${cls}" style="--c:${c}">${n}</i>`;
  const SYM = { seven: 'a_seven', cherry: 'a_cherry', lemon: 'a_lemon', bell: 'a_bell', bar: 'a_bar', grape: 'a_grape', melon: 'a_melon' };
  const reelHtml = (cls, syms) => `<span class="creel ${cls}"><span class="cstrip">${syms.map(s => `<img src="assets/${SYM[s]}.webp" alt="">`).join('')}</span></span>`;

  /* ---------------- parçacıklar (tüm kartlar için ortak çizici) ---------------- */
  function drawP(I, dt) {
    const x = I.x, P = I.P;
    x.globalCompositeOperation = 'lighter';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt; if (p.life <= 0) { P.splice(i, 1); continue; }
      p.vx += (p.ax || 0) * dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      const a = Math.min(1, p.life / (p.fade || 20)) * (p.a || 1);
      if (p.t === 'coin') {
        x.globalCompositeOperation = 'source-over'; p.rot += 0.25 * dt; const w = Math.abs(Math.cos(p.rot)) * p.r + 0.6;
        x.globalAlpha = a; x.fillStyle = '#a86d00'; x.beginPath(); x.ellipse(p.x, p.y + 0.8, w, p.r, 0, 0, TAU); x.fill();
        x.fillStyle = '#ffd34d'; x.beginPath(); x.ellipse(p.x, p.y, w, p.r, 0, 0, TAU); x.fill();
        x.fillStyle = '#fff6b0'; x.beginPath(); x.ellipse(p.x - w * 0.3, p.y - p.r * 0.3, w * 0.3, p.r * 0.3, 0, 0, TAU); x.fill();
        x.globalAlpha = 1; x.globalCompositeOperation = 'lighter';
      } else if (p.t === 'flame') {
        const k = 1 - p.life / p.max, r = p.r * (0.6 + k * 1.6);
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,250,200,${a * (1 - k)})`); g.addColorStop(0.35, `rgba(255,${160 - k * 120 | 0},30,${a * 0.8})`); g.addColorStop(1, 'rgba(120,10,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r, 0, TAU); x.fill();
      } else if (p.t === 'star') {
        x.globalAlpha = a; x.fillStyle = p.c || '#fff'; const s = p.r * (0.6 + 0.4 * Math.sin(p.life * 0.3));
        x.fillRect(p.x - s * 2.2, p.y - 0.5, s * 4.4, 1); x.fillRect(p.x - 0.5, p.y - s * 2.2, 1, s * 4.4);
        x.beginPath(); x.arc(p.x, p.y, s * 0.7, 0, TAU); x.fill(); x.globalAlpha = 1;
      } else if (p.t === 'fly') { // kelebek
        p.ph += 0.5 * dt; const f = Math.abs(Math.sin(p.ph)) * p.r; x.globalAlpha = a; x.fillStyle = p.c;
        x.beginPath(); x.ellipse(p.x - f * 0.6, p.y, f * 0.7, p.r * 0.8, -0.4, 0, TAU); x.ellipse(p.x + f * 0.6, p.y, f * 0.7, p.r * 0.8, 0.4, 0, TAU); x.fill(); x.globalAlpha = 1;
        p.vx += (R() - 0.5) * 0.08 * dt; p.vy += (R() - 0.5) * 0.08 * dt;
      } else {
        x.globalAlpha = a; x.fillStyle = p.c || '#ffd36b'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, TAU); x.fill(); x.globalAlpha = 1;
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  /* şimşek: kırık çizgi (orta nokta kaydırma) */
  function boltPts(x1, y1, x2, y2, d, out) {
    if (d < 3) { out.push([x2, y2]); return; }
    const mx = (x1 + x2) / 2 + (R() - 0.5) * d, my = (y1 + y2) / 2 + (R() - 0.5) * d * 0.5;
    boltPts(x1, y1, mx, my, d / 2, out); boltPts(mx, my, x2, y2, d / 2, out);
  }
  function drawBolts(I, dt) {
    const x = I.x; x.globalCompositeOperation = 'lighter';
    for (let i = I.B.length - 1; i >= 0; i--) {
      const b = I.B[i]; b.life -= dt; if (b.life <= 0) { I.B.splice(i, 1); continue; }
      const a = Math.min(1, b.life / 6) * (R() < 0.15 ? 0.4 : 1);
      [[b.w * 4, `rgba(120,170,255,${a * 0.25})`], [b.w * 2, `rgba(170,210,255,${a * 0.5})`], [b.w * 0.8, `rgba(255,255,255,${a})`]].forEach(([lw, c]) => {
        x.strokeStyle = c; x.lineWidth = lw; x.lineJoin = 'round'; x.beginPath(); x.moveTo(b.p[0][0], b.p[0][1]); b.p.forEach(q => x.lineTo(q[0], q[1])); x.stroke();
      });
    }
    x.globalCompositeOperation = 'source-over';
  }
  function bolt(I, x1, y1, x2, y2, w = 1.6, life = 14) { const p = [[x1, y1]]; boltPts(x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * 0.45, p); I.B.push({ p, w: w * I.s, life }); }

  /* ---------------- oyun tanımları ---------------- */
  const DEFS = {
    okey101: {
      html: `<div class="ok1">${tileH(7, '#d23a2a', 'fl a')}${tileH(12, '#1d5fc4', 'fl b')}${tileH(5, '#1f1f1f', 'draw')}${tileH(13, '#d23a2a', 'disc')}<b class="slotglow"></b></div>`,
      tick(I, dt) { if (R() < 0.04 * dt * I.k) I.P.push({ t: 'star', x: I.W * (0.25 + R() * 0.5), y: I.H * (0.42 + R() * 0.4), vx: 0, vy: 0, r: 1.2 * I.s, life: 24, max: 24, fade: 12, c: '#fff8d0' }); },
      event(I) { Sound.play('tileDraw'); },
    },
    duzokey: {
      html: `<div class="ok2"><b class="sg s1"></b><b class="sg s2"></b><b class="sg s3"></b><b class="sg s4"></b><b class="sg s5"></b><i class="pile"></i>${tileH(6, '#d23a2a', 'draw')}${tileH(3, '#1d5fc4', 'disc')}</div>`,
      tick(I, dt) { if (R() < 0.03 * dt * I.k) I.P.push({ t: 'dot', x: I.W * (0.3 + R() * 0.4), y: I.H * 0.42, vx: (R() - 0.5) * 0.3, vy: -0.4 * I.s, r: 1.3 * I.s, life: 40, fade: 20, c: '#ffe7a0' }); },
      event() { Sound.play('tile'); },
    },
    tavla: {
      html: `<div class="tv"><i class="chk"></i><span class="dc d1"><b></b></span><span class="dc d2"><b></b></span><i class="dsh s1"></i><i class="dsh s2"></i></div>`,
      init(I) { I.dt = 0; this.face(I); },
      face(I) { I.host.querySelectorAll('.dc b').forEach(b => { b.className = 'f' + (1 + Math.floor(R() * 6)); }); },
      tick(I, dt) { I.dt += dt; if (I.dt > 230 / I.k) { I.dt = 0; this.face(I); } },
      event(I) { Sound.play('dice'); },
    },
    avivasor: {
      html: `<b class="avt">AVIVASOR</b><b class="avm">1.00x</b>`,
      init(I) { I.m = 1; I.crash = 2 + R() * 9; I.hold = 0; },
      tick(I, dt) {
        const x = I.x, W = I.W, H = I.H;
        // hız çizgileri (merkezden dışa)
        if (R() < 0.6 * dt * I.k) { const an = R() * TAU; I.P.push({ t: 'dot', x: W * 0.5 + Math.cos(an) * W * 0.05, y: H * 0.5 + Math.sin(an) * H * 0.05, vx: Math.cos(an) * 4 * I.s, vy: Math.sin(an) * 2.2 * I.s, ax: 0, r: 0.9 * I.s, life: 30, fade: 10, c: R() < 0.5 ? '#ffd9a0' : '#ff9ad5', drag: -0.04 }); }
        x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,210,150,.35)'; x.lineWidth = 1 * I.s;
        I.P.forEach(p => { if (p.t === 'dot') { x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); x.stroke(); } }); x.restore();
        // çarpan sayacı (kendi ritmiyle uçar, "uçtu" der, yeniden başlar)
        const el = I.host.querySelector('.avm');
        if (I.hold > 0) { I.hold -= dt; if (I.hold <= 0) { I.m = 1; I.crash = 1.5 + R() * 10; el.classList.remove('gone'); } }
        else { I.m *= 1 + 0.0045 * dt * I.k; if (I.m >= I.crash) { I.hold = 70; el.classList.add('gone'); el.textContent = 'UÇTU! ' + I.m.toFixed(2) + 'x'; return; } }
        if (I.hold <= 0) el.textContent = I.m.toFixed(2) + 'x';
        if (R() < 0.03 * dt * I.k) I.P.push({ t: 'coin', x: W * (R() < 0.5 ? -0.02 : 1.02), y: H * (0.2 + R() * 0.6), vx: (R() < 0.5 ? 1 : -1) * 1.5 * I.s, vy: -0.5 * I.s, g: 0.03 * I.s, r: 3 * I.s, rot: R() * 3, life: 70, fade: 20 });
      },
      event() { Sound.play('takeoff'); },
    },
    slot: {
      html: `<div class="sl3">${reelHtml('r1', ['seven', 'cherry', 'lemon', 'bell', 'bar', 'grape', 'seven'])}${reelHtml('r2', ['seven', 'bar', 'cherry', 'grape', 'bell', 'lemon', 'seven'])}${reelHtml('r3', ['seven', 'lemon', 'grape', 'bar', 'cherry', 'bell', 'seven'])}<b class="payline"></b></div>`,
      init(I) { I.t = 60; },
      tick(I, dt) { I.t -= dt * I.k; if (I.t <= 0) { I.t = 260; this.spin(I); } },
      spin(I) {
        const reels = [...I.host.querySelectorAll('.creel')], all = Object.keys(SYM).slice(0, 6); const win = R() < 0.35;
        const res = win ? Array(3).fill(all[Math.floor(R() * all.length)]) : reels.map(() => all[Math.floor(R() * all.length)]);
        I.host.classList.remove('won');
        reels.forEach((r, i) => {
          const s = r.querySelector('.cstrip'); r.classList.add('spin');
          setTimeout(() => { if (!r.isConnected) return; r.classList.remove('spin'); s.firstChild.src = s.lastChild.src = `assets/${SYM[res[i]]}.webp`; r.classList.add('land'); setTimeout(() => r.classList.remove('land'), 260); if (I.boost) Sound.play('stop'); if (i === 2 && win) { I.host.classList.add('won'); for (let k = 0; k < 18; k++) I.P.push({ t: 'coin', x: I.W * 0.5, y: I.H * 0.55, vx: (R() - 0.5) * 4 * I.s, vy: -(1.5 + R() * 2.5) * I.s, g: 0.09 * I.s, r: 3 * I.s, rot: R() * 3, life: 60, fade: 20 }); } }, (700 + i * 380) / I.k);
        });
      },
      event(I) { Sound.play('spin'); I.t = 0; },
    },
    vegas: {
      html: `<div class="sl4">${['lemon,cherry,grape,seven,melon', 'cherry,seven,lemon,bell,grape', 'grape,melon,seven,cherry,lemon', 'melon,lemon,bell,grape,cherry'].map((s, i) => reelHtml('r' + (i + 1), s.split(','))).join('')}</div><i class="bulbs l"></i><i class="bulbs r"></i>`,
      init(I) { I.t = 120; I.ph = 0; },
      tick(I, dt) {
        I.t -= dt * I.k; if (I.t <= 0) { I.t = 300; this.drop(I); }
        // neon ampuller: başlık kemeri boyunca koşan ışık
        I.ph += dt * 0.15 * I.k; const x = I.x; x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 18; i++) { const a = Math.PI * (1.08 + i / 17 * 0.84), px = I.W * (0.5 + Math.cos(a) * 0.47), py = I.H * (0.62 + Math.sin(a) * 0.6); const on = (Math.floor(I.ph) + i) % 3 === 0;
          x.fillStyle = on ? 'rgba(255,240,170,.95)' : 'rgba(255,120,220,.35)'; x.beginPath(); x.arc(px, py, (on ? 2.2 : 1.4) * I.s, 0, TAU); x.fill(); }
        x.globalCompositeOperation = 'source-over';
      },
      drop(I) {
        const reels = [...I.host.querySelectorAll('.creel')], all = ['lemon', 'cherry', 'grape', 'seven', 'melon', 'bell'];
        reels.forEach((r, i) => setTimeout(() => {
          if (!r.isConnected) return; const s = r.querySelector('.cstrip'); r.classList.remove('dropin'); void r.offsetWidth;
          [...s.children].forEach(im => { im.src = `assets/${SYM[all[Math.floor(R() * all.length)]]}.webp`; }); r.classList.add('dropin'); if (I.boost) Sound.play('stop');
        }, i * 140 / I.k));
      },
      event(I) { Sound.play('spin'); I.t = 0; },
    },
    zeus: {
      html: `<i class="zglow"></i><i class="zcloud c1"></i><i class="zcloud c2"></i>`,
      init(I) { I.nb = 30; },
      tick(I, dt) {
        const W = I.W, H = I.H, hx = W * 0.13, hy = H * 0.5;
        I.nb -= dt * I.k;
        if (I.nb <= 0) { I.nb = 70 + R() * 90; const sx = W * (R() * 0.45), n = 1 + (R() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) bolt(I, sx + i * W * 0.1, -2, hx, hy, 1.8, 16); I.host.classList.add('flash'); setTimeout(() => I.host.classList.remove('flash'), 120); if (I.boost) Sound.play('thunder'); }
        if (R() < 0.25 * dt * I.k) { const an = R() * TAU, l = (6 + R() * 10) * I.s; bolt(I, hx, hy, hx + Math.cos(an) * l, hy + Math.sin(an) * l, 0.7, 4); }
        if (R() < 0.05 * dt * I.k) bolt(I, W * (0.6 + R() * 0.4), 0, W * (0.62 + R() * 0.38), H * (0.25 + R() * 0.3), 0.9, 8);
        drawBolts(I, dt);
      },
      event(I) { I.nb = 0; },
    },
    misir: {
      html: `<i class="mtorch"></i><i class="meye e1"></i><i class="meye e2"></i><i class="msweep"></i>`,
      tick(I, dt) {
        if (R() < 0.35 * dt * I.k) I.P.push({ t: 'dot', x: I.W * R(), y: I.H * (0.8 + R() * 0.2), vx: (R() - 0.5) * 0.25, vy: -(0.25 + R() * 0.5) * I.s, r: (0.6 + R() * 1.2) * I.s, life: 90, fade: 40, c: R() < 0.7 ? '#ffd36b' : '#fff2c0' });
        if (R() < 0.05 * dt * I.k) I.P.push({ t: 'star', x: I.W * (0.1 + R() * 0.75), y: I.H * (0.7 + R() * 0.25), vx: 0, vy: 0, r: 1.6 * I.s, life: 22, fade: 11, c: '#fff6c8' });
      },
      event() { Sound.play('feature'); },
    },
    peri: {
      html: `<i class="pwing wl"></i><i class="pwing wr"></i><i class="porb"></i>`,
      init(I) { for (let i = 0; i < 3; i++) I.P.push(this.fly(I)); },
      fly(I) { return { t: 'fly', x: I.W * R(), y: I.H * R() * 0.5, vx: (R() - 0.5) * 0.6, vy: (R() - 0.5) * 0.3, r: 3.2 * I.s, ph: R() * 6, life: 99999, c: R() < 0.5 ? 'rgba(120,200,255,.85)' : 'rgba(255,120,230,.85)' }; },
      tick(I, dt) {
        const ox = I.W * 0.74, oy = I.H * 0.63; I.a = (I.a || 0) + dt * 0.08 * I.k;
        for (let k = 0; k < 2; k++) { const an = I.a + k * Math.PI; if (R() < 0.6 * dt) I.P.push({ t: 'dot', x: ox + Math.cos(an) * 15 * I.s, y: oy + Math.sin(an) * 7 * I.s, vx: 0, vy: -0.15, r: 1.2 * I.s, life: 26, fade: 20, c: '#e6b3ff' }); }
        if (R() < 0.08 * dt * I.k) I.P.push({ t: 'star', x: I.W * (0.3 + R() * 0.55), y: I.H * R() * 0.8, vx: 0, vy: 0.1, r: 1.4 * I.s, life: 30, fade: 15, c: '#fbe8ff' });
        I.P.forEach(p => { if (p.t === 'fly') { if (p.x < 0 || p.x > I.W) p.vx *= -1; if (p.y < 0 || p.y > I.H * 0.7) p.vy *= -1; } });
      },
      event(I) { Sound.play('orb'); for (let i = 0; i < 30; i++) { const an = R() * TAU; I.P.push({ t: 'dot', x: I.W * 0.74, y: I.H * 0.63, vx: Math.cos(an) * 2.5 * I.s, vy: Math.sin(an) * 2.5 * I.s, drag: 0.05, r: 1.5 * I.s, life: 40, fade: 25, c: '#f0c8ff' }); } },
    },
    korsan: {
      html: `<i class="kship"></i><i class="kwave w1"></i><i class="kwave w2"></i><i class="kwave w3"></i>`,
      init(I) { I.t = 40; },
      tick(I, dt) {
        I.t -= dt * I.k;
        if (I.t <= 0) { I.t = 120 + R() * 80; this.gush(I, 10); }
        if (R() < 0.05 * dt * I.k) I.P.push({ t: 'star', x: I.W * (0.6 + R() * 0.35), y: I.H * (0.6 + R() * 0.3), vx: 0, vy: 0, r: 1.5 * I.s, life: 20, fade: 10, c: '#fff4c0' });
      },
      gush(I, n) { for (let i = 0; i < n; i++) I.P.push({ t: 'coin', x: I.W * (0.72 + R() * 0.12), y: I.H * 0.64, vx: (R() - 0.6) * 2.2 * I.s, vy: -(1.6 + R() * 2.2) * I.s, g: 0.1 * I.s, r: 2.8 * I.s, rot: R() * 3, life: 55, fade: 15 }); },
      event(I) { Sound.play('chest'); this.gush(I, 26); },
    },
    ejderha: {
      html: `<i class="dhead"></i><i class="dheat"></i>`,
      init(I) { I.t = 50; I.fire = 0; },
      tick(I, dt) {
        I.t -= dt * I.k; if (I.t <= 0) { I.t = 200 + R() * 80; I.fire = 60; if (I.boost) Sound.play('roar'); }
        if (I.fire > 0) { I.fire -= dt; for (let i = 0; i < 3; i++) I.P.push({ t: 'flame', x: I.W * 0.9, y: I.H * 0.58, vx: -(3 + R() * 2.5) * I.s, vy: (R() - 0.3) * 1 * I.s, r: (3 + R() * 3) * I.s, life: 34, max: 34, fade: 14 }); I.host.classList.add('fire'); } else I.host.classList.remove('fire');
        if (R() < 0.4 * dt * I.k) I.P.push({ t: 'dot', x: I.W * R(), y: I.H * (0.85 + R() * 0.15), vx: (R() - 0.5) * 0.4, vy: -(0.5 + R() * 0.9) * I.s, r: (0.6 + R()) * I.s, life: 70, fade: 30, c: R() < 0.5 ? '#ff8a20' : '#ffd060' });
      },
      event(I) { I.t = 0; Sound.play('roar'); },
    },
    altin: {
      html: `<i class="arays"></i><i class="aglow"></i>`,
      tick(I, dt) {
        if (R() < 0.35 * dt * I.k) I.P.push({ t: 'coin', x: I.W * (0.47 + R() * 0.06), y: I.H * 0.52, vx: (R() - 0.5) * 3 * I.s, vy: -(2 + R() * 2.2) * I.s, g: 0.1 * I.s, r: (2.2 + R()) * I.s, rot: R() * 3, life: 60, fade: 15 });
        if (R() < 0.1 * dt * I.k) I.P.push({ t: 'star', x: I.W * (0.2 + R() * 0.6), y: I.H * (0.2 + R() * 0.6), vx: 0, vy: 0, r: 1.8 * I.s, life: 26, fade: 13, c: '#fff3b0' });
      },
      event(I) { Sound.play('bigwin'); for (let i = 0; i < 40; i++) I.P.push({ t: 'coin', x: I.W * 0.5, y: I.H * 0.52, vx: (R() - 0.5) * 6 * I.s, vy: -(2 + R() * 4) * I.s, g: 0.1 * I.s, r: 3 * I.s, rot: R() * 3, life: 70, fade: 20 }); },
    },
  };
  DEFS.duz = DEFS.duzokey; DEFS.aviator = DEFS.avivasor; DEFS.slots = DEFS.slot;
  const ART = { okey101: 'okey101', duz: 'duzokey', duzokey: 'duzokey', tavla: 'tavla', aviator: 'avivasor', avivasor: 'avivasor', slots: 'slot', slot: 'slot', zeus: 'zeus', misir: 'misir', peri: 'peri', korsan: 'korsan', vegas: 'vegas', ejderha: 'ejderha', altin: 'altin' };

  /* ---------------- örnek oluştur ---------------- */
  function mount(host, id, opts = {}) {
    const key = ART[id]; const D = DEFS[key]; if (!D) return null;
    host.classList.add('cfx', 'cfx-' + key);
    host.insertAdjacentHTML('afterbegin', `<span class="cfart"><img class="cfimg" src="assets/cv_${key}.webp" alt="" draggable="false">${D.html}<canvas class="cfcv"></canvas></span>`);
    const cv = host.querySelector('.cfcv');
    const I = { id: key, host, cv, x: cv.getContext('2d'), P: [], B: [], k: 1, boost: false, def: D, W: 0, H: 0, s: 1, opts };
    size(I); D.init && D.init.call(D, I); live.add(I); kick();
    return { inst: I, boost: () => boost(I), event: (n) => D.event && D.event.call(D, I, n), destroy: () => live.delete(I) };
  }
  function size(I) {
    const r = I.host.getBoundingClientRect(), d = I.amb ? 1 : Math.min(low ? 1 : 1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(I.cv.clientWidth * d)), h = Math.max(1, Math.round(I.cv.clientHeight * d));
    if (w !== I.W || h !== I.H) { I.cv.width = I.W = w; I.cv.height = I.H = h; } I.s = Math.max(0.6, I.W / 300); return r;
  }
  function boost(I) { I.boost = true; I.k = 2.4; I.host.classList.add('boost'); I.def.event && I.def.event.call(I.def, I); }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  /* Performans: kartlar 30 kare/sn çizilir (göz farkı yok, işlemci yükü yarıya iner).
   * Telefon yavaşsa (ortalama kare > 30 ms) otomatik "hafif mod": parçacıklar azalır, 20 kare/sn. */
  let acc = 0, avg = 16.7, low = false;
  function loop(now) {
    raf = 0; if (document.hidden) return; // görünür olunca visibilitychange yeniden başlatır
    const ms = now - last; last = now; avg = avg * 0.95 + Math.min(100, ms) * 0.05;
    if (!low && avg > 30) { low = true; document.body.classList.add('lowfx'); }
    acc += ms; const step = low ? 50 : 33;
    if (acc < step - 2) { raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(4, acc / 16.7); acc = 0; let any = false;
    live.forEach(I => {
      if (!I.host.isConnected) { live.delete(I); return; }
      if (!I.host.offsetParent && !I.opts.fixed) return; // gizli ekran: çizme
      any = true; if ((I.fr = (I.fr || 0) + 1) % 30 === 1) size(I);
      if (I.P.length || I.B.length || I.dirty) I.x.clearRect(0, 0, I.W, I.H);
      I.def.tick && I.def.tick.call(I.def, I, dt);
      if (low && I.P.length > 40) I.P.splice(0, I.P.length - 40); // hafif mod: parçacık sınırı
      I.dirty = I.P.length > 0 || I.B.length > 0; drawP(I, dt);
    });
    if (any || live.size) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  /* ---------------- dokununca: kart öne çıkar, büyür ve oyuna açılır ---------------- */
  let launching = false;
  async function launch(fromEl, id, open) {
    if (launching) return open(); launching = true;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    try {
      const r = fromEl && fromEl.isConnected ? fromEl.getBoundingClientRect() : { left: innerWidth * 0.35, top: innerHeight * 0.35, width: innerWidth * 0.3, height: innerWidth * 0.145 };
      const ov = document.createElement('div'); ov.className = 'cflaunch';
      ov.innerHTML = '<div class="cfdim"></div><div class="cfbig"></div><div class="cfring"></div>';
      document.body.appendChild(ov);
      const big = ov.querySelector('.cfbig');
      Object.assign(big.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      const c = mount(big, id, { fixed: true }); if (c) setTimeout(() => c.boost(), 60);
      if (fromEl) fromEl.classList.add('cfpressed');
      // Oyun HEMEN arkada açılmaya başlar; animasyon yalnızca bu süreyi doldurur, beklemeye eklenmez
      const t0 = performance.now();
      const p = Promise.resolve().then(open);
      await sleep(16); ov.classList.add('in');
      const sc = Math.max(innerWidth / r.width, innerHeight / r.height) * 1.02;
      const tx = innerWidth / 2 - (r.left + r.width / 2), ty = innerHeight / 2 - (r.top + r.height / 2);
      await sleep(90);
      big.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; big.classList.add('grow');
      await Promise.race([p.catch(() => {}), sleep(2500)]);
      const left = 380 - (performance.now() - t0); if (left > 0) await sleep(left); // kart büyümesi tamamlansın (en fazla ~0,4 sn)
      ov.classList.add('out'); await sleep(200); ov.remove(); if (fromEl) fromEl.classList.remove('cfpressed'); c && c.destroy();
      return p;
    } finally { launching = false; }
  }

  /* ---------------- oyun içi canlı arka plan (slotlar) ---------------- */
  function ambient(container, id) {
    const old = container.querySelector(':scope > .cfamb'); if (old) old.remove();
    const D = DEFS[ART[id]]; if (!D) return null;
    const h = document.createElement('div'); h.className = 'cfamb cfx-amb-' + ART[id]; h.innerHTML = '<canvas class="cfcv"></canvas>'; container.appendChild(h);
    const cv = h.querySelector('canvas');
    // oyun ekranında kartın DOM katmanları yok; yalnızca parçacık/şimşek/ateş canvas'ı kullanılır
    const I = { id: ART[id], host: h, cv, x: cv.getContext('2d'), P: [], B: [], k: 0.7, boost: false, def: { tick: D.tick && D.tick.bind(D), event: D.event }, W: 0, H: 0, s: 1, opts: {}, amb: true };
    // kart DOM öğelerine bağlı kısımlar (makara, zar, çarpan) oyun ekranında çalışmasın
    if (['okey101', 'duzokey', 'tavla', 'avivasor', 'slot', 'vegas'].includes(I.id)) I.def.tick = (II, dt) => { if (R() < 0.15 * dt) II.P.push({ t: 'star', x: II.W * R(), y: II.H * R(), vx: 0, vy: 0, r: 1.4 * II.s, life: 30, fade: 15, c: '#fff1c0' }); };
    if (I.id === 'peri') { D.init.call(D, I); I.def.tick = (II, dt) => { if (R() < 0.12 * dt) II.P.push({ t: 'star', x: II.W * R(), y: II.H * R() * 0.8, vx: 0, vy: 0.15, r: 1.6 * II.s, life: 40, fade: 20, c: '#fbe8ff' }); II.P.forEach(p => { if (p.t === 'fly') { if (p.x < 0 || p.x > II.W) p.vx *= -1; if (p.y < 0 || p.y > II.H * 0.7) p.vy *= -1; } }); }; }
    if (I.id === 'zeus') { I.nb = 120; I.def.tick = (II, dt) => { II.nb -= dt; if (II.nb <= 0) { II.nb = 160 + R() * 200; bolt(II, II.W * (0.55 + R() * 0.4), 0, II.W * (0.5 + R() * 0.45), II.H * (0.3 + R() * 0.4), 2, 14); } drawBolts(II, dt); }; }
    if (I.id === 'ejderha') { I.t = 260; I.fire = 0; }
    if (I.id === 'korsan') { I.t = 200; }
    size(I); live.add(I); kick();
    return {
      inst: I,
      // oyun mantığına bağlı olaylar: spin, win, big
      event(name) {
        const W = I.W, Hh = I.H;
        if (name === 'win' || name === 'big') {
          const n = name === 'big' ? 3 : 1;
          if (I.id === 'zeus') for (let i = 0; i < n * 2; i++) bolt(I, W * R(), 0, W * (0.3 + R() * 0.4), Hh * (0.4 + R() * 0.3), 2.4, 18);
          else if (I.id === 'ejderha') for (let i = 0; i < 60 * n; i++) I.P.push({ t: 'flame', x: W, y: Hh * (0.4 + R() * 0.3), vx: -(5 + R() * 5) * I.s, vy: (R() - 0.5) * 2 * I.s, r: (5 + R() * 6) * I.s, life: 40, max: 40, fade: 15 });
          else if (I.id === 'peri') for (let i = 0; i < 50 * n; i++) { const an = R() * TAU; I.P.push({ t: 'star', x: W / 2, y: Hh / 2, vx: Math.cos(an) * 4 * I.s, vy: Math.sin(an) * 4 * I.s, drag: 0.04, r: 1.8 * I.s, life: 50, fade: 25, c: R() < .5 ? '#f3c6ff' : '#bfe6ff' }); }
          else for (let i = 0; i < 30 * n; i++) I.P.push({ t: 'coin', x: W * (0.3 + R() * 0.4), y: Hh * 1.02, vx: (R() - 0.5) * 5 * I.s, vy: -(4 + R() * 6) * I.s, g: 0.14 * I.s, r: 4 * I.s, rot: R() * 3, life: 90, fade: 20 });
        }
        if (name === 'spin') { if (I.id === 'ejderha') for (let i = 0; i < 25; i++) I.P.push({ t: 'dot', x: W * R(), y: Hh, vx: 0, vy: -(2 + R() * 3) * I.s, r: 1.5 * I.s, life: 50, fade: 20, c: '#ff9a30' }); if (I.id === 'misir' || I.id === 'altin' || I.id === 'korsan') for (let i = 0; i < 12; i++) I.P.push({ t: 'star', x: W * R(), y: Hh * R(), vx: 0, vy: 0, r: 1.8 * I.s, life: 24, fade: 12, c: '#fff3b0' }); }
      },
      destroy() { live.delete(I); h.remove(); },
    };
  }
  window.CardFX = { mount, launch, ambient, defs: DEFS, busy: () => launching };
})();
