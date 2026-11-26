/* Ekranlar: giriş/kayıt, lobi, mağaza, profil, arkadaşlar, görevler, etkinlikler, ödüller, ayarlar, yardım */
(function () {
  'use strict';
  const { $, $$, esc, fmt, short, toast, modal, closeModal, guard, screen, show } = UI;
  const S = window.App = { me: null, daily: null, levelRewards: [], events: [], badges: {}, games: [], bets: [], tab: 'lobby' };

  /* ===================== GİRİŞ / KAYIT ===================== */
  // Yatay giriş ekranı: solda oyun dünyası (Kristal Peri + 101 Okey + Zeus), sağda form
  function authShell(inner) {
    // Tam ekran açılış sahnesi + sol tarafta cam panel; sağda yuvarlak İletişim / Tamirat
    return `<div class="authbg"></div><div class="ldbokeh"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="ldside"><button class="ldrb" type="button" onclick="Intro.help()"><span>💬</span>İLETİŞİM</button><button class="ldrb" type="button" onclick="Intro.repair()"><span>🛠️</span>TAMİRAT</button></div>
      <div class="authglass">${inner}</div>
      <p class="authlegal">18 yaş ve üzeri içindir · Sanal jetonlar yalnızca eğlence amaçlıdır; gerçek para veya ödül kazandırmaz · <a class="link" data-legal="privacy">Gizlilik</a> · <a class="link" data-legal="terms">Kullanım Koşulları</a></p><em class="ldver">By-Hkn</em>`;
  }
  // Giriş ekranı: üstte kullanıcı adı + şifre (Giriş Yap / Kayıt Ol), altta e-posta ile giriş ve Şifremi Unuttum
  function login() {
    screen('auth', authShell(`
      <div class="authh"><img src="assets/spinova_logo.webp" alt=""><div><b>Hoş geldin!</b><small>Hesabınla giriş yap ya da yeni hesap aç</small></div></div>
      <form id="fUser" autocomplete="on">
        <label class="field"><span>👤 Kullanıcı adı veya e-posta</span><input name="identifier" autocomplete="username" required></label>
        <label class="field"><span>🔒 Şifre</span><input name="password" type="password" autocomplete="current-password" required></label>
        <div class="err" id="uErr"></div>
        <div class="row"><button class="abtn white grow" type="submit">▶ GİRİŞ YAP</button><button class="abtn blue grow" type="button" id="toReg">KAYIT OL</button></div>
      </form>
      <div class="row" style="justify-content:space-between;margin-top:8px"><button class="link" id="toForgot">Şifremi Unuttum</button><button class="link" id="toAdmin">🛡️ Yönetici Girişi</button></div>`));
    show('auth');
    const bind = (formId, errId) => { $(formId).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const b = f.querySelector('button[type=submit]'); $(errId).textContent = ''; b.disabled = true;
      try { const r = await Api.post('/api/auth/login', { identifier: f.identifier.value.trim(), password: f.password.value }); Api.setToken(r.token); await enter(); }
      catch (er) { $(errId).textContent = er.message; Sound.play('error'); } finally { b.disabled = false; }
    }; };
    bind('#fUser', '#uErr'); $$('[data-legal]').forEach(a => a.onclick = (e) => { e.preventDefault(); legal(a.dataset.legal); });
    $('#toReg').onclick = register; $('#toForgot').onclick = forgot; $('#toAdmin').onclick = adminLogin;
  }
  function register() {
    screen('auth', authShell(`
      <h2 class="title gold">Kayıt Ol</h2>
      <form id="fReg" autocomplete="on">
        <label class="field"><span>👤 Kullanıcı adı (3-16 karakter, harf/rakam/_ — benzersiz)</span><input name="username" pattern="[A-Za-z0-9_]{3,16}" autocomplete="username" required></label>
        <label class="field"><span>📧 E-posta (şifre sıfırlama için)</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>🔒 Şifre (en az 8 karakter, harf ve rakam)</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="field"><span>Şifre tekrar</span><input name="password2" type="password" autocomplete="new-password" required></label>
        <label class="check"><input type="checkbox" name="age" required><span>18 yaşından büyüğüm ve <a class="link" data-legal="terms">Kullanım Koşulları</a> ile <a class="link" data-legal="privacy">Gizlilik Politikası</a>'nı kabul ediyorum.</span></label>
        <div class="err" id="rErr"></div>
        <button class="btn green block" type="submit">HESABI OLUŞTUR</button>
      </form>
      <div class="center" style="margin-top:8px"><button class="link" id="toLogin">◀ Girişe dön</button></div>`));
    show('auth');
    $$('[data-legal]').forEach(a => a.onclick = (e) => { e.preventDefault(); legal(a.dataset.legal); });
    $('#fReg').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; $('#rErr').textContent = '';
      if (f.password.value !== f.password2.value) { $('#rErr').textContent = 'Şifreler eşleşmiyor.'; return; }
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      try {
        const r = await Api.post('/api/auth/register', { email: f.email.value.trim(), username: f.username.value.trim(), password: f.password.value });
        Api.setToken(r.token); await enter(); toast('Hoş geldin! Başlangıç jetonların hesabına yüklendi.');
      } catch (er) { $('#rErr').textContent = er.message; Sound.play('error'); } finally { b.disabled = false; }
    };
    $('#toLogin').onclick = login;
  }
  function forgot() {
    screen('auth', authShell(`
      <h2 class="title gold">Şifremi Unuttum</h2>
      <div id="fg1"><label class="field"><span>Hesabının e-posta adresi</span><input id="fgId" type="email"></label>
        <button class="btn gold block" id="fgSend">Sıfırlama Kodu Gönder</button></div>
      <div id="fg2" class="hidden"><p class="small muted">E-postana 8 haneli tek kullanımlık bir kod gönderdik (30 dk geçerli).</p>
        <label class="field"><span>Kod</span><input id="fgCode" maxlength="8" style="text-transform:uppercase;letter-spacing:3px"></label>
        <label class="field"><span>Yeni şifre</span><input id="fgPw" type="password" autocomplete="new-password"></label>
        <button class="btn green block" id="fgReset">Şifreyi Değiştir</button></div>
      <div class="center"><button class="link" id="toLogin">◀ Girişe dön</button></div>`));
    show('auth');
    $('#fgSend').onclick = () => guard($('#fgSend'), async () => { await Api.post('/api/auth/forgot', { email: $('#fgId').value.trim() }); $('#fg1').classList.add('hidden'); $('#fg2').classList.remove('hidden'); toast('Hesap varsa kod gönderildi.'); });
    $('#fgReset').onclick = () => guard($('#fgReset'), async () => { await Api.post('/api/auth/reset', { code: $('#fgCode').value.trim(), password: $('#fgPw').value }); toast('Şifren değiştirildi. Giriş yapabilirsin.'); login(); });
    $('#toLogin').onclick = login;
  }
  // Yönetici girişi: ayrı uç nokta; sunucu rolü doğrular ve 12 saatlik ayrı yönetici oturumu açar.
  // Henüz yönetici yoksa güvenli kurulum (sunucu sahibine verilen tek kullanımlık kurulum anahtarı) gösterilir.
  async function adminLogin() {
    let st = { needsSetup: false, setupEnabled: false };
    try { st = await Api.get('/api/setup/status'); } catch (e) { toast(e.message, true); }
    if (st.needsSetup) return adminSetup(st);
    screen('auth', authShell(`
      <h2 class="title gold">🛡️ Yönetici Girişi</h2>
      <form id="fAdm" autocomplete="on">
        <label class="field"><span>Yönetici kullanıcı adı veya e-posta</span><input name="identifier" autocomplete="username" required></label>
        <label class="field"><span>Şifre</span><input name="password" type="password" autocomplete="current-password" required></label>
        <div class="err" id="aErr"></div>
        <button class="btn gold block" type="submit">YÖNETİCİ PANELİNE GİR</button>
      </form>
      <p class="small muted center">Yönetici oturumu 12 saat geçerlidir. Normal oyuncu hesapları bu girişi kullanamaz.</p>
      <div class="center"><button class="link" id="toLogin">◀ Oyuncu girişine dön</button></div>`));
    show('auth');
    $('#fAdm').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const b = f.querySelector('button'); $('#aErr').textContent = ''; b.disabled = true;
      try { const r = await Api.post('/api/auth/admin-login', { identifier: f.identifier.value.trim(), password: f.password.value }); Api.setToken(r.token); await enter(); Admin.open(); }
      catch (er) { $('#aErr').textContent = er.message; Sound.play('error'); } finally { b.disabled = false; }
    };
    $('#toLogin').onclick = login;
  }
  function adminSetup(st) {
    screen('auth', authShell(`
      <h2 class="title gold">🛡️ İlk Kurulum</h2>
      <p class="small center">Sunucuda henüz yönetici yok. Sunucu sahibine verilen <b>kurulum anahtarıyla</b> ilk yönetici hesabını oluştur. Kurulum bir kez yapılır; sonra bu ekran kapanır.</p>
      ${st.setupEnabled ? '' : '<p class="err center">Bu sunucuda kurulum anahtarı tanımlı değil.</p>'}
      <form id="fSet" autocomplete="off">
        <label class="field"><span>Kurulum anahtarı</span><input name="setupToken" required autocomplete="off" style="letter-spacing:1px"></label>
        <label class="field"><span>Yönetici kullanıcı adı</span><input name="username" pattern="[A-Za-z0-9_]{3,16}" required></label>
        <label class="field"><span>Yönetici e-postası</span><input name="email" type="email" required></label>
        <label class="field"><span>Güçlü şifre (en az 8 karakter, harf ve rakam)</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <div class="err" id="sErr"></div>
        <button class="btn gold block" type="submit">YÖNETİCİYİ OLUŞTUR</button>
      </form>
      <div class="center"><button class="link" id="toLogin">◀ Geri</button></div>`));
    show('auth');
    $('#fSet').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const b = f.querySelector('button'); $('#sErr').textContent = ''; b.disabled = true;
      try { const r = await Api.post('/api/setup/admin', { setupToken: f.setupToken.value, username: f.username.value.trim(), email: f.email.value.trim(), password: f.password.value }); Api.setToken(r.token); toast('Yönetici hesabı oluşturuldu ✓'); await enter(); Admin.open(); }
      catch (er) { $('#sErr').textContent = er.message; Sound.play('error'); } finally { b.disabled = false; }
    };
    $('#toLogin').onclick = login;
  }

  /* ===================== OTURUM / DURUM ===================== */
  async function refresh() {
    const r = await Api.get('/api/me');
    S.me = r.user; S.daily = r.daily; S.levelRewards = r.levelRewards; S.events = r.events; S.badges = r.badges; S.adminSession = !!r.adminSession; S.okeyActive = r.okeyActive || null;
    S.clockSkew = r.serverTime - Date.now();
    renderTop(); renderBadges();
    return r;
  }
  async function enter() {
    $('#splashMsg') && ($('#splashMsg').textContent = 'Salon hazırlanıyor…');
    const [g] = await Promise.all([Api.get('/api/games'), refresh()]);
    S.games = g.games; S.bets = g.bets;
    buildMain();
    Billing.init();
    if (S.daily.available && S.me.role !== 'admin') { const tryDaily = () => { if (!S.me || !S.daily.available) return; if ($('#overlay').classList.contains('show') || Games.isOpen()) return setTimeout(tryDaily, 1500); dailyModal(); }; setTimeout(tryDaily, 900); }
    Sound.startMusic();
    S.afterEnter && S.afterEnter();
    if (S.okeyActive && window.Okey) setTimeout(() => { if (!$('#overlay').classList.contains('show')) Okey.offerResume(S.okeyActive); }, 700);
  }
  function logout() { Api.post('/api/auth/logout').catch(() => {}); Api.setToken(null); S.me = null; Sound.stopMusic(); login(); }

  function topbar() {
    return `<div class="topbar"><div class="avatar" data-go="profile" id="tAv"></div>
      <div class="lvlbox"><div class="nm"><span class="lvl" id="tLvl"></span><span id="tName"></span></div><div class="xpbar"><i id="tXp"></i><em id="tXpT"></em></div></div>
      <div class="coins" id="tCoins" data-go="shop"><span class="c">🪙</span><span id="tBal"></span><span class="plus">+</span></div></div>`;
  }
  function renderTop() {
    const u = S.me; if (!u) return;
    $$('#tAv').forEach(e => e.innerHTML = UI.AVATARS[u.avatar] || UI.AVATARS[0]);
    $$('#tLvl').forEach(e => e.textContent = 'Sv ' + u.level);
    $$('#tName').forEach(e => e.textContent = u.username);
    const pct = u.maxLevel ? 100 : Math.min(100, u.xpInto / u.xpNeed * 100);
    $$('#tXp').forEach(e => e.style.width = pct + '%');
    $$('#tXpT').forEach(e => e.textContent = u.maxLevel ? 'MAKS SEVİYE' : `${fmt(u.xpInto)} / ${fmt(u.xpNeed)} XP`);
    $$('#tBal,#wBal').forEach(e => e.textContent = u.unlimited ? '∞ Sınırsız' : fmt(u.balance));
  }
  function setBalance(b, bump) { if (!S.me) return; S.me.balance = b; renderTop(); if (bump) $$('#tCoins').forEach(e => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }); }
  function renderBadges() {
    const n = S.badges || {}; const d = (sel, v) => { const e = $(sel); if (!e) return; e.innerHTML = v ? `<span class="dot">${v}</span>` : ''; };
    d('#bDaily', S.daily && S.daily.available ? '!' : ''); d('#bLvl', S.levelRewards && S.levelRewards.pending ? S.levelRewards.pending.count : 0);
    d('#bFriends', (n.gifts || 0) + (n.friendRequests || 0)); d('#bEvents', (S.events || []).length);
    window.Platform && Platform.renderBadges();
  }

  /* ===================== ANA ÇERÇEVE ===================== */
  const TABS = [['lobby', '🎰', 'Lobi'], ['quests', '📜', 'Görevler'], ['shop', '🛒', 'Mağaza'], ['friends', '👥', 'Arkadaşlar'], ['profile', '👤', 'Profil']];
  function buildMain() { Platform.home(); }
  function buildMainOld() {
    screen('main', `${topbar()}<div class="scroll" id="mainBody"></div>
      <div class="nav">${TABS.map(([k, i, t]) => `<button data-tab="${k}"><span class="i">${i}</span>${t}${k === 'friends' ? '<span id="bFriends"></span>' : ''}</button>`).join('')}</div>`);
    $('#main').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { Sound.play('click'); go(t.dataset.tab); }
      const g = e.target.closest('[data-go]'); if (g) { Sound.play('click'); go(g.dataset.go); }
    });
    renderTop();
  }
  function go(tab) {
    if (window.Platform) { if (!tab || tab === 'lobby' || tab === 'home') return Platform.home(); if (String(tab).startsWith('entry:')) return Entry.open(tab.slice(6)); return Platform.panel(tab); }
    S.tab = tab; show('main');
    $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#mainBody'); body.scrollTop = 0;
    ({ lobby, quests, shop, friends, profile })[tab](body);
    renderBadges();
  }

  /* ===================== LOBİ ===================== */
  function lobby(body) {
    body.innerHTML = `
      <div class="banner"><img src="img/hero.png" alt="SPINOVA 101 OKEY"><div class="cta"><button class="btn green sm" id="playRand">▶ HEMEN OYNA</button></div></div>
      <div class="quick">
        <div class="qbtn" id="qDaily"><span class="i">🎁</span>Günlük<span class="t" id="dailyT"></span><span id="bDaily"></span></div>
        <div class="qbtn" id="qLvl"><span class="i">🏆</span>Seviye<span class="t">Ödülleri</span><span id="bLvl"></span></div>
        <div class="qbtn" id="qEv"><span class="i">🎉</span>Etkinlik<span class="t">${S.events.length ? 'AKTİF' : '—'}</span><span id="bEvents"></span></div>
        <div class="qbtn" id="qShop"><span class="i">💎</span>Jeton<span class="t">Mağaza</span></div>
      </div>
      <div class="jpbanner"><img src="assets/a_jackpot.webp" alt="JACKPOT"><span>Altın Şans çarkında<br><b style="font-size:16px;color:#ffd34d">1000x JACKPOT</b></span><img src="assets/b_chest.webp" alt=""></div>
      <div class="okcard" id="okCard"><span class="live">ONLINE</span><div class="tiles"><div class="otile c0"><span>1</span><b class="od"></b></div><div class="otile c1"><span>0</span><b class="od"></b></div><div class="otile c2"><span>1</span><b class="od"></b></div></div><div class="grow"><b>101 OKEY</b><small>Gerçek oyuncularla · Tekli / Eşli · Özel masa</small></div><span style="font-size:26px">▶</span></div>
      <div class="section-t">🔥 <span class="gold">7 EFSANE OYUN</span></div>
      <div class="games">${S.games.map((g, i) => gameCard(g, i === 6)).join('')}</div>`;
    $$('.gcard', body).forEach(c => c.onclick = () => { Sound.play('click'); Games.open(c.dataset.id); });
    $$('.gcard img', body).forEach(im => im.onerror = () => { im.replaceWith(Object.assign(document.createElement('span'), { textContent: im.dataset.emb })); });
    $('#playRand').onclick = () => Games.open(S.games[(Math.random() * S.games.length) | 0].id);
    $('#okCard').onclick = () => { Sound.play('click'); Okey.lobby(); };
    $('#qDaily').onclick = dailyModal; $('#qLvl').onclick = levelRewardsModal; $('#qEv').onclick = eventsModal; $('#qShop').onclick = () => go('shop');
    tickDaily();
  }
  function gameCard(g, wide) {
    const th = Sym.THEMES[g.id];
    return `<div class="gcard ${wide ? 'wide' : ''}" data-id="${g.id}" style="--b1:${th.b1};--b2:${th.b2};--frame:${th.frame};--glow:${th.glow}88">
      <div class="rays"></div><div class="art"><img class="${th.cardAlpha ? 'alpha' : 'cover'}" src="assets/${th.card}.webp" data-emb="${th.emb}" alt=""></div>
      ${g.rib ? `<div class="rib">${g.rib}</div>` : ''}<div class="nm">${esc(g.name)}<span class="tg">${esc(g.tag)}</span></div></div>`;
  }
  let dailyTimer = null;
  function tickDaily() {
    clearInterval(dailyTimer);
    const f = () => { const e = $('#dailyT'); if (!e || !S.daily) return clearInterval(dailyTimer); const left = S.daily.nextAt - (Date.now() + (S.clockSkew || 0)); if (left <= 0) { e.textContent = 'HAZIR!'; S.daily.available = true; renderBadges(); } else e.textContent = hms(left); };
    f(); dailyTimer = setInterval(f, 1000);
  }
  const hms = (ms) => { const s = Math.ceil(ms / 1000); return [s / 3600 | 0, (s % 3600) / 60 | 0, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };

  /* ===================== GÜNLÜK / SEVİYE / ETKİNLİK ===================== */
  function dailyModal() {
    const d = S.daily;
    modal(`<div class="promo"><div class="prays"></div><h2 class="ptitle2">GÜNLÜK ÖDÜL</h2>
      <div class="pbox"><img class="pchest" src="assets/ic_chest.webp" alt=""><div><small>Seviye ${S.me.level} ödülün</small><b class="pamt">${fmt(d.amount)}</b><small>jeton + 1 bilet</small></div><img class="pcoins" src="assets/fx_coins.webp" alt=""></div></div>
      <p class="center small muted">Ödül seviyene göre artar: Sv1 500 · Sv10 1.000 · Sv50 5.000 · Sv100 10.000 jeton. 24 saatte bir alınır (sunucu saati).</p>
      <button class="pgo" id="dClaim" ${d.available ? '' : 'disabled'}>${d.available ? 'HEMEN TOPLA' : 'Sonraki ödül: <span id="dLeft"></span>'}</button>`, { cls: 'promom',
      onOpen() {
        if (!d.available) { const t = setInterval(() => { const e = $('#dLeft'); if (!e) return clearInterval(t); e.textContent = hms(d.nextAt - Date.now() - (S.clockSkew || 0)); }, 1000); }
        $('#dClaim').onclick = () => guard($('#dClaim'), async () => {
          const r = await Api.post('/api/daily/claim'); S.daily = r.daily; setBalance(r.balance, true);
          Sound.play('coin'); UI.coinShower(60); toast(`+${fmt(r.amount)} jeton!`); closeModal(); renderBadges(); tickDaily();
        });
      },
    });
  }
  function levelRewardsModal() {
    const R = S.levelRewards, u = S.me;
    modal(`<h3 class="gold">🏆 Seviye Ödülleri</h3>
      <p class="center small muted">Her ${fmt(R.every)} seviyede bir ödül: seviye × ${fmt(R.perLevel)} jeton · ${fmt(R.maxLevel)} seviyeye kadar · Her ödül bir kez alınır</p>
      <div class="card center"><div class="small muted">Seviyen</div><div class="gold" style="font-size:34px;font-weight:900">${fmt(u.level)} <small style="font-size:14px">/ ${fmt(R.maxLevel)}</small></div>
        <div class="xpbar" style="height:14px;margin:6px 0"><i style="width:${u.maxLevel ? 100 : u.xpInto / u.xpNeed * 100}%"></i><em>${u.maxLevel ? 'MAKS' : fmt(u.xpInto) + ' / ' + fmt(u.xpNeed) + ' XP'}</em></div>
        <div class="small muted">Her 100 jeton bahis = 1 XP · Bir seviye en az ~25 spin sürer</div></div>
      ${R.pending.count ? `<button class="btn green block" id="lrClaim">${R.pending.count} ödülü al · +${fmt(R.pending.coins)} 🪙</button>` : '<p class="center muted small">Şu an alınacak ödül yok.</p>'}
      <div class="section-t" style="margin-top:12px">Sıradaki ödüller</div>
      <div class="list">${R.next.map(x => `<div class="li"><div class="avatar" style="width:52px;height:40px;border-radius:12px;font-size:12px;font-weight:900">${short(x.level)}</div><div class="grow"><b>${fmt(x.level)}. Seviye</b><small>${fmt(x.coins)} jeton</small></div><span class="pill">🔒</span></div>`).join('')}</div>`, {
      onOpen() {
        $('#lrClaim') && ($('#lrClaim').onclick = () => guard($('#lrClaim'), async () => {
          const r = await Api.post('/api/level-rewards/claim'); setBalance(r.balance, true); Sound.play('bigwin'); UI.coinShower(40);
          await refresh(); closeModal();
          if (r.celebrate) celebrate100(r.coins); else toast(`+${fmt(r.coins)} jeton (${r.count} ödül)`);
        }));
      },
    });
  }
  function adminReauth() {
    modal(`<h3 class="gold">🛡️ Yönetici Doğrulaması</h3><p class="small center">Yönetici paneli için şifreni yeniden gir (yönetici oturumu 12 saat geçerlidir).</p>
      <label class="field"><span>Şifre</span><input type="password" id="arPw" autocomplete="current-password"></label><button class="btn gold block" id="arGo">Devam</button>`, {
      onOpen() { $('#arGo').onclick = () => guard($('#arGo'), async () => { const r = await Api.post('/api/auth/admin-login', { identifier: S.me.username, password: $('#arPw').value }); Api.setToken(r.token); S.adminSession = true; closeModal(); Admin.open(); }); },
    });
  }
  function celebrate100(coins) {
    const d = document.createElement('div'); d.className = 'bigwin celebrate';
    d.innerHTML = `<div class="rays"></div><div style="font-size:110px;position:relative;animation:floaty 2s infinite">👑</div><div class="t gold">EFSANE!<br>YENİ ZİRVE</div><div class="n">+${fmt(coins)}</div><div class="s">Salonun en tepesindesin! Dokun ve devam et</div>`;
    document.body.appendChild(d); Sound.play('bigwin'); let n = 0; const iv = setInterval(() => { UI.confetti(60); UI.coinShower(40); if (++n > 5) clearInterval(iv); }, 700);
    d.onclick = () => { clearInterval(iv); d.remove(); };
  }
  async function eventsModal() {
    const r = await Api.get('/api/events').catch(e => { toast(e.message, true); return null; }); if (!r) return;
    modal(`<h3 class="gold">🎉 Etkinlikler</h3>${r.events.length ? `<div class="list">${r.events.map(e => `<div class="li" style="flex-direction:column;align-items:stretch"><b>${esc(e.title)}</b><small>${esc(e.description)}</small>
      <small>Bitiş: ${new Date(e.ends_at).toLocaleString('tr-TR')}${e.xp_mult > 1 ? ` · <b style="display:inline;color:var(--g2)">${e.xp_mult}x XP</b>` : ''}</small>
      ${e.bonus_coins ? (e.claimed ? '<span class="pill ok" style="align-self:flex-start;margin-top:6px">Ödül alındı</span>' : `<button class="btn gold sm" style="margin-top:6px" data-ev="${e.id}">${fmt(e.bonus_coins)} jeton al</button>`) : ''}</div>`).join('')}</div>` : '<p class="center muted">Şu an aktif etkinlik yok. Yakında yeni etkinlikler!</p>'}`, {
      onOpen(m) { $$('[data-ev]', m).forEach(b => b.onclick = () => guard(b, async () => { const x = await Api.post(`/api/events/${b.dataset.ev}/claim`); setBalance(x.balance, true); UI.coinShower(50); toast(`+${fmt(x.reward)} jeton!`); closeModal(); })); },
    });
  }

  /* ===================== GÖREVLER ===================== */
  async function quests(body) {
    body.innerHTML = '<h2 class="title gold">📜 Günlük Görevler</h2><div id="qList" class="list"><p class="center muted">Yükleniyor…</p></div><p class="small muted center">Görevler her gün 00:00\'da (TSİ) yenilenir.</p>';
    try {
      const r = await Api.get('/api/quests');
      $('#qList').innerHTML = r.quests.map(q => { const pct = Math.min(100, q.progress / q.target * 100); const done = q.progress >= q.target;
        return `<div class="li"><div style="font-size:30px">${{ spins: '🎰', wager: '💰', bigwin: '💥', games: '🎮' }[q.type] || '⭐'}</div><div class="grow"><b>${esc(q.title)}</b><small>${q.type === 'wager' ? short(q.progress) + ' / ' + short(q.target) : fmt(q.progress) + ' / ' + fmt(q.target)} · Ödül ${fmt(q.reward)} 🪙</small><div class="prog"><i style="width:${pct}%"></i></div></div>
        ${q.claimed ? '<span class="pill ok">✓</span>' : done ? `<button class="btn green sm" data-q="${q.id}">AL</button>` : ''}</div>`; }).join('');
      $$('[data-q]').forEach(b => b.onclick = () => guard(b, async () => { const x = await Api.post(`/api/quests/${b.dataset.q}/claim`); setBalance(x.balance, true); Sound.play('coin'); UI.coinBurst(innerWidth / 2, innerHeight / 2); toast(`+${fmt(x.reward)} jeton!`); quests(body); }));
    } catch (e) { $('#qList').innerHTML = `<p class="center err">${esc(e.message)}</p>`; }
  }

  /* ===================== MAĞAZA ===================== */
  const PK_IC = { coins_starter: '🎁', coins_small: '🪙', coins_medium: '💰', coins_large: '💎', coins_mega: '👑', coins_vip: '🌟' };
  async function shop(body) {
    body.innerHTML = '<h2 class="title gold">🛒 Jeton Mağazası</h2><div id="pkList"><p class="center muted">Yükleniyor…</p></div>';
    try {
      const r = await Api.get('/api/shop'); S.shop = r;
      const prices = Billing.prices();
      $('#pkList').innerHTML =
        r.packages.map(p => `<div class="pk ${p.productId === 'coins_vip' ? 'vip' : ''}"><div class="ic">${PK_IC[p.productId] || '🪙'}</div><div class="grow"><b>${esc(p.name)}</b><div class="amt gold">${fmt(p.coins)}</div>${p.bonusLabel ? `<span class="bl">${esc(p.bonusLabel)}</span>` : ''}</div>
        <button class="btn green" data-buy="${p.productId}" ${p.available ? '' : 'disabled'}>${p.available ? esc(prices[p.productId] || p.priceLabel) : 'Alındı'}</button></div>`).join('') +
        `<div class="notice">${esc(r.notice)}<br>Ödemeler Google Play üzerinden yapılır ve sunucumuzda doğrulanır.</div><button class="btn ghost block" id="shHist">🧾 Satın Alma Geçmişi</button>`;
      $('#shHist').onclick = purchaseHistory;
      $$('[data-buy]').forEach(b => b.onclick = () => { Sound.play('click'); Billing.buy(b.dataset.buy, r.billingAccountId); });
    } catch (e) { $('#pkList').innerHTML = `<p class="center err">${esc(e.message)}</p>`; }
  }
  async function purchaseHistory() {
    const r = await Api.get('/api/shop/history').catch(e => { toast(e.message, true); return null; }); if (!r) return;
    const st = { purchased: ['ok', 'Tamamlandı'], pending: ['warn', 'Bekliyor'], canceled: ['bad', 'İptal'], refunded: ['bad', 'İade edildi'] };
    modal(`<h3 class="gold">🧾 Satın Alma Geçmişi</h3>${r.purchases.length ? `<div class="list">${r.purchases.map(p => `<div class="li"><div class="grow"><b>${esc(p.name || p.product_id)}</b><small>${new Date(p.created_at).toLocaleString('tr-TR')}${p.order_id ? ' · ' + esc(p.order_id) : ''}</small></div><div style="text-align:right">${p.coins ? `<b>${fmt(p.coins)}</b>` : ''}<span class="pill ${(st[p.state] || [])[0]}">${(st[p.state] || [, p.state])[1]}</span></div></div>`).join('')}</div>` : '<p class="center muted">Henüz satın alma yok.</p>'}`);
  }

  /* ===================== ARKADAŞLAR ===================== */
  async function friends(body) {
    body.innerHTML = '<h2 class="title gold">👥 Arkadaşlar</h2><div class="card"><div class="row"><input id="frName" class="grow" placeholder="Kullanıcı adı" style="padding:11px;border-radius:12px;border:2px solid rgba(255,255,255,.15);background:rgba(10,2,30,.6);color:#fff;font-size:15px"><button class="btn gold sm" id="frAdd">Ekle</button></div></div><div id="frBody"></div>';
    $('#frAdd').onclick = () => guard($('#frAdd'), async () => { const r = await Api.post('/api/friends/request', { username: $('#frName').value.trim() }); toast(r.status === 'accepted' ? 'Artık arkadaşsınız!' : r.status === 'exists' ? 'İstek zaten gönderildi.' : 'Arkadaşlık isteği gönderildi.'); friends(body); });
    try {
      const r = await Api.get('/api/friends');
      const av = (u) => `<div class="avatar" style="width:38px;height:38px;font-size:20px">${UI.AVATARS[u.avatar] || UI.AVATARS[0]}</div>`;
      $('#frBody').innerHTML =
        (r.gifts.length ? `<div class="section-t">🎁 Gelen Hediyeler</div><div class="list">${r.gifts.map(g => `<div class="li"><div style="font-size:28px">🎁</div><div class="grow"><b>${esc(g.username)}</b><small>${fmt(g.amount)} jeton gönderdi</small></div><button class="btn green sm" data-gift="${g.id}">AL</button></div>`).join('')}</div>` : '') +
        (r.incoming.length ? `<div class="section-t">📨 İstekler</div><div class="list">${r.incoming.map(u => `<div class="li">${av(u)}<div class="grow"><b>${esc(u.username)}</b><small>Sv ${u.level}</small></div><button class="btn green sm" data-acc="${u.id}">Kabul</button><button class="btn ghost sm" data-rm="${u.id}">✕</button></div>`).join('')}</div>` : '') +
        `<div class="section-t">⭐ Arkadaşlarım (${r.friends.length})</div><div class="list">${r.friends.map(u => `<div class="li">${av(u)}<div class="grow"><b>${esc(u.username)}</b><small>Sv ${u.level}</small></div><button class="btn gold sm" data-send="${u.id}" data-nm="${esc(u.username)}">🎁 Hediye</button><button class="btn ghost sm" data-rm="${u.id}">✕</button></div>`).join('') || '<p class="muted center small">Henüz arkadaşın yok. Kullanıcı adıyla ekle!</p>'}</div>` +
        (r.outgoing.length ? `<p class="small muted">Bekleyen istekler: ${r.outgoing.map(u => esc(u.username)).join(', ')}</p>` : '') +
        `<p class="small muted center">Günde en fazla ${r.giftDailyLimit} hediye gönderebilirsin. Hediye için e-posta doğrulaması gerekir.</p>`;
      $$('[data-gift]').forEach(b => b.onclick = () => guard(b, async () => { const x = await Api.post(`/api/gifts/${b.dataset.gift}/claim`); setBalance(x.balance, true); Sound.play('coin'); toast(`+${fmt(x.amount)} jeton`); await refresh(); friends(body); }));
      $$('[data-acc]').forEach(b => b.onclick = () => guard(b, async () => { await Api.post(`/api/friends/${b.dataset.acc}/accept`); await refresh(); friends(body); }));
      $$('[data-rm]').forEach(b => b.onclick = async () => { if (await UI.confirm('Arkadaşlıktan çıkarılsın mı?')) guard(b, async () => { await Api.post(`/api/friends/${b.dataset.rm}/remove`); friends(body); }); });
      $$('[data-send]').forEach(b => b.onclick = () => modal(`<h3 class="gold">🎁 ${esc(b.dataset.nm)} için hediye</h3><div class="list">${r.giftAmounts.map(a => `<button class="btn gold block" data-amt="${a}">${fmt(a)} jeton</button>`).join('')}</div>`, {
        onOpen(m) { $$('[data-amt]', m).forEach(x => x.onclick = () => guard(x, async () => { const y = await Api.post('/api/gifts/send', { to: +b.dataset.send, amount: +x.dataset.amt }); setBalance(y.balance); toast('Hediye gönderildi!'); closeModal(); })); },
      }));
    } catch (e) { $('#frBody').innerHTML = `<p class="center err">${esc(e.message)}</p>`; }
  }

  /* ===================== PROFİL ===================== */
  function profile(body) {
    const u = S.me;
    body.innerHTML = `<div class="card center"><div class="avatar" style="width:84px;height:84px;font-size:48px;margin:0 auto 8px" id="pAv">${UI.AVATARS[u.avatar]}</div>
      <div style="font-size:22px;font-weight:900">${esc(u.username)} ${u.role === 'admin' ? '<span class="pill warn">YÖNETİCİ</span>' : ''}</div><div class="small muted">${esc(u.email)}</div>
      <div style="margin:10px 0"><span class="lvl" style="font-size:14px">Seviye ${u.level}</span></div><div class="xpbar" style="height:16px"><i style="width:${u.maxLevel ? 100 : u.xpInto / u.xpNeed * 100}%"></i><em>${u.maxLevel ? 'MAKS' : fmt(u.xpInto) + ' / ' + fmt(u.xpNeed) + ' XP'}</em></div>
      <p class="small muted">Her 100 jetonluk bahis = 1 XP</p></div>
      <div class="card"><div class="kv"><b>Bakiye</b><span>${u.unlimited ? '∞' : fmt(u.balance)} 🪙</span><b>Toplam spin</b><span>${fmt(u.spins)}</span><b>Toplam bahis</b><span>${fmt(u.totalWagered)}</span><b>Toplam kazanç</b><span>${fmt(u.totalWon)}</span><b>En büyük kazanç</b><span>${fmt(u.biggestWin)}</span><b>Üyelik</b><span>${new Date(u.createdAt).toLocaleDateString('tr-TR')}</span></div></div>
      <div class="list">
        ${u.role === 'admin' ? '<button class="btn gold block" id="pAdmin">🛡️ Yönetici Paneli</button>' : ''}
        <button class="btn purple block" id="pLvl">🏆 Seviye Ödülleri</button>
        <button class="btn purple block" id="pHist">🧾 Satın Alma Geçmişi</button>
        <button class="btn purple block" id="pFair">🔐 Adil Oyun & Spin Geçmişi</button>
        <button class="btn purple block" id="pSet">⚙️ Ayarlar</button>
        <button class="btn purple block" id="pHelp">💬 Yardım ve Destek</button>
        <div class="row"><button class="btn ghost grow sm" id="pPriv">Gizlilik Politikası</button><button class="btn ghost grow sm" id="pTerms">Kullanım Koşulları</button></div>
        <button class="btn ghost block sm" id="pUpd" style="margin-top:6px">⬇️ Güncellemeleri denetle · ${UI.esc((window.SLOT_CONFIG && SLOT_CONFIG.appVersion) ? 'v' + SLOT_CONFIG.appVersion : 'Web sürümü')}</button>
        <button class="btn ghost block" id="pPw">Şifre Değiştir</button>
        <button class="btn red block" id="pOut">Çıkış Yap</button>
      </div>`;
    $('#pAv').onclick = () => modal(`<h3 class="gold">Avatar Seç</h3><div class="row wrap" style="justify-content:center">${UI.AVATARS.map((a, i) => `<div class="avatar" data-av="${i}" style="width:58px;height:58px;font-size:32px">${a}</div>`).join('')}</div>`, { onOpen(m) { $$('[data-av]', m).forEach(x => x.onclick = async () => { await Api.post('/api/me/avatar', { avatar: +x.dataset.av }).catch(() => {}); S.me.avatar = +x.dataset.av; closeModal(); renderTop(); profile(body); }); } });
    $('#pAdmin') && ($('#pAdmin').onclick = () => S.adminSession ? Admin.open() : adminReauth());
    $('#pLvl').onclick = levelRewardsModal; $('#pHist').onclick = purchaseHistory; $('#pFair').onclick = fairModal; $('#pSet').onclick = settings; $('#pHelp').onclick = help;
    $('#pUpd').onclick = () => S.checkUpdate && S.checkUpdate(true); $('#pPriv').onclick = () => legal('privacy'); $('#pTerms').onclick = () => legal('terms'); $('#pOut').onclick = async () => { if (await UI.confirm('Çıkış yapılsın mı?')) logout(); };
    $('#pPw').onclick = () => modal(`<h3 class="gold">Şifre Değiştir</h3><label class="field"><span>Mevcut şifre</span><input type="password" id="cp1"></label><label class="field"><span>Yeni şifre</span><input type="password" id="cp2"></label><button class="btn green block" id="cpGo">Kaydet</button>`, { onOpen() { $('#cpGo').onclick = () => guard($('#cpGo'), async () => { await Api.post('/api/auth/change-password', { current: $('#cp1').value, password: $('#cp2').value }); toast('Şifre değiştirildi.'); closeModal(); }); } });
  }
  async function fairModal() {
    const [f, h] = await Promise.all([Api.get('/api/fair'), Api.get('/api/spins')]).catch(e => { toast(e.message, true); return []; }); if (!f) return;
    const nm = Object.fromEntries(S.games.map(g => [g.id, g.name]));
    modal(`<h3 class="gold">🔐 Adil Oyun</h3><p class="small muted">Her spin sonucu, spin öncesi özeti gösterilen gizli sunucu tohumu + senin istemci tohumun + spin sayacı (nonce) ile HMAC-SHA256 kullanılarak belirlenir. Tohumu değiştirdiğinde eski tohum açıklanır ve tüm spinlerini tools/verify-spin.js ile yeniden hesaplayabilirsin. Kazanma olasılıkları oyuncu geçmişine göre değiştirilmez.</p>
      <div class="kv small" style="word-break:break-all"><b>Sunucu tohumu özeti</b><span>${f.serverSeedHash}</span><b>İstemci tohumu</b><span>${esc(f.clientSeed)}</span><b>Nonce</b><span>${f.nonce}</span></div>
      <button class="btn gold block" id="fRot" style="margin:10px 0">Tohumu Değiştir & Eskisini Açıkla</button>
      ${f.revealed.length ? `<div class="section-t small">Açıklanan tohumlar</div><div class="small" style="word-break:break-all">${f.revealed.map(r => `<div class="li"><div>${r.server_seed}<br><small>istemci: ${esc(r.client_seed)} · son nonce ${r.last_nonce}</small></div></div>`).join('')}</div>` : ''}
      <div class="section-t small">Son spinler</div><table class="tbl"><tr><th>Oyun</th><th>Bahis</th><th>Kazanç</th><th>Nonce</th></tr>${h.spins.map(s => `<tr><td>${esc(nm[s.game] || s.game)}</td><td>${fmt(s.bet)}</td><td>${fmt(s.win)}</td><td>${s.nonce}</td></tr>`).join('')}</table>`, {
      onOpen() { $('#fRot').onclick = () => guard($('#fRot'), async () => { await Api.post('/api/fair/rotate'); toast('Yeni tohum oluşturuldu; eskisi açıklandı.'); closeModal(); fairModal(); }); },
    });
  }
  function settings() {
    const s = Sound.get(); const turbo = localStorage.getItem('slot_turbo') === '1';
    const tg = (id, on, t) => `<label class="li"><span class="grow"><b>${t}</b></span><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="width:26px;height:26px;accent-color:#ffd34d"></label>`;
    modal(`<h3 class="gold">⚙️ Ayarlar</h3><div class="list">${tg('sSnd', s.sound, '🔊 Ses efektleri')}${tg('sMus', s.music, '🎵 Müzik')}${tg('sVib', s.vibrate, '📳 Titreşim')}${tg('sTur', turbo, '⚡ Turbo dönüş (varsayılan)')}</div>
      <button class="btn green block" id="sUpd" style="margin-top:8px">⬇️ Güncellemeleri denetle${window.AndroidUpdate && AndroidUpdate.enabled && AndroidUpdate.enabled() ? ' · yüklü ' + esc(AndroidUpdate.versionName()) : ''}</button>
      <p class="small muted center">SPINOVA 101 OKEY · ${Api.isLocal() ? 'YEREL MOD (veriler bu cihazda; mağaza, arkadaşlar ve yönetici paneli sunucu gerektirir)' : 'Sunucu: ' + esc((window.SLOT_CONFIG.apiBase || location.origin))}</p>`, {
      onOpen() { $('#sUpd').onclick = () => { closeModal(); S.checkUpdate && S.checkUpdate(true); }; $('#sSnd').onchange = e => Sound.set('sound', e.target.checked); $('#sMus').onchange = e => Sound.set('music', e.target.checked); $('#sVib').onchange = e => Sound.set('vibrate', e.target.checked); $('#sTur').onchange = e => localStorage.setItem('slot_turbo', e.target.checked ? '1' : '0'); },
    });
  }
  async function help() {
    const t = await Api.get('/api/support').catch(() => ({ tickets: [] }));
    const faq = [['Jetonları nakde çevirebilir miyim?', 'Hayır. Jetonlar yalnızca uygulama içinde eğlence amaçlıdır; nakde, paraya veya ödüle çevrilemez.'], ['Satın aldığım jetonlar gelmedi', 'Ödeme Google Play tarafından onay bekliyor olabilir (bekleyen ödeme). Onaylandığında jetonlar otomatik yüklenir. Sorun sürerse aşağıdan destek talebi aç.'], ['Günlük ödül ne zaman yenilenir?', 'Son aldığın andan 24 saat sonra (sunucu saatine göre).'], ['Seviye nasıl atlanır?', 'Her 100 jetonluk bahis 1 XP kazandırır. 2. seviye için 500 XP gerekir; sonraki her seviyede gereksinim 100 XP artar. 100. seviye son seviyedir.'], ['Oyunlar adil mi?', 'Her oyunun teorik RTP\'si %95\'tir ve sonuçlar denetlenebilir RNG ile belirlenir. Profil > Adil Oyun bölümünden doğrulayabilirsin.']];
    modal(`<h3 class="gold">💬 Yardım ve Destek</h3><div class="list">${faq.map(([q, a]) => `<details class="li" style="display:block"><summary><b style="display:inline">${q}</b></summary><p class="small">${a}</p></details>`).join('')}</div>
      <div class="section-t" style="margin-top:12px">Destek talebi oluştur</div><label class="field"><span>Konu</span><input id="tkS" maxlength="120"></label><label class="field"><span>Mesaj</span><textarea id="tkM" rows="4" maxlength="2000"></textarea></label><button class="btn green block" id="tkGo">Gönder</button>
      ${t.tickets.length ? `<div class="section-t" style="margin-top:12px">Taleplerim</div><div class="list">${t.tickets.map(x => `<div class="li" style="display:block"><b>${esc(x.subject)}</b> <span class="pill ${x.status === 'yanitlandi' ? 'ok' : 'warn'}">${x.status === 'yanitlandi' ? 'Yanıtlandı' : 'Açık'}</span><small style="display:block">${esc(x.message)}</small>${x.reply ? `<p class="small" style="color:var(--g2)">Destek: ${esc(x.reply)}</p>` : ''}</div>`).join('')}</div>` : ''}`, {
      onOpen() { $('#tkGo').onclick = () => guard($('#tkGo'), async () => { await Api.post('/api/support', { subject: $('#tkS').value, message: $('#tkM').value }); toast('Talebin alındı. En kısa sürede yanıtlayacağız.'); closeModal(); }); },
    });
  }
  function legal(which) {
    const P = `<h3 class="gold">Gizlilik Politikası</h3><div class="small" style="line-height:1.55">
      <p><b>Toplanan veriler:</b> e-posta adresi, kullanıcı adı, şifrenin geri döndürülemez özeti (scrypt), oyun ilerlemesi (jeton, XP, seviye), spin kayıtları, satın alma kayıtları (Google Play sipariş numarası ve satın alma belirteci), destek mesajları ve güvenlik amaçlı IP adresi.</p>
      <p><b>Kullanım amacı:</b> hesabın sağlanması, ilerlemenin cihazlar arasında korunması, ödemelerin doğrulanması, dolandırıcılığın önlenmesi ve destek.</p>
      <p><b>Paylaşım:</b> Veriler satılmaz. Ödeme doğrulaması için Google Play ile, e-posta gönderimi için e-posta sağlayıcısıyla gerekli olduğu kadar paylaşılır.</p>
      <p><b>Saklama ve haklar:</b> KVKK ve GDPR kapsamındaki erişim, düzeltme ve silme taleplerin için uygulama içi destekten bize ulaşabilirsin. Hesap silindiğinde kişisel veriler yasal saklama süreleri dışında silinir.</p>
      <p class="muted">Bu metin bir şablondur; yayımlamadan önce kendi şirket bilgilerinle ve bir hukukçu ile gözden geçir.</p></div>`;
    const T = `<h3 class="gold">Kullanım Koşulları</h3><div class="small" style="line-height:1.55">
      <p>SPINOVA 101 OKEY yalnızca eğlence amaçlı bir sosyal casino oyunudur ve <b>18 yaş ve üzeri</b> kullanıcılar içindir.</p>
      <p><b>Gerçek para kumarı yoktur.</b> Oyunda kazanılan veya satın alınan sanal jetonlar hiçbir koşulda nakde, paraya, hediye çekine veya gerçek bir ödüle çevrilemez, hesaplar arasında satılamaz. Sosyal casino oyunlarındaki başarı, gerçek para kumarında başarı anlamına gelmez.</p>
      <p>Satın alınan jetonlar bir lisans niteliğindedir; Google Play iade politikası saklıdır. İade edilen satın alımlara ait jetonlar hesaptan düşülür.</p>
      <p>Hile, otomasyon, açık istismarı veya başka hesapların kötüye kullanımı hesabın askıya alınmasına yol açar.</p>
      <p>Her oyunun teorik geri dönüş oranı (RTP) %95'tir; sonuçlar denetlenebilir RNG ile belirlenir.</p>
      <p class="muted">Bu metin bir şablondur; yayımlamadan önce bir hukukçu ile gözden geçir.</p></div>`;
    modal(which === 'privacy' ? P : T);
  }

  window.Screens = { login, register, enter, refresh, renderTop, renderBadges, setBalance, go, logout, adminLogin, levelRewardsModal, dailyModal, celebrate100, eventsModal, settings, help, state: () => S,
    shop: (b) => (b ? shop(b) : go('shop')), quests: (b) => quests(b), friends: (b) => friends(b), profile: (b) => profile(b) };
})();
