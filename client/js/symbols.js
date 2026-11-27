/* Oyun temaları ve sembol çizimi (SVG yüzeyli taşlar + emoji/harf karoları).
 * assets/ klasörüne eski prototipin .webp görselleri konursa lobi kartlarında otomatik kullanılır. */
(function () {
  'use strict';
  const CLIP = { diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', hex: 'polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)', star: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)', tri: 'polygon(50% 5%,100% 95%,0 95%)', shield: 'polygon(0 0,100% 0,100% 55%,50% 100%,0 55%)', drop: 'polygon(50% 0,85% 55%,95% 75%,80% 95%,50% 100%,20% 95%,5% 75%,15% 55%)', circle: 'circle' };
  function mix(h, f) {
    h = h.replace('#', ''); const n = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
    return '#' + n.map(c => { const v = f >= 0 ? Math.round(c + (255 - c) * f) : Math.round(c * (1 + f)); return v.toString(16).padStart(2, '0'); }).join('');
  }
  function pts(shape) {
    if (shape === 'circle') { const a = []; for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2 - Math.PI / 2; a.push([50 + 50 * Math.cos(t), 50 + 50 * Math.sin(t)]); } return a; }
    return CLIP[shape].slice(8, -1).split(',').map(p => p.trim().split(' ').map(parseFloat));
  }
  const cache = {};
  function gem(shape, col) {
    const key = shape + col; if (cache[key]) return cache[key];
    const P = pts(shape), n = P.length; let cx = 0, cy = 0; P.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= n; cy /= n;
    const Q = P.map(p => [cx + (p[0] - cx) * 0.5, cy + (p[1] - cy) * 0.5 - 1.5]); const f = a => a[0].toFixed(1) + ',' + a[1].toFixed(1); const L = -2.36; let o = '';
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = P[i], b = P[j], ang = Math.atan2((a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cx), lit = Math.cos(ang - L); o += `<polygon points="${f(a)} ${f(b)} ${f(Q[j])} ${f(Q[i])}" fill="${lit > 0 ? mix(col, lit * 0.62) : mix(col, lit * 0.5)}" stroke="rgba(0,0,0,.22)" stroke-width=".7"/>`; }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, am = Math.atan2((Q[i][1] + Q[j][1]) / 2 - cy, (Q[i][0] + Q[j][0]) / 2 - cx); o += `<polygon points="${f(Q[i])} ${f(Q[j])} ${f([cx, cy - 1.5])}" fill="${mix(col, Math.cos(am - L) * 0.38 + 0.12)}" stroke="rgba(255,255,255,.18)" stroke-width=".5"/>`; }
    o += `<polygon points="${P.map(f).join(' ')}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.2"/><ellipse cx="${cx - 14}" cy="${cy - 20}" rx="12" ry="5.5" fill="rgba(255,255,255,.75)" transform="rotate(-32 ${cx - 14} ${cy - 20})"/><circle cx="${cx + 16}" cy="${cy + 14}" r="2.2" fill="rgba(255,255,255,.6)"/>`;
    return (cache[key] = `<svg viewBox="0 0 100 100" width="86%" height="86%" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.6))">${o}</svg>`);
  }
  const G = (shape, color) => ({ t: 'gem', shape, color });
  const E = (g, bg, lbl) => ({ t: 'emoji', g, bg, lbl });
  const Lt = (ch, color) => ({ t: 'letter', ch, color });

  const I = (src, lbl, name) => ({ t: 'img', src, lbl });
  const A = (k, lbl) => ({ t: 'art', k, lbl }); // çizim sembol (symart.js)
  const THEMES = {
    zeus: { b1: '#0a1a3a', b2: '#2a5aa8', glow: '#8fe3ff', frame: '#f2c14e', emb: '⚡', heroImg: 'hero_zeus', card: 'card_zeus',
      syms: [I('a_dia2'), I('a_green2'), I('a_purple'), I('b_hex'), I('a_red'), I('a_ostar'), I('b_sun'), I('a_crown'), I('b_crown')],
      scatter: I('b_scatter'), names: ['Safir', 'Zümrüt', 'Ametist', 'Altın Taş', 'Yakut', 'Yıldız', 'Güneş', 'Altın Taç', 'Kraliyet Tacı'] },
    peri: { b1: '#1b0f4a', b2: '#9a5bd6', glow: '#ff9ae8', frame: '#f2c14e', emb: '🧚', heroImg: 'menu_fairy', heroAlpha: false, card: 'b_fairy', cardAlpha: true,
      syms: [I('b_green'), I('b_blue'), I('b_hex'), I('b_heart'), I('b_moon'), I('b_star'), I('b_sun'), I('a_wand'), I('b_crown')],
      scatter: I('a_scatter'), names: ['Yeşil Kristal', 'Mavi Kristal', 'Altın Kristal', 'Kalp', 'Ay', 'Yıldız', 'Güneş', 'Sihirli Asa', 'Taç'] },
    misir: { b1: '#2a1206', b2: '#d9772a', glow: '#ffb347', frame: '#e8b04a', emb: '🏺', heroImg: 'hero_egypt', card: 'card_egypt',
      syms: [Lt('10', '#4fd1ff'), Lt('J', '#6bff7a'), Lt('Q', '#ff7acf'), Lt('K', '#ffb347'), Lt('A', '#ff4d5d'), I('a_green'), I('a_dia'), I('a_crown'), I('hero_egypt', '', 'round'), A('book', 'WILD')],
      names: ['10', 'J', 'Q', 'K', 'A', 'Zümrüt', 'Elmas', 'Firavun Tacı', 'Firavun', 'Kitap (Wild + Scatter)'] },
    vegas: { b1: '#3a0a12', b2: '#c1121f', glow: '#ffb347', frame: '#ffd23f', emb: '🍒', heroImg: 'card_vegas', card: 'card_vegas',
      syms: [I('a_cherry'), I('a_lemon'), A('orange'), I('a_pgem'), I('a_grape'), I('a_melon'), I('a_bell'), I('a_bar'), I('a_seven', 'WILD'), I('a_ystar', 'BONUS')],
      names: ['Kiraz', 'Limon', 'Portakal', 'Erik Taşı', 'Üzüm', 'Karpuz', 'Çan', 'Altın Külçe', '7 (Wild x2)', 'Yıldız'] },
    ejderha: { b1: '#2b0505', b2: '#a31212', glow: '#ff8a3d', frame: '#e6b84a', emb: '🐉', heroImg: 'hero_dragon', heroAlpha: true, card: 'card_dragon',
      syms: [A('coin'), A('lantern'), I('a_bell2'), I('a_bow'), I('a_green'), I('a_red'), I('a_ystar'), A('dragon'), I('fx_flame', 'WILD'), A('pearl', 'SCATTER')],
      names: ['Sikke', 'Fener', 'Çan', 'Kurdele', 'Yeşim', 'Yakut', 'Altın Yıldız', 'Ejderha', 'Ateş Wild', 'İnci'] },
    korsan: { b1: '#06293a', b2: '#1f8a8a', glow: '#7fffd4', frame: '#c28a3a', emb: '🏴‍☠️', heroImg: 'card_pirate', card: 'card_pirate',
      syms: [Lt('A', '#ff4d5d'), Lt('K', '#ffb347'), Lt('Q', '#ff7acf'), Lt('J', '#6bff7a'), A('parrot'), A('ship'), I('a_dia'), I('a_wild', ''), I('a_chest')],
      names: ['A', 'K', 'Q', 'J', 'Papağan', 'Gemi', 'Elmas', 'Wild', 'Altın Sikke'] },
    altin: { b1: '#06103a', b2: '#1236a8', glow: '#5aa0ff', frame: '#f2c14e', emb: '🎰', heroImg: 'card_gold', card: 'card_gold',
      syms: [I('a_cherry'), I('a_grape'), A('orange'), I('a_melon'), I('a_bar'), I('a_bell'), I('a_dia'), I('a_seven'), I('b_wild'), I('a_bonus')],
      names: ['Kiraz', 'Üzüm', 'Portakal', 'Karpuz', 'Altın Külçe', 'Çan', 'Elmas', '7', 'Wild (x2)', 'Bonus'] },
  };

  function tileHtml(d) {
    if (d.t === 'gem') return `<div class="tile">${gem(d.shape, d.color)}</div>`;
    if (d.t === 'art' && window.SymArt && SymArt.has(d.k)) return `<div class="tile imgtile arttile">${SymArt.html(d.k)}${d.lbl ? `<span class="lbl">${d.lbl}</span>` : ''}</div>`;
    if (d.t === 'img') return `<div class="tile imgtile${d.src.startsWith('hero') ? ' round' : ''}"><img class="simg" src="assets/${d.src}.webp" draggable="false" alt="">${d.lbl ? `<span class="lbl">${d.lbl}</span>` : ''}</div>`;
    const bg = d.bg ? `background:radial-gradient(circle at 35% 30%,${mix(d.bg, 0.35)},${d.bg} 70%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.15)` : '';
    let inner = '';
    if (d.t === 'emoji') inner = `<span class="glyph">${d.g}</span>`;
    else if (d.t === 'letter') inner = `<span class="letter" style="color:${d.color};text-shadow:0 0 10px ${d.color}">${d.ch}</span>`;
    else if (d.t === 'text') inner = `<span class="letter" style="color:${d.color};font-size:calc(var(--cell)*${d.txt.length > 1 ? .34 : .62})">${d.txt}</span>`;
    return `<div class="tile" style="${bg}">${inner}${d.lbl ? `<span class="lbl">${d.lbl}</span>` : ''}</div>`;
  }
  /** Bir hücre kodunu HTML'e çevirir. code: sembol no | 1000+v çarpan | {coin:v} */
  function symHtml(gameId, code, extra) {
    const th = THEMES[gameId];
    if (typeof code === 'object' && code && code.coin != null) {
      const v = code.coin; const big = v >= 50; const label = v >= 1000 ? 'GRAND' : v >= 150 ? 'MAJOR' : '';
      return `<div class="sym coin ${extra || ''}"><div class="tile" style="background:radial-gradient(circle at 35% 30%,#fff3b0,#e0a000 55%,#8a5a00);border-radius:50%;box-shadow:0 0 12px #ffd34d;border:3px solid #fff3b0"><span class="letter" style="color:#fff;font-size:calc(var(--cell)*${big ? .24 : .3})">${label || fmtX(code.text || v)}</span></div></div>`;
    }
    if (code >= 1000) {
      const v = code - 1000; const z = gameId === 'zeus';
      // Çarpan değeri şimşek/kristal patlamasından ÖNCE görünmez: sembol sayısız enerji küresi olarak düşer
      if (!(extra && /(^|\s)open(\s|$)/.test(extra))) return `<div class="sym mult mhid ${extra || ''}" data-mult="${v}"><div class="tile"><div class="morb ${z ? 'z' : 'p'}"><span>${z ? '⚡' : '✦'}</span></div></div></div>`;
      const col = v >= 100 ? '#ff2a6a' : v >= 20 ? '#ff8a00' : v >= 10 ? '#c07bff' : v >= 5 ? '#35d6ff' : '#6bff7a';
      const bg = z ? `radial-gradient(circle at 35% 30%,#fff,${col} 45%,${mix(col, -0.55)})` : `radial-gradient(circle at 35% 30%,#fff,${col} 40%,${mix(col, -0.6)})`;
      const img = z ? (B_BADGE[v] || A_BADGE[v]) : (A_BADGE[v] || B_BADGE[v]);
      if (img) return `<div class="sym mult ${extra || ''}" data-mult="${v}"><div class="tile imgtile"><img class="simg badge" src="assets/${img}.webp" draggable="false" alt="x${v}"></div></div>`;
      return `<div class="sym mult ${extra || ''}" data-mult="${v}"><div class="tile"><div class="orb" style="background:${bg};box-shadow:0 0 16px ${col}">${z ? '⚡' : ''}x${v}</div></div></div>`;
    }
    const sc = th.syms.length;
    const d = (code === sc && th.scatter) ? th.scatter : th.syms[code];
    if (!d) return `<div class="sym"></div>`;
    return `<div class="sym ${extra || ''}" data-s="${code}">${tileHtml(d)}</div>`;
  }
  const A_BADGE = { 2: 'a_x2', 3: 'a_x3', 5: 'a_x5', 10: 'a_x10', 20: 'a_x20', 100: 'a_x100' }, B_BADGE = { 2: 'b_x2', 4: 'b_x4', 8: 'b_x8', 10: 'b_x10' };
  function fmtX(v) { return typeof v === 'number' ? 'x' + (Math.round(v * 10) / 10) : v; }
  function symName(gameId, code) { const th = THEMES[gameId]; if (code === th.syms.length && th.scatter) return 'Scatter'; return (th.names || [])[code] || ''; }
  window.Sym = { THEMES, symHtml, tileHtml, gem, mix, symName };
})();
