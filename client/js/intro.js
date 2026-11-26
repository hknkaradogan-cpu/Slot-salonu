/* SPINOVA — açılış akışı: stüdyo logosu → tam ekran yükleme sahnesi (gerçek kaynak yükleme yüzdesi) → giriş / salon.
 * Yükleme çubuğu süs değildir: oyunun görselleri gerçekten önceden indirilir ve yüzde buna göre ilerler. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const ASSETS = ['intro_bg', 'hall_bg', 'king_logo', 'spinova_logo', 'g_okey101', 'g_duzokey', 'g_tavla', 'g_aviator', 'g_slot', 'ic_chest', 'felt_green', 'felt_burgundy', 'wood_light', 'wood_dark', 'wood_maple', 'damask', 'hero_zeus', 'menu_fairy', 'card_zeus', 'card_egypt', 'card_vegas', 'card_dragon', 'card_pirate', 'card_gold', 'b_fairy'];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function set(p, text) { const f = $('#ldFill'), m = $('#splashMsg'); if (f) f.style.width = Math.round(p) + '%'; if (m && text) m.textContent = text; }
  function version() { try { if (window.AndroidUpdate && AndroidUpdate.enabled()) return AndroidUpdate.versionName(); } catch (e) { /* */ } return 'web 5.1'; }
  async function run() {
    const st = $('#studio'), ld = $('#ld');
    if ($('#ldVer')) $('#ldVer').textContent = version();
    // 1) stüdyo logosu
    st.classList.add('on'); await sleep(1300); st.classList.add('off'); ld.classList.add('on'); await sleep(350); st.remove();
    // 2) kaynak yükleme (gerçek)
    set(2, 'Kaynaklar başlatılıyor…'); await sleep(250);
    let done = 0; const n = ASSETS.length;
    await Promise.all(ASSETS.map(a => new Promise(res => { const i = new Image(); const fin = () => { done++; set(5 + (done / n) * 80, `Kaynaklar yükleniyor… %${Math.round(5 + (done / n) * 80)}`); res(); }; i.onload = fin; i.onerror = fin; i.src = 'assets/' + a + '.webp'; })));
    set(88, 'Sunucuya bağlanılıyor… %88');
  }
  function finish(text) { set(100, text || '%100'); return sleep(250).then(() => { const s = $('#splash'); s && s.classList.add('done'); }); }
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
  window.Intro = { run, finish, progress, help, repair };
})();
