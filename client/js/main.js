/* Açılış, çevrimdışı yönetimi ve Google Play Billing köprüsü */
(function () {
  'use strict';
  const { $, toast, fmt, modal, closeModal } = UI;

  /* ---------- Google Play Billing köprüsü ----------
   * Android tarafı window.AndroidBilling arayüzünü sağlar (bkz. android/.../BillingBridge.java):
   *   queryProducts(jsonIds), launch(productId, obfuscatedAccountId), consume(token), restore()
   * Yerel taraf olayları window.__billing(type, json) ile geri bildirir. */
  const prices = {}; let busy = false;
  const native = () => window.AndroidBilling;
  const Billing = window.Billing = {
    init() {
      if (!native()) return;
      try { native().queryProducts(JSON.stringify(['coins_starter', 'coins_small', 'coins_medium', 'coins_large', 'coins_mega', 'coins_vip'])); native().restore(); } catch (e) {}
    },
    prices: () => prices,
    async buy(productId, acct) {
      if (busy) return;
      if (native()) { busy = true; try { native().launch(productId, acct); } catch (e) { busy = false; toast('Ödeme ekranı açılamadı.', true); } return; }
      const shop = App.shop || {};
      if (!shop.testMode) { toast('Satın alma Google Play üzerinden yalnızca Android uygulamasında yapılır.', true); return; }
      const ok = await UI.confirm('Geliştirme/test modu: Google Play yerine sahte (mock) bir satın alma ile sunucu doğrulaması test edilecek. Gerçek ödeme alınmaz.', 'Test et');
      if (ok) handlePurchase({ productId, purchaseToken: `mock:purchased:${acct}:${Api.uuid()}`, state: 'purchased' });
    },
  };
  async function handlePurchase(p) {
    try {
      const r = await Api.retrying('POST', '/api/shop/verify', { productId: p.productId, purchaseToken: p.purchaseToken, state: p.state, orderId: p.orderId });
      if (r.status === 'purchased') {
        if (native()) try { native().consume(p.purchaseToken); } catch (e) {}
        if (r.credited) { Screens.setBalance(r.balance, true); Sound.play('bigwin'); UI.coinShower(120); toast(`+${fmt(r.coins)} jeton hesabına eklendi!`); }
        else Screens.setBalance(r.balance);
      } else if (r.status === 'pending') toast('Ödemen onay bekliyor. Onaylanınca jetonlar otomatik eklenecek.');
      else if (r.status === 'canceled') toast('Ödeme iptal edildi.', true);
      if (window.Platform && Platform.current() === 'shop') Screens.go('shop');
    } catch (e) { toast(e.message, true); }
  }
  window.__billing = function (type, json) {
    let d = {}; try { d = JSON.parse(json || '{}'); } catch (e) {}
    if (type === 'products') (d.list || []).forEach(x => { prices[x.productId] = x.price; });
    else if (type === 'purchase') { busy = false; if (App.me) handlePurchase(d); }
    else if (type === 'canceled') { busy = false; }
    else if (type === 'error') { busy = false; UI.modal(`<h3 class="gold">Google Play</h3><p class="center">${UI.esc(d.message || 'Ödeme hatası.')}</p><p class="small muted center">Uygulama Google Play Console'a yüklenip ürünler tanımlanmadan Play satın alma ekranı açılmaz. (Yerel kurulan APK'da Google "ürün bulunamadı" der.)</p><button class="btn green block" data-close>Tamam</button>`); }
  };

  /* ---------- Çevrimdışı ---------- */
  const bar = $('#netbar'); let retryTimer = null;
  Api.on('offline', () => { bar.classList.remove('hidden'); clearInterval(retryTimer); retryTimer = setInterval(() => Api.get('/api/health').catch(() => {}), 5000); });
  Api.on('online', () => { bar.classList.add('hidden'); clearInterval(retryTimer); if (App.me) Screens.refresh().catch(() => {}); });
  Api.on('unauthorized', () => { if (App.me) { toast('Oturum sona erdi. Lütfen tekrar giriş yap.', true); App.me = null; Api.setToken(null); Screens.login(); } });
  $('#netRetry').onclick = () => Api.get('/api/health').catch(() => {});
  addEventListener('online', () => Api.get('/api/health').catch(() => {}));

  // Android geri tuşu
  window.__back = function () {
    try {
      // Okey masası kendi geri davranışını yönetir (ayrılma onayı)
      if (window.Okey && Okey.isOpen()) return Okey.back();
      if (window.Tavla && Tavla.isOpen()) return Tavla.back();
      if (window.Aviator && Aviator.isOpen()) return Aviator.back();
      // Slot oyunu açıksa: modal/kazanç ekranı ne olursa olsun tek geri hareketiyle lobiye dön
      if (Games.isOpen()) { Games.close(); return true; }
      if ($('#overlay').classList.contains('show')) { closeModal(true); return true; }
      if (document.querySelector('.bigwin')) { document.querySelectorAll('.bigwin').forEach(e => e.remove()); return true; }
    } catch (e) { window.reportError && window.reportError(e); if (App.me) { try { UI.show('main'); Screens.go('lobby'); } catch (e2) { /* yoksay */ } return true; } }
    if (window.Admin && $('#admin') && $('#admin').classList.contains('active')) { Screens.go('home'); return true; }
    if (App.me && window.Platform && Platform.current() && Platform.current() !== 'home') { Platform.home(); return true; }
    return false;
  };
  document.addEventListener('pointerdown', () => { if (App.me) Sound.startMusic(); }, { once: true });

  /* ---------- Cihaz hata raporu: telefonda oluşan hatalar yönetici paneline düşer ---------- */
  const sentErr = new Set();
  window.reportError = function (e) {
    try {
      const msg = String((e && (e.message || e.reason && e.reason.message)) || e).slice(0, 300);
      const stack = String((e && (e.stack || e.reason && e.reason.stack)) || '').slice(0, 900);
      if (sentErr.has(msg) || sentErr.size > 20 || !App.me) return; sentErr.add(msg);
      Api.post('/api/telemetry/error', { message: msg, stack, screen: (Games.isOpen() ? 'game:' + Games.current() : App.tab || ''), appVersion: (window.SLOT_CONFIG && SLOT_CONFIG.appVersion) || '', device: navigator.userAgent.slice(0, 120) }).catch(() => {});
    } catch (x) { /* yoksay */ }
  };
  window.addEventListener('error', (ev) => window.reportError(ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => { const r = ev.reason; if (r && r.status) return; window.reportError(r); });

  /* ---------- Açılış ---------- */
  async function boot() {
    Platform.initStage();
    const msg = $('#splashMsg');
    await Intro.run();
    if (!Api.hasToken()) { await Intro.finish('%100'); return Screens.login(); }
    for (;;) {
      try { Intro.progress(94, 'Salon hazırlanıyor… %94'); await Screens.enter(); await Intro.finish('%100'); return; }
      catch (e) {
        if (e.status === 401 || e.status === 403) { Api.setToken(null); if (e.status === 403) toast(e.message, true); await Intro.finish(); return Screens.login(); }
        msg.innerHTML = `${UI.esc(e.message)}<br><button class="btn gold sm" id="bootRetry" style="margin-top:10px">Tekrar dene</button>`;
        await new Promise(r => { $('#bootRetry').onclick = r; setTimeout(r, 8000); });
        msg.textContent = 'Bağlanılıyor…';
      }
    }
  }
  /* ---------- Uygulama içi güncelleme ----------
   * Sunucu en son APK sürümünü bildirir; daha yeniyse indirilir ve Android yükleyicisi açılır.
   * Aynı imza anahtarıyla derlendiği için mevcut uygulamanın üzerine kurulur, veriler korunur. */
  async function checkUpdate(manual) {
    const U = window.AndroidUpdate; if (!U || !U.enabled()) { manual && toast('Güncelleme yalnızca Android uygulamasında kullanılabilir.'); return; }
    let v; try { v = await Api.get('/api/app/version'); } catch (e) { manual && toast(e.message, true); return; }
    const cur = +U.versionCode();
    if (!v || !v.latest || v.latest.version_code <= cur) { manual && toast('Uygulama güncel (' + U.versionName() + ').'); return; }
    showUpdate(v.latest, U);
  }
  // Sürüm notu (commit başlığı) → madde listesi
  function noteItems(n) {
    if (!n) return [];
    let t = String(n).replace(/^\s*\d+(\.\d+)*\s*(aşama\s*\d+)?\s*:?\s*/i, '');
    return t.split(/\s*[;,]\s*|\s+-\s+/).map(x => x.trim()).filter(x => x.length > 2).slice(0, 6);
  }
  function showUpdate(L, U) {
    const forced = !!L.mandatory; App.pendingUpdate = L; App.updLater = false; updBtn();
    const items = noteItems(L.notes);
    UI.modal(`<div class="upd">
        <div class="upd-l"><div class="upd-rays"></div><img class="upd-king" src="assets/king_wave.webp" alt="">
          <div class="upd-ver"><span>${UI.esc(U.versionName())}</span><b>➜</b><span class="new">${UI.esc(L.version_name)}</span></div></div>
        <div class="upd-r">
          <div class="upd-rib">YENİ GÜNCELLEME</div>
          <div class="upd-t">Yeni bir güncellemen var!</div>
          ${items.length ? `<ul class="upd-list">${items.map(x => `<li>${UI.esc(x)}</li>`).join('')}</ul>` : '<p class="upd-p">Yeni özellikler ve düzeltmeler seni bekliyor.</p>'}
          <div class="upd-bar hidden" id="upBar"><i style="width:0%"></i><em>0%</em></div>
          <div class="upd-msg" id="upMsg">Hesabın, jetonların ve seviyen korunur.</div>
          <button class="upd-go" id="upGo">⬇️ ŞİMDİ GÜNCELLE</button>
          ${forced ? '<p class="upd-p small err">Bu sürüm artık desteklenmiyor; devam etmek için güncelleme gerekli.</p>' : '<button class="upd-later" id="upLater">Daha sonra</button>'}
        </div></div>`, {
      noClose: !!forced, cls: 'updm',
      onOpen() {
        Sound.play && Sound.play('bonus');
        $('#upLater') && ($('#upLater').onclick = () => { UI.closeModal(); App.updLater = true; updBtn(); });
        $('#upGo').onclick = () => { $('#upGo').disabled = true; $('#upBar').classList.remove('hidden'); $('#upMsg').textContent = 'İndiriliyor…'; U.download(L.apk_url); };
      },
    });
  }
  // "Daha sonra" denince salonun üst menüsüne yanıp sönen GÜNCELLE düğmesi eklenir (salon yeniden çizilse de geri gelir)
  function updBtn() {
    const icons = document.querySelector('#main .hicons'); let b = document.getElementById('updBtn');
    if (!App.pendingUpdate || !App.updLater) { if (b) b.remove(); return; }
    if (icons && !b) { b = document.createElement('button'); b.id = 'updBtn'; b.className = 'hicon upd-hicon'; b.innerHTML = '<span class="i">⬇️</span><span class="t">Güncelle</span>';
      b.addEventListener('click', (e) => { e.stopPropagation(); const U = window.AndroidUpdate; if (U) showUpdate(App.pendingUpdate, U); }, true); icons.insertBefore(b, icons.firstChild); }
  }
  setInterval(updBtn, 1500);
  window.__update = function (type, msg) {
    const bar = $('#upBar'), m = $('#upMsg'), go = $('#upGo');
    if (type === 'progress' && bar) { const p = Math.max(0, Math.min(100, +msg)); bar.querySelector('i').style.width = p + '%'; bar.querySelector('em').textContent = p + '%'; }
    else if (type === 'ready') { m && (m.textContent = 'İndirildi. Açılan ekranda "Güncelle"ye dokun.'); go && (go.disabled = false, go.textContent = 'YÜKLEYİCİYİ TEKRAR AÇ'); }
    else if (type === 'permission') { m && (m.textContent = 'Ayarlarda "Bu kaynaktan yüklemeye izin ver"i açıp geri dön, sonra tekrar Güncelle\'ye dokun.'); go && (go.disabled = false); }
    else if (type === 'error') { m && (m.textContent = 'Hata: ' + msg); go && (go.disabled = false); }
  };
  App.checkUpdate = checkUpdate;

  /* ---------- FPS telemetrisi: oyun açıkken örnekler, 60 sn'de bir gönderir ---------- */
  (function fpsTelemetry() {
    let frames = 0, worst = 0, last = performance.now(), t0 = last, minFps = 999;
    const tick = (now) => {
      const dt = now - last; last = now;
      if (Games.isOpen() && !document.hidden) { frames++; if (dt > worst && dt < 1000) worst = dt; }
      if (now - t0 >= 5000) { const fps = frames / ((now - t0) / 1000); if (frames > 30 && fps < minFps) minFps = fps; t0 = now; tick.samples.push(fps); frames = 0; }
      // oyun açık değilken her karede çalışmaz (salonda gereksiz kare döngüsü yok)
      if (Games.isOpen() && !document.hidden) requestAnimationFrame(tick); else setTimeout(() => { last = performance.now(); requestAnimationFrame(tick); }, 1000);
    };
    tick.samples = []; requestAnimationFrame(tick);
    setInterval(() => {
      const s = tick.samples.filter(x => x > 1); tick.samples = [];
      if (!App.me || s.length < 3 || !Games.isOpen()) { worst = 0; minFps = 999; return; }
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      Api.post('/api/telemetry', { fps: Math.round(Math.min(240, avg)), game: Games.current(), worstMs: Math.round(worst), device: navigator.userAgent.slice(0, 120), appVersion: (window.SLOT_CONFIG && SLOT_CONFIG.appVersion) || '' }).catch(() => {});
      worst = 0; minFps = 999;
    }, 60000);
  })();

  // Güncelleme kontrolü: açılışta, uygulamaya geri dönüldüğünde (arka plandan) ve 30 dakikada bir.
  // Oyun/masa/pencere açıkken araya girmez; boşa çıkınca sorar. Aynı sürüm "Daha sonra" denirse 30 dk tekrar sorulmaz.
  let upLast = 0, upBusy = false;
  const busyNow = () => $('#overlay').classList.contains('show') || Games.isOpen() || (window.Okey && Okey.isOpen()) || (window.Tavla && Tavla.isOpen()) || (window.Aviator && Aviator.isOpen());
  function autoUpdate(force) {
    if (!App.me || upBusy || (!force && Date.now() - upLast < 30 * 60e3)) return;
    upBusy = true; upLast = Date.now();
    // Açılışta güncelleme önceliklidir: oyun/masa açık değilse, açık duran tanıtım/bonus penceresinin yerine gösterilir.
    const inGame = () => Games.isOpen() || (window.Okey && Okey.isOpen()) || (window.Tavla && Tavla.isOpen()) || (window.Aviator && Aviator.isOpen());
    const t = () => { if (!App.me) { upBusy = false; return; } if (inGame() || (!force && busyNow())) return setTimeout(t, 5000); upBusy = false; checkUpdate(false); };
    setTimeout(t, 2500);
  }
  App.afterEnter = () => autoUpdate(true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - upLast > 60e3) autoUpdate(true); });
  setInterval(() => autoUpdate(false), 5 * 60e3);
  boot();
})();
