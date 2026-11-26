/* SPINOVA — açılış akışı: stüdyo logosu → tam ekran yükleme sahnesi (gerçek kaynak yükleme yüzdesi) → giriş / salon.
 * Yükleme çubuğu süs değildir: oyunun görselleri gerçekten önceden indirilir ve yüzde buna göre ilerler. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  // Açılışta yalnızca salonun ihtiyaç duyduğu görseller indirilir; oyunların görselleri oyun açılınca yüklenir
  const ASSETS = ['splash_king', 'splash_logo', 'intro_bg', 'hall_bg', 'king_logo', 'ic_chest', 'av0', ...['okey101', 'duzokey', 'tavla', 'avivasor', 'slot', 'zeus', 'misir', 'peri', 'korsan', 'vegas', 'ejderha', 'altin'].map(k => 'cv_' + k)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function set(p, text) { const f = $('#ldFill'), m = $('#splashMsg'), k = document.querySelector('.kspark'); if (f) f.style.width = Math.round(p) + '%'; if (k) k.style.left = Math.round(p) + '%'; if (m && text) m.textContent = text; }
  function version() { try { if (window.AndroidUpdate && AndroidUpdate.enabled()) return AndroidUpdate.versionName(); } catch (e) { /* */ } return 'web 5.1'; }
  /* Altın parçacıklar + havai fişek (tek canvas, açılış bitince durur) */
  let fxOn = false;
  function fxLoop() {
    const cv = $('#kFx'); if (!cv) return; const sc = $('#kScene');
    const W = cv.width = Math.round(sc.clientWidth * 1.2), H = cv.height = Math.round(sc.clientHeight * 1.2), x = cv.getContext('2d');
    const P = [], R = Math.random; let burst = 0, last = performance.now();
    const gold = () => ({ k: 'g', x: R() * W, y: H + 10, vx: (R() - .5) * .4, vy: -(.5 + R() * 1.3), r: 1 + R() * 2.6, a: .4 + R() * .6, tw: R() * 6 });
    for (let i = 0; i < 60; i++) { const g = gold(); g.y = R() * H; P.push(g); }
    window.__kBurst = (n = 70) => { for (let i = 0; i < n; i++) { const an = R() * 6.283, sp = 2 + R() * 7; P.push({ k: 'b', x: W * .502, y: H * .645, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 1.5, r: 1.5 + R() * 3, a: 1, g: .12 }); } };
    function firework() {
      const cx = W * (.12 + R() * .76), cy = H * (.08 + R() * .22), c = ['#ffd36b', '#ff7ae0', '#9ad7ff', '#c58bff', '#fff3b0'][Math.floor(R() * 5)];
      for (let i = 0; i < 46; i++) { const an = (i / 46) * 6.283, sp = 1.2 + R() * 1.8; P.push({ k: 'f', x: cx, y: cy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, r: 1.4, a: 1, g: .025, c }); }
    }
    function step(now) {
      if (!fxOn) return; const dt = Math.min(3, (now - last) / 16.7); last = now;
      x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      if (R() < .25 * dt) P.push(gold());
      if ((burst -= dt) <= 0) { firework(); burst = 40 + R() * 70; }
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt;
        if (p.k === 'g') { p.tw += .1 * dt; const al = p.a * (.55 + .45 * Math.sin(p.tw)); x.fillStyle = `rgba(255,${200 + (p.r * 15 | 0)},110,${al})`; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); if (p.y < -10) P.splice(i, 1); }
        else { p.a -= (p.k === 'f' ? .014 : .018) * dt; if (p.a <= 0) { P.splice(i, 1); continue; } x.fillStyle = p.c || '#ffd36b'; x.globalAlpha = p.a; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); x.globalAlpha = 1; }
      }
      requestAnimationFrame(step);
    }
    fxOn = true; requestAnimationFrame(step);
  }
  function toggleSound() { const on = !Sound.get().music; Sound.set('music', on); Sound.set('sound', on); const b = $('#kSnd'); if (b) b.textContent = on ? '🔊' : '🔇'; if (on) Sound.intro && Sound.intro(); }
  async function run() {
    const st = $('#studio'), ld = $('#ld');
    if ($('#ldVer')) $('#ldVer').textContent = version();
    if ($('#kSnd')) $('#kSnd').textContent = Sound.get().music ? '🔊' : '🔇';
    // 1) stüdyo logosu
    st.classList.add('on'); await sleep(1100); st.classList.add('off'); ld.classList.add('on'); await sleep(250); st.remove();
    // 2) kral sahnesi: ışık huzmeleri → logo damgası (müzik + altın patlaması) → sahne aydınlanır
    fxLoop(); ld.classList.add('rays');
    const seq = (async () => {
      await sleep(350); ld.classList.add('stamp'); try { Sound.intro && Sound.intro(); } catch (e) { /* */ }
      await sleep(420); window.__kBurst && __kBurst(90); ld.classList.add('lit');
    })();
    // 3) kaynak yükleme (gerçek; animasyonla aynı anda)
    set(2, 'Kaynaklar başlatılıyor…');
    let done = 0; const n = ASSETS.length;
    await Promise.all([seq, ...ASSETS.map(a => new Promise(res => { const i = new Image(); const fin = () => { done++; set(5 + (done / n) * 80, `Kaynaklar yükleniyor… %${Math.round(5 + (done / n) * 80)}`); res(); }; i.onload = fin; i.onerror = fin; i.src = 'assets/' + a + '.webp'; }))]);
    await sleep(600); // logo animasyonu görünsün
    set(88, 'Sunucuya bağlanılıyor… %88');
  }
  function finish(text) { set(100, text || '%100'); return sleep(250).then(() => { const s = $('#splash'); s && s.classList.add('done'); setTimeout(() => { fxOn = false; }, 400); }); }
  function progress(p, text) { set(p, text); }
  function help() {
    UI.modal(`<h3 class="gold">💬 İletişim</h3><p class="center">Sorun ya da öneri için giriş yaptıktan sonra <b>Destek</b> bölümünden talep oluşturabilirsin.</p><p class="center small muted">Giriş yapamıyorsan "Şifremi Unuttum" ile e-postana kod gönderebilirsin.</p>`);
  }
  function repair() {
    UI.confirm('Önbellek temizlenip uygulama yeniden yüklenecek. Hesabın ve jetonların sunucuda güvende; oturumun korunur.', 'Onar').then(ok => {
      if (!ok) return; try { const t = localStorage.getItem('slot_token'); localStorage.clear(); if (t) localStorage.setItem('slot_token', t); } catch (e) { /* */ }
      try { caches && caches.keys().then(k => k.forEach(x => caches.delete(x))); } catch (e) { /* */ }
      location.reload();
    });
  }
  window.Intro = { run, finish, progress, help, repair, toggleSound };
})();
