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
      if (App.tab === 'shop') Screens.go('shop');
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
    if ($('#overlay').classList.contains('show')) { closeModal(); return true; }
    if (document.querySelector('.bigwin')) { document.querySelector('.bigwin').click(); return true; }
    if (Games.isOpen()) { Games.close(); return true; }
    if (App.me && App.tab !== 'lobby') { Screens.go('lobby'); return true; }
    return false;
  };
  document.addEventListener('pointerdown', () => { if (App.me) Sound.startMusic(); }, { once: true });

  /* ---------- Açılış ---------- */
  async function boot() {
    const msg = $('#splashMsg');
    if (!Api.hasToken()) { await new Promise(r => setTimeout(r, 600)); return Screens.login(); }
    for (;;) {
      try { await Screens.enter(); return; }
      catch (e) {
        if (e.status === 401 || e.status === 403) { Api.setToken(null); if (e.status === 403) toast(e.message, true); return Screens.login(); }
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
    const L = v.latest, forced = !!L.mandatory;
    UI.modal(`<h3 class="gold">⬇️ Yeni sürüm: ${UI.esc(L.version_name)}</h3>
      <p class="small">Yüklü sürüm: ${UI.esc(U.versionName())}. Güncelleme mevcut uygulamanın üzerine kurulur; hesabın, jetonların ve seviyen korunur.</p>
      ${L.notes ? `<div class="card small" style="white-space:pre-wrap">${UI.esc(L.notes)}</div>` : ''}
      <div class="xpbar hidden" id="upBar" style="height:14px;margin:8px 0"><i style="width:0%"></i><em>0%</em></div>
      <div class="small muted" id="upMsg"></div>
      <button class="btn green block" id="upGo">ŞİMDİ GÜNCELLE</button>
      ${forced ? '<p class="small err center">Bu sürüm artık desteklenmiyor; devam etmek için güncelleme gerekli.</p>' : '<button class="btn ghost block" id="upLater">Daha sonra</button>'}`, {
      noClose: !!forced,
      onOpen() {
        $('#upLater') && ($('#upLater').onclick = () => UI.closeModal());
        $('#upGo').onclick = () => { $('#upGo').disabled = true; $('#upBar').classList.remove('hidden'); $('#upMsg').textContent = 'İndiriliyor…'; U.download(L.apk_url); };
      },
    });
  }
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
      requestAnimationFrame(tick);
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

  let upChecked = false; App.afterEnter = () => { if (upChecked) return; upChecked = true; const t = () => ($('#overlay').classList.contains('show') || Games.isOpen()) ? setTimeout(t, 3000) : checkUpdate(false); setTimeout(t, 2500); };
  boot();
})();
