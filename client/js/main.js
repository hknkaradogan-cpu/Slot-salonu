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
  boot();
})();
