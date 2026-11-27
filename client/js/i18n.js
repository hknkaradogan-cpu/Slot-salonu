/* SPINOVA — ÇOK DİLLİ ARAYÜZ (5.0.26)
 * Kaynak dil Türkçedir. Uygulama, telefonun saat dilimine göre ÜLKEYİ bulur ve o ülkenin dilinde açılır
 * (Türkiye → Türkçe, ABD → English, Almanya → Deutsch …); saat dilimi bilinmiyorsa telefon dili kullanılır.
 * Oyuncu Ayarlar'dan dili değiştirebilir; seçimi kalıcıdır. Konum izni gerekmez.
 * Çeviri, ekrana yazılan metinlerde yapılır: her metin " · " ve satır sonlarından parçalara ayrılır, sayılar {n}
 * kalıbına çevrilip sözlükte aranır, bulunursa sayılar yerine geri konur. Sözlükte olmayan metin Türkçe kalmaz:
 * önce İngilizce karşılığa, o da yoksa özgün metne düşer. */
(function () {
  'use strict';
  const LANGS = {
    tr: { name: 'Türkçe' }, en: { name: 'English' }, de: { name: 'Deutsch' }, fr: { name: 'Français' }, es: { name: 'Español' },
    pt: { name: 'Português' }, ru: { name: 'Русский' }, ar: { name: 'العربية', rtl: true }, az: { name: 'Azərbaycanca' }, fa: { name: 'فارسی', rtl: true },
  };
  // Ülke → dil
  const C2L = { TR: 'tr', CY: 'tr', AZ: 'az', DE: 'de', AT: 'de', CH: 'de', LI: 'de', FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', CM: 'fr', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es',
    PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt', RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', TJ: 'ru', UZ: 'ru', TM: 'ru', MD: 'ru',
    SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', JO: 'ar', KW: 'ar', QA: 'ar', OM: 'ar', BH: 'ar', LB: 'ar', SY: 'ar', YE: 'ar', LY: 'ar', DZ: 'ar', MA: 'ar', TN: 'ar', SD: 'ar', PS: 'ar', IR: 'fa', AF: 'fa' };
  // Saat dilimi → ülke (yaygın bölgeler; listede olmayan Amerika/Avrupa/Asya bölgeleri İngilizceye düşer)
  const TZ = {
    'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Asia/Famagusta': 'CY', 'Asia/Baku': 'AZ',
    'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Vaduz': 'LI',
    'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Monaco': 'MC', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Douala': 'CM',
    'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Cancun': 'MX', 'America/Merida': 'MX', 'America/Tijuana': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX', 'America/Mazatlan': 'MX',
    'America/Argentina/Buenos_Aires': 'AR', 'America/Buenos_Aires': 'AR', 'America/Argentina/Cordoba': 'AR', 'America/Argentina/Mendoza': 'AR', 'America/Bogota': 'CO', 'America/Santiago': 'CL', 'America/Lima': 'PE', 'America/Caracas': 'VE', 'America/Guayaquil': 'EC',
    'America/Guatemala': 'GT', 'America/Havana': 'CU', 'America/La_Paz': 'BO', 'America/Santo_Domingo': 'DO', 'America/Tegucigalpa': 'HN', 'America/Asuncion': 'PY', 'America/El_Salvador': 'SV', 'America/Managua': 'NI', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA', 'America/Montevideo': 'UY', 'America/Puerto_Rico': 'PR',
    'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT', 'Atlantic/Madeira': 'PT', 'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Manaus': 'BR', 'America/Belem': 'BR', 'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR', 'America/Rio_Branco': 'BR', 'America/Maceio': 'BR', 'America/Araguaina': 'BR', 'America/Boa_Vista': 'BR', 'America/Noronha': 'BR', 'America/Santarem': 'BR',
    'Africa/Luanda': 'AO', 'Africa/Maputo': 'MZ',
    'Europe/Moscow': 'RU', 'Europe/Kaliningrad': 'RU', 'Europe/Samara': 'RU', 'Europe/Volgograd': 'RU', 'Europe/Saratov': 'RU', 'Europe/Ulyanovsk': 'RU', 'Europe/Astrakhan': 'RU', 'Europe/Kirov': 'RU', 'Asia/Yekaterinburg': 'RU', 'Asia/Omsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Barnaul': 'RU', 'Asia/Tomsk': 'RU', 'Asia/Novokuznetsk': 'RU', 'Asia/Krasnoyarsk': 'RU', 'Asia/Irkutsk': 'RU', 'Asia/Chita': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Khandyga': 'RU', 'Asia/Vladivostok': 'RU', 'Asia/Ust-Nera': 'RU', 'Asia/Magadan': 'RU', 'Asia/Sakhalin': 'RU', 'Asia/Srednekolymsk': 'RU', 'Asia/Kamchatka': 'RU', 'Asia/Anadyr': 'RU',
    'Europe/Minsk': 'BY', 'Asia/Almaty': 'KZ', 'Asia/Qostanay': 'KZ', 'Asia/Aqtobe': 'KZ', 'Asia/Aqtau': 'KZ', 'Asia/Atyrau': 'KZ', 'Asia/Oral': 'KZ', 'Asia/Qyzylorda': 'KZ', 'Asia/Bishkek': 'KG', 'Asia/Dushanbe': 'TJ', 'Asia/Tashkent': 'UZ', 'Asia/Samarkand': 'UZ', 'Asia/Ashgabat': 'TM', 'Europe/Chisinau': 'MD',
    'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Africa/Cairo': 'EG', 'Asia/Baghdad': 'IQ', 'Asia/Amman': 'JO', 'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA', 'Asia/Muscat': 'OM', 'Asia/Bahrain': 'BH', 'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY', 'Asia/Aden': 'YE', 'Africa/Tripoli': 'LY', 'Africa/Algiers': 'DZ', 'Africa/Casablanca': 'MA', 'Africa/El_Aaiun': 'MA', 'Africa/Tunis': 'TN', 'Africa/Khartoum': 'SD', 'Asia/Gaza': 'PS', 'Asia/Hebron': 'PS',
    'Asia/Tehran': 'IR', 'Asia/Kabul': 'AF',
  };
  const DICT = { tr: {} };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  function detect() {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* */ }
    const c = TZ[tz]; if (c && C2L[c]) return C2L[c];
    // Saat dilimi biliniyor ama 10 dilden birinin ülkesi değilse (ABD, İngiltere, Japonya…) uygulama İngilizce açılır.
    if (tz && !/^(Etc\/|UTC$|GMT$)/.test(tz)) return 'en';
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    const m = /^([a-z]{2})(?:[-_]([A-Z]{2}))?/i.exec(nav) || [];
    if (m[2] && C2L[m[2].toUpperCase()]) return C2L[m[2].toUpperCase()];
    if (m[1] && LANGS[m[1].toLowerCase()]) return m[1].toLowerCase();
    return 'en';
  }
  let lang = ls('app_lang') || detect(); if (!LANGS[lang]) lang = 'en';
  const NUM = /[+\-−]?\d[\d.,:]*/g;
  const EDGE = /^([\s:·—\-–,.!?()［\[\]]*)([\s\S]*?)([\s:·—\-–,.!?()\]]*)$/;
  function lookup(core) {
    const nums = []; const key = core.replace(NUM, (x) => { nums.push(x); return '{n}'; });
    const d = DICT[lang] || {}, en = DICT.en || {};
    let v = d[key]; if (v == null && lang !== 'tr') v = en[key];
    if (v == null) return null;
    let i = 0; return v.replace(/\{n\}/g, () => (nums[i++] ?? ''));
  }
  function translate(str) {
    if (lang === 'tr' || !str || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(str)) return str;
    const whole = lookup(str.trim()); if (whole != null) return str.replace(str.trim(), whole);
    return str.split(/(\s+·\s+|\n)/).map((part, i) => {
      if (i % 2 === 1) return part;
      const m = EDGE.exec(part); if (!m || !m[2]) return part;
      const t = lookup(m[2]); return t == null ? part : m[1] + t + m[3];
    }).join('');
  }
  /* ---------- DOM çevirisi ---------- */
  const ORIG = new WeakMap(), DONE = new WeakMap();
  const SKIP = 'SCRIPT,STYLE,TEXTAREA,INPUT,CODE';
  function doText(n) {
    const p = n.parentElement; if (!p || SKIP.includes(p.tagName) || p.closest('[data-noi18n],.no-i18n')) return;
    const cur = n.nodeValue; if (DONE.get(n) === cur) return;
    const src = (ORIG.has(n) && DONE.get(n) !== cur) ? cur : (ORIG.get(n) ?? cur);
    ORIG.set(n, src); const out = translate(src); DONE.set(n, out); if (out !== cur) n.nodeValue = out;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function doAttrs(el) { for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (!v) continue; const key = '__i18n_' + a; if (el[key] === v) continue; const src = el[key + '_src'] && el[key] !== v ? v : (el[key + '_src'] || v); el[key + '_src'] = src; const o = translate(src); el[key] = o; if (o !== v) el.setAttribute(a, o); } }
  function walk(root) {
    if (!root) return; if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP.includes(root.tagName)) return; doAttrs(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let obs = null;
  function start() {
    if (obs) obs.disconnect(); if (lang === 'tr') return;
    walk(document.body);
    obs = new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') doText(m.target); else if (m.type === 'attributes') doAttrs(m.target); else m.addedNodes.forEach(walk); } });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function applyDir() {
    const L = LANGS[lang] || {}; document.documentElement.lang = lang;
    // Oyun ekranları soldan sağa tasarlandığı için yerleşim aynı kalır; Arapça/Farsça metin kendi içinde sağdan sola akar.
    document.documentElement.classList.toggle('rtl-text', !!L.rtl);
  }
  function setLang(code, reload) {
    if (!LANGS[code]) return; ls('app_lang', code); lang = code; applyDir();
    if (reload !== false) location.reload();
  }
  function add(code, dict) { DICT[code] = Object.assign(DICT[code] || {}, dict); }
  // Ekrana yazılmadan gösterilen metinler (toast, alert, onay) için
  const t = (s) => translate(String(s));
  applyDir();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.I18N = { LANGS, lang: () => lang, setLang, add, t, detect, start, country: () => { try { return TZ[Intl.DateTimeFormat().resolvedOptions().timeZone] || null; } catch (e) { return null; } } };
})();
