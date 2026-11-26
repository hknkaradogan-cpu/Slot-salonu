/* SPINOVA — temalı ekran geçişleri (101 Plus tarzı): ekranı kapat → yeni ekranı hazırla → aç.
 * tiles: okey taşları yağar · curtain: mor kadife perde · wood: ahşap kapaklar · night: yıldızlı gece · water: su
 * Geçiş sırasında yeni ekran arka planda gerçekten yüklenir; süre ağ gecikmesini de gizler. */
(function () {
  'use strict';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let busy = false;
  const reduce = () => { try { return localStorage.getItem('fx_trans') === '0'; } catch (e) { return false; } };
  function build(kind) {
    const o = document.createElement('div'); o.className = 'trans t-' + kind;
    if (kind === 'tiles') {
      const n = 46; let h = '';
      for (let i = 0; i < n; i++) {
        const x = (i % 9) * 11.5 - 4 + Math.random() * 6, y = Math.floor(i / 9) * 21 - 6 + Math.random() * 8, r = Math.random() * 70 - 35, d = Math.random() * 320;
        const c = ['#d23a2a', '#1d5fc4', '#1f1f1f', '#d69a10'][i % 4]; h += `<i style="left:${x}%;top:${y}%;--r:${r}deg;--d:${d}ms;color:${c}">${1 + Math.floor(Math.random() * 13)}</i>`;
      }
      o.innerHTML = h;
    } else if (kind === 'curtain' || kind === 'wood') o.innerHTML = '<b class="cl"></b><b class="cr"></b>';
    else if (kind === 'night') o.innerHTML = '<b class="iris"></b>';
    else if (kind === 'water') o.innerHTML = '<b class="wave"></b>';
    document.body.appendChild(o); return o;
  }
  async function run(kind, swap) {
    if (busy || reduce()) return swap();
    busy = true; const o = build(kind);
    try {
      Sound.play(kind === 'tiles' ? 'stop' : 'click');
      void o.offsetWidth; o.classList.add('in');
      await sleep(kind === 'tiles' ? 640 : 460);
      const p = swap(); // yeni ekran perdenin arkasında hazırlanır
      await Promise.race([Promise.resolve(p).catch(() => {}), sleep(1400)]);
      await sleep(120);
      o.classList.add('out'); await sleep(kind === 'tiles' ? 560 : 520);
      return p;
    } finally { o.remove(); busy = false; }
  }
  window.Trans = { run };
})();
/* Hikâye girişi (101 Plus mini oyun tarzı): karakter + konuşma balonu + DEVAM. Her oyunda ilk girişte bir kez. */
(function () {
  'use strict';
  function story(key, img, lines) {
    try { if (localStorage.getItem('story_' + key)) return Promise.resolve(); } catch (e) { return Promise.resolve(); }
    return new Promise(res => {
      const o = document.createElement('div'); o.className = 'story';
      let i = 0;
      const draw = () => { o.innerHTML = `<img class="stchar" src="assets/${img}.webp" alt=""><div class="stbub"><p>${lines[i]}</p><button class="stbtn">${i < lines.length - 1 ? 'DEVAM' : 'BAŞLA'}</button><small>${i + 1}/${lines.length}</small></div><button class="stskip">Geç ›</button>`; };
      const end = () => { try { localStorage.setItem('story_' + key, '1'); } catch (e) {} o.classList.add('out'); setTimeout(() => { o.remove(); res(); }, 260); };
      o.addEventListener('click', (e) => {
        if (e.target.closest('.stskip')) return end();
        if (e.target.closest('.stbtn')) { Sound.play('click'); if (++i >= lines.length) end(); else draw(); }
      });
      draw(); document.body.appendChild(o);
    });
  }
  window.Trans.story = story;
})();
