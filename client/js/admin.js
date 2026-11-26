/* Yönetici paneli (tüm yetkiler sunucuda tekrar doğrulanır) */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, closeModal, guard } = UI;
  const TABS = [['stats', '📊 Özet'], ['users', '👥 Oyuncular'], ['games', '🎰 Oyunlar & RTP'], ['rewards', '🎁 Ödüller'], ['packages', '🛒 Paketler'], ['purchases', '💳 Satın Almalar'], ['events', '🎉 Etkinlikler'], ['quests', '📜 Görevler'], ['tickets', '💬 Destek'], ['perf', '⚡ Performans'], ['audit', '🧾 İşlem Geçmişi']];
  let tab = 'stats';
  const dt = (t) => t ? new Date(t).toLocaleString('tr-TR') : '—';
  const toLocal = (t) => { const d = new Date(t - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

  function open() {
    UI.screen('admin', `<div class="topbar"><button class="iconbtn" id="aBack">◀</button><div class="grow center gold" style="font-weight:900;font-size:18px">🛡️ YÖNETİCİ PANELİ</div><div style="width:40px"></div></div>
      <div style="padding:8px 10px 0"><div class="tabs">${TABS.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join('')}</div></div><div class="scroll nonav" id="aBody"></div>`);
    UI.show('admin'); $('#aBack').onclick = () => Screens.go('profile');
    $$('[data-t]').forEach(b => b.onclick = () => go(b.dataset.t)); go(tab);
  }
  function go(t) { tab = t; $$('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); const body = $('#aBody'); body.innerHTML = '<p class="center muted">Yükleniyor…</p>'; V[t](body).catch(e => { if (e.status === 403) { body.innerHTML = '<p class="center">Yönetici oturumu gerekli.</p>'; Screens.adminLogin(); return; } body.innerHTML = `<p class="err center">${esc(e.message)}</p>`; }); }
  const V = {};

  V.stats = async (b) => {
    const s = await Api.get('/api/admin/stats');
    const nm = Object.fromEntries(App.games.map(g => [g.id, g.name]));
    b.innerHTML = `<div class="card"><div class="kv"><b>Oyuncu</b><span>${fmt(s.users)}</span><b>Oyuncu bakiyeleri</b><span>${fmt(s.coins)}</span><b>Tamamlanan satın alma</b><span>${fmt(s.purchases.c)} (${fmt(s.purchases.s)} jeton)</span><b>Açık destek</b><span>${s.openTickets}</span></div></div>
      <div class="card"><div class="section-t">Gerçekleşen RTP (tüm spinler)</div><table class="tbl"><tr><th>Oyun</th><th>Spin</th><th>Bahis</th><th>RTP</th></tr>${s.games.map(g => `<tr><td>${esc(nm[g.game] || g.game)}</td><td>${fmt(g.spins)}</td><td>${fmt(g.wagered)}</td><td>${g.wagered ? (g.won / g.wagered * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('')}</table><p class="small muted">Teorik RTP her oyunda %95'tir. Az sayıda spinde gerçekleşen değer yüksek volatilite nedeniyle büyük sapma gösterebilir.</p></div>`;
  };

  V.users = async (b) => {
    b.innerHTML = `<div class="row" style="margin-bottom:10px"><input id="uQ" class="grow" placeholder="Kullanıcı adı, e-posta veya ID" style="padding:11px;border-radius:12px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff;font-size:15px"><button class="btn gold sm" id="uGo">Ara</button></div><div id="uList"></div>`;
    const load = async () => {
      const r = await Api.get('/api/admin/users?q=' + encodeURIComponent($('#uQ').value.trim()));
      $('#uList').innerHTML = `<div class="list">${r.users.map(u => `<div class="li" data-u="${u.id}" style="cursor:pointer"><div class="grow"><b>${esc(u.username)} ${u.role === 'admin' ? '<span class="pill warn">admin</span>' : ''}${u.banned ? '<span class="pill bad">askıda</span>' : ''}</b><small>#${u.id} · ${esc(u.email)} · Sv ${u.level}</small></div><b>${u.unlimited ? '∞' : fmt(u.balance)}</b></div>`).join('') || '<p class="muted center">Sonuç yok</p>'}</div>`;
      $$('[data-u]').forEach(x => x.onclick = () => user(+x.dataset.u, load));
    };
    $('#uGo').onclick = () => guard($('#uGo'), load); $('#uQ').onkeydown = (e) => { if (e.key === 'Enter') load(); };
    await load();
  };
  async function user(id, reload) {
    const r = await Api.get('/api/admin/users/' + id); const u = r.user;
    const st = { purchased: 'ok', pending: 'warn', canceled: 'bad', refunded: 'bad' };
    modal(`<h3 class="gold">${esc(u.username)} <small class="muted">#${u.id}</small></h3>
      <div class="kv small"><b>E-posta</b><span>${esc(u.email)}</span><b>Bakiye</b><span>${u.unlimited ? '∞ (sınırsız)' : fmt(u.balance)}</span><b>Seviye / XP</b><span>${u.level} / ${fmt(u.xp)}</span><b>Spin / Bahis / Kazanç</b><span>${fmt(u.spins)} / ${fmt(u.totalWagered)} / ${fmt(u.totalWon)}</span><b>İade borcu</b><span>${fmt(u.refundDebt)}</span><b>Son giriş</b><span>${dt(u.lastLoginAt)}</span><b>Durum</b><span>${u.banned ? 'Askıda' : 'Aktif'}</span></div>
      <div class="section-t" style="margin-top:12px">Jeton ekle / çıkar</div>
      <div class="row"><input id="cAmt" type="number" placeholder="Miktar (çıkarmak için -)" class="grow" style="padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff"><input id="cWhy" placeholder="Sebep" class="grow" style="padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff"></div>
      <div class="row" style="margin-top:6px">${[10000, 100000, 1000000].map(v => `<button class="btn ghost sm" data-q="${v}">+${UI.short(v)}</button>`).join('')}<button class="btn green sm grow" id="cGo">Uygula</button></div>
      <div class="section-t" style="margin-top:12px">Seviye / XP düzenle</div>
      <div class="row"><input id="pLv" type="number" min="1" max="1000000" placeholder="Seviye (1-1.000.000)" class="grow" style="padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff"><input id="pXp" type="number" min="0" placeholder="veya XP" class="grow" style="padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff"><button class="btn gold sm" id="pGo">Kaydet</button></div>
      ${u.role !== 'admin' ? `<div class="row" style="margin-top:12px"><button class="btn ${u.banned ? 'green' : 'red'} sm grow" id="bGo">${u.banned ? 'Askıyı kaldır' : 'Hesabı askıya al'}</button><button class="btn ghost sm grow" id="pwGo">🔑 Şifre sıfırla</button></div>` : ''}
      <div class="section-t" style="margin-top:12px">Satın almalar</div><table class="tbl">${r.purchases.map(p => `<tr><td>${esc(p.product_id)}<br><small>${dt(p.created_at)}</small></td><td>${fmt(p.coins)}</td><td><span class="pill ${st[p.state]}">${p.state}</span></td><td>${p.state === 'purchased' ? `<button class="btn red sm" data-rf="${p.id}">İade</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">Yok</td></tr>'}</table>
      <div class="section-t" style="margin-top:12px">Jeton hareketleri</div><table class="tbl"><tr><th>Tarih</th><th>Tür</th><th>Değişim</th><th>Bakiye</th></tr>${r.ledger.map(l => `<tr><td>${dt(l.created_at)}</td><td>${esc(l.type)}</td><td>${l.delta > 0 ? '+' : ''}${fmt(l.delta)}</td><td>${fmt(l.balance_after)}</td></tr>`).join('')}</table>`, {
      onOpen(m) {
        $$('[data-q]', m).forEach(x => x.onclick = () => { $('#cAmt').value = x.dataset.q; });
        $('#cGo').onclick = () => guard($('#cGo'), async () => { const d = Math.trunc(+$('#cAmt').value); if (!d) return toast('Miktar girin', true); await Api.post(`/api/admin/users/${id}/coins`, { delta: d, reason: $('#cWhy').value || 'manuel' }); toast('Bakiye güncellendi.'); closeModal(); user(id, reload); reload && reload(); });
        $('#pGo').onclick = () => guard($('#pGo'), async () => { const body = {}; if ($('#pLv').value) body.level = +$('#pLv').value; if ($('#pXp').value) body.xp = +$('#pXp').value; await Api.post(`/api/admin/users/${id}/progress`, body); toast('İlerleme güncellendi.'); closeModal(); user(id, reload); });
        $('#bGo') && ($('#bGo').onclick = () => guard($('#bGo'), async () => { await Api.post(`/api/admin/users/${id}/status`, { banned: !u.banned }); closeModal(); user(id, reload); reload && reload(); }));
        $('#pwGo') && ($('#pwGo').onclick = async () => { const pw = prompt('Oyuncu için yeni geçici şifre (en az 8 karakter, harf ve rakam):'); if (!pw) return; await Api.post(`/api/admin/users/${id}/password`, { password: pw }).then(() => toast('Şifre değiştirildi; oyuncunun tüm oturumları kapatıldı.')).catch(e => toast(e.message, true)); });
        $$('[data-rf]', m).forEach(x => x.onclick = async () => { if (await UI.confirm('Bu satın alma iade edilmiş sayılıp jetonlar geri alınsın mı?')) { await Api.post(`/api/admin/purchases/${x.dataset.rf}/refund`).catch(e => toast(e.message, true)); user(id, reload); } });
      },
    });
  }

  V.rewards = async (b) => {
    const c = await Api.get('/api/admin/config');
    const inp = (id, v, w = 90) => `<input id="${id}" type="number" value="${v}" style="width:${w}px;padding:7px;border-radius:8px;border:1.5px solid rgba(255,255,255,.2);background:rgba(10,2,30,.6);color:#fff">`;
    const lr = c.levelRewards;
    b.innerHTML = `<div class="card"><div class="section-t">Günlük giriş ödülü (seviye → jeton)</div><p class="small muted">Ara seviyeler doğrusal hesaplanır. Tablonun son seviyesinden sonra her seviye için ek jeton eklenir (üst sınırlı).</p>
      <table class="tbl">${c.daily.map((a, k) => `<tr><td>Seviye ${inp('dl' + k, a[0], 90)}</td><td>${inp('dc' + k, a[1], 110)} jeton</td></tr>`).join('')}</table>
      <div class="kv" style="margin-top:8px"><b>Son seviyeden sonra / seviye</b><span>${inp('daP', c.dailyAfter.perLevel, 90)}</span><b>Günlük ödül üst sınırı</b><span>${inp('daM', c.dailyAfter.max, 130)}</span></div>
      <button class="btn green block" id="dSave" style="margin-top:8px">Günlük ödülleri kaydet</button></div>
      <div class="card"><div class="section-t">Seviye ödülleri (1.000.000 seviyeye kadar)</div><p class="small muted">Her N seviyede bir: seviye × katsayı jeton. Örn. 10 ve 1.000 → Sv10: 10.000 · Sv100: 100.000 · Sv1.000.000: 1 milyar. Toplu alınır, her ödül bir kez.</p>
      <div class="kv"><b>Kaç seviyede bir</b><span>${inp('lrE', lr.every, 90)}</span><b>Seviye başına jeton</b><span>${inp('lrP', lr.perLevel, 110)}</span></div>
      <label class="field" style="margin-top:8px"><span>Özel ödüller (seviye:jeton, virgülle) örn. 1000:5000000,100000:500000000</span><input id="lrS" value="${esc(Object.entries(lr.special || {}).map(([k, v]) => k + ':' + v).join(','))}"></label>
      <button class="btn green block" id="lrSave">Seviye ödüllerini kaydet</button></div>
      <div class="card"><div class="section-t">Genel</div><div class="kv"><b>Başlangıç jetonu</b><span>${inp('gStart', c.startingCoins, 120)}</span><b>Günlük hediye limiti</b><span>${inp('gLim', c.giftDailyLimit, 70)}</span><b>E-posta servisi</b><span>${c.mailConfigured ? '<span class="pill ok">yapılandırıldı</span>' : '<span class="pill warn">yapılandırılmadı</span>'}</span></div><button class="btn green block" id="gSave" style="margin-top:8px">Kaydet</button></div>`;
    $('#dSave').onclick = () => guard($('#dSave'), async () => { await Api.put('/api/admin/config/daily', { anchors: c.daily.map((_, k) => [+$('#dl' + k).value, +$('#dc' + k).value]), after: { perLevel: +$('#daP').value, max: +$('#daM').value } }); toast('Kaydedildi'); });
    $('#lrSave').onclick = () => guard($('#lrSave'), async () => { const special = {}; $('#lrS').value.split(',').map(x => x.trim()).filter(Boolean).forEach(x => { const [k, v] = x.split(':'); special[+k] = +v; }); await Api.put('/api/admin/config/level-rewards', { every: +$('#lrE').value, perLevel: +$('#lrP').value, special }); toast('Kaydedildi'); });
    $('#gSave').onclick = () => guard($('#gSave'), async () => { await Api.put('/api/admin/config/general', { startingCoins: +$('#gStart').value, giftDailyLimit: +$('#gLim').value }); toast('Kaydedildi'); });
  };

  // Oyun bazlı teorik RTP / volatilite / aktiflik. Değişiklikler kayıt altına alınır.
  V.games = async (b) => {
    const r = await Api.get('/api/admin/games');
    b.innerHTML = `<p class="small muted">RTP uzun vadeli <b>teorik</b> geri dönüş oranıdır; her oyuncuya veya oturuma garanti değildir. Sonuçlar denetlenebilir RNG ile bağımsız belirlenir; oyuncu geçmişi olasılıkları etkilemez. İzin verilen aralık: %${(r.min * 100).toFixed(0)}–%${(r.max * 100).toFixed(0)}. Ödeme tablosu RTP ile orantılı ölçeklenir; bonus satın alma RTP'si de aynı değere eşit kalır.</p>` +
      r.games.map(g => { const obs = g.observed.wagered ? (g.observed.won / g.observed.wagered * 100).toFixed(2) + '%' : '—';
        return `<div class="card" data-g="${g.id}"><div class="row"><b class="grow" style="font-size:17px">${esc(g.name)}</b><label class="check" style="margin:0"><input type="checkbox" data-act ${g.active ? 'checked' : ''}>Aktif</label></div>
        <div class="kv small" style="margin:6px 0"><b>Teorik RTP</b><span>%${(g.rtp * 100).toFixed(2)}</span><b>Volatilite</b><span>${esc(g.volatility)}</span><b>Gerçekleşen (${fmt(g.observed.spins)} spin)</b><span>${obs}</span><b>Bonus satın alma</b><span>${Object.entries(g.buyCost).map(([k, v]) => `${k === 'super' ? 'Süper' : 'FS'} ${v}x`).join(' · ') || '—'}</span></div>
        <div class="row"><input type="number" step="0.1" min="${r.min * 100}" max="${r.max * 100}" value="${(g.rtp * 100).toFixed(1)}" data-rtp style="width:90px;padding:8px;border-radius:8px;border:1.5px solid rgba(255,255,255,.2);background:rgba(10,2,30,.6);color:#fff"> %
        <input placeholder="Not" data-note class="grow" style="min-width:0;width:40px;padding:8px;border-radius:8px;border:1.5px solid rgba(255,255,255,.2);background:rgba(10,2,30,.6);color:#fff"><button class="btn green sm" data-save>Kaydet</button></div></div>`; }).join('') +
      `<div class="section-t">RTP değişiklik kayıtları</div><table class="tbl"><tr><th>Tarih</th><th>Oyun</th><th>Eski</th><th>Yeni</th><th>Yönetici</th><th>Not</th></tr>${r.history.map(h => `<tr><td>${dt(h.created_at)}</td><td>${esc(h.game)}</td><td>${h.old_rtp ? (h.old_rtp * 100).toFixed(1) + '%' : '—'}</td><td>${(h.new_rtp * 100).toFixed(1)}%</td><td>${esc(h.admin_name || '')}</td><td>${esc(h.note || '')}</td></tr>`).join('')}</table>`;
    $$('[data-g]', b).forEach(c => {
      c.querySelector('[data-save]').onclick = () => guard(c.querySelector('[data-save]'), async () => { await Api.put('/api/admin/games/' + c.dataset.g, { rtp: +c.querySelector('[data-rtp]').value / 100, note: c.querySelector('[data-note]').value }); toast('RTP kaydedildi'); go('games'); });
      c.querySelector('[data-act]').onchange = (e) => guard(null, async () => { await Api.put('/api/admin/games/' + c.dataset.g, { active: e.target.checked }); toast(e.target.checked ? 'Oyun aktif' : 'Oyun pasif'); });
    });
  };
  V.purchases = async (b) => {
    const r = await Api.get('/api/admin/purchases'); const st = { purchased: 'ok', pending: 'warn', canceled: 'bad', refunded: 'bad' };
    b.innerHTML = `<table class="tbl"><tr><th>Tarih</th><th>Oyuncu</th><th>Ürün</th><th>Jeton</th><th>Durum</th><th>Sipariş</th></tr>${r.purchases.map(p => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.username)}</td><td>${esc(p.product_id)}</td><td>${fmt(p.coins)}</td><td><span class="pill ${st[p.state]}">${p.state}</span></td><td><small>${esc(p.order_id || '')}</small></td></tr>`).join('') || '<tr><td class="muted">Kayıt yok</td></tr>'}</table>`;
  };
  V.perf = async (b) => {
    const r = await Api.get('/api/admin/perf');
    b.innerHTML = `<div class="card"><div class="section-t">Oyun içi FPS (son 7 gün, cihazlardan)</div><table class="tbl"><tr><th>Oyun</th><th>Örnek</th><th>Ort. FPS</th><th>En düşük</th><th>En uzun kare</th></tr>${r.clients.map(c => `<tr><td>${esc(c.game)}</td><td>${c.samples}</td><td>${c.avg_fps}</td><td>${c.min_fps}</td><td>${c.worst_ms} ms</td></tr>`).join('') || '<tr><td class="muted">Henüz veri yok</td></tr>'}</table></div>
      <div class="card"><div class="section-t">Cihazlar</div><table class="tbl"><tr><th>Cihaz</th><th>Örnek</th><th>Ort. FPS</th></tr>${r.devices.map(d => `<tr><td><small>${esc(d.device)}</small></td><td>${d.n}</td><td>${d.avg_fps}</td></tr>`).join('')}</table></div>
      <div class="card"><div class="section-t">Sunucu yanıt süreleri (son 7 gün)</div><table class="tbl"><tr><th>Gün</th><th>Uç nokta</th><th>İstek</th><th>Ort.</th><th>Maks</th><th>Hata</th></tr>${r.api.map(a => `<tr><td>${a.day.slice(5)}</td><td><small>${esc(a.route)}</small></td><td>${fmt(a.count)}</td><td>${Math.round(a.total_ms / a.count)} ms</td><td>${a.max_ms} ms</td><td>${a.errors}</td></tr>`).join('')}</table></div>`;
  };

  V.packages = async (b) => {
    const r = await Api.get('/api/admin/packages');
    const f = (p = {}) => `<div class="card" data-pk="${esc(p.product_id || '')}"><label class="field"><span>Google Play ürün kimliği</span><input name="pid" value="${esc(p.product_id || '')}" ${p.product_id ? 'readonly' : ''}></label>
      <div class="row"><label class="field grow"><span>Ad</span><input name="name" value="${esc(p.name || '')}"></label><label class="field grow"><span>Jeton</span><input name="coins" type="number" value="${p.coins || ''}"></label></div>
      <div class="row"><label class="field grow"><span>Fiyat etiketi (yedek)</span><input name="price" value="${esc(p.price_label || '')}"></label><label class="field grow"><span>Bonus etiketi</span><input name="bonus" value="${esc(p.bonus_label || '')}"></label></div>
      <div class="row"><label class="check grow"><input type="checkbox" name="one" ${p.one_time ? 'checked' : ''}>Tek seferlik</label><label class="check grow"><input type="checkbox" name="act" ${p.active !== 0 ? 'checked' : ''}>Aktif</label><label class="field" style="width:80px"><span>Sıra</span><input name="sort" type="number" value="${p.sort ?? 0}"></label></div>
      <button class="btn green block" data-save>Kaydet</button></div>`;
    b.innerHTML = `<p class="small muted">Gerçek fiyat Google Play Console'da belirlenir ve uygulamada Play'den okunur. Buradaki jeton miktarı sunucuda doğrulanan satın almada yüklenen miktardır.</p>${r.packages.map(f).join('')}<div class="section-t">Yeni paket</div>${f()}`;
    $$('[data-save]', b).forEach(x => x.onclick = () => guard(x, async () => { const c = x.closest('.card'); const v = (n) => c.querySelector(`[name=${n}]`); await Api.put('/api/admin/packages/' + encodeURIComponent(v('pid').value.trim()), { name: v('name').value, coins: +v('coins').value, priceLabel: v('price').value, bonusLabel: v('bonus').value, oneTime: v('one').checked, active: v('act').checked, sort: +v('sort').value }); toast('Paket kaydedildi'); go('packages'); }));
  };

  V.events = async (b) => {
    const r = await Api.get('/api/admin/events'); const now = Date.now();
    const f = (e = {}) => `<div class="card" data-ev="${e.id || ''}"><label class="field"><span>Başlık</span><input name="title" value="${esc(e.title || '')}"></label><label class="field"><span>Açıklama</span><input name="desc" value="${esc(e.description || '')}"></label>
      <div class="row"><label class="field grow"><span>Başlangıç</span><input name="s" type="datetime-local" value="${toLocal(e.starts_at || now)}"></label><label class="field grow"><span>Bitiş</span><input name="e" type="datetime-local" value="${toLocal(e.ends_at || now + 3 * 864e5)}"></label></div>
      <div class="row"><label class="field grow"><span>XP çarpanı</span><input name="xp" type="number" min="1" max="10" value="${e.xp_mult || 1}"></label><label class="field grow"><span>Bonus jeton</span><input name="bonus" type="number" value="${e.bonus_coins || 0}"></label><label class="check"><input type="checkbox" name="act" ${e.active !== 0 ? 'checked' : ''}>Aktif</label></div>
      <button class="btn green block" data-save>${e.id ? 'Güncelle' : 'Etkinlik oluştur'}</button></div>`;
    b.innerHTML = f() + r.events.map(f).join('');
    $$('[data-save]', b).forEach(x => x.onclick = () => guard(x, async () => { const c = x.closest('.card'); const v = (n) => c.querySelector(`[name=${n}]`); await Api.post('/api/admin/events', { id: c.dataset.ev ? +c.dataset.ev : undefined, title: v('title').value, description: v('desc').value, startsAt: new Date(v('s').value).getTime(), endsAt: new Date(v('e').value).getTime(), xpMult: +v('xp').value, bonusCoins: +v('bonus').value, active: v('act').checked }); toast('Kaydedildi'); go('events'); }));
  };

  V.quests = async (b) => {
    const r = await Api.get('/api/admin/quests');
    const types = { spins: 'Spin sayısı', wager: 'Toplam bahis', bigwin: '20x+ kazanç sayısı', games: 'Farklı oyun sayısı' };
    const f = (q = {}) => `<div class="card" data-q="${q.id || ''}"><label class="field"><span>Başlık</span><input name="title" value="${esc(q.title || '')}"></label>
      <div class="row"><label class="field grow"><span>Tür</span><select name="type">${Object.entries(types).map(([k, t]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="field grow"><span>Hedef</span><input name="target" type="number" value="${q.target || ''}"></label><label class="field grow"><span>Ödül</span><input name="reward" type="number" value="${q.reward || ''}"></label></div>
      <label class="check"><input type="checkbox" name="act" ${q.active !== 0 ? 'checked' : ''}>Aktif</label><button class="btn green block" data-save>${q.id ? 'Güncelle' : 'Görev ekle'}</button></div>`;
    b.innerHTML = r.quests.map(f).join('') + '<div class="section-t">Yeni görev</div>' + f();
    $$('[data-save]', b).forEach(x => x.onclick = () => guard(x, async () => { const c = x.closest('.card'); const v = (n) => c.querySelector(`[name=${n}]`); await Api.post('/api/admin/quests', { id: c.dataset.q ? +c.dataset.q : undefined, title: v('title').value, type: v('type').value, target: +v('target').value, reward: +v('reward').value, active: v('act').checked }); toast('Kaydedildi'); go('quests'); }));
  };

  V.tickets = async (b) => {
    const r = await Api.get('/api/admin/tickets');
    b.innerHTML = r.tickets.map(t => `<div class="card"><b>${esc(t.subject)}</b> <span class="pill ${t.status === 'acik' ? 'warn' : 'ok'}">${t.status}</span><div class="small muted">${esc(t.username)} · ${dt(t.created_at)}</div><p class="small">${esc(t.message)}</p>${t.reply ? `<p class="small" style="color:var(--g2)">Yanıt: ${esc(t.reply)}</p>` : ''}<div class="row"><input class="grow" data-rp="${t.id}" placeholder="Yanıt yaz" style="padding:9px;border-radius:10px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff"><button class="btn green sm" data-send="${t.id}">Gönder</button></div></div>`).join('') || '<p class="muted center">Destek talebi yok.</p>';
    $$('[data-send]', b).forEach(x => x.onclick = () => guard(x, async () => { await Api.post(`/api/admin/tickets/${x.dataset.send}/reply`, { reply: $(`[data-rp="${x.dataset.send}"]`).value }); go('tickets'); }));
  };

  V.audit = async (b) => {
    const r = await Api.get('/api/admin/audit');
    b.innerHTML = `<table class="tbl"><tr><th>Tarih</th><th>Yönetici</th><th>İşlem</th><th>Hedef</th><th>Ayrıntı</th></tr>${r.audit.map(a => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.admin_name)}</td><td>${esc(a.action)}</td><td>${esc(a.target_name || '')}</td><td style="max-width:140px;word-break:break-all"><small>${esc(a.details)}</small></td></tr>`).join('')}</table>`;
  };

  window.Admin = { open };
})();
