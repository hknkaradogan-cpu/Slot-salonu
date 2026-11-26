/* Sunucu istemcisi: oturum belirteci, zaman aşımı, çevrimdışı algılama ve yeniden deneme */
(function () {
  'use strict';
  const BASE = (window.SLOT_CONFIG && window.SLOT_CONFIG.apiBase) || '';
  let token = null;
  try { token = localStorage.getItem('slot_token'); } catch (e) {}
  const listeners = { offline: [], online: [], unauthorized: [] };
  let offline = false;

  function setOffline(v) {
    if (v === offline) return; offline = v;
    (v ? listeners.offline : listeners.online).forEach(f => f());
  }
  class ApiError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

  async function request(method, path, body, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
    let res;
    try {
      res = await fetch(BASE + path, {
        method, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      clearTimeout(timer); setOffline(true);
      throw new ApiError(0, 'network', 'Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.');
    }
    clearTimeout(timer); setOffline(false);
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && token && !opts.noAuthEvent) listeners.unauthorized.forEach(f => f());
    if (!res.ok) throw new ApiError(res.status, data.error || 'error', data.message || 'Bir hata oluştu.');
    return data;
  }
  /** Ağ hatasında aynı istek anahtarıyla otomatik yeniden dener (spin gibi idempotent işlemler için) */
  async function retrying(method, path, body, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      try { return await request(method, path, body); } catch (e) { last = e; if (e.code !== 'network') throw e; if (i < tries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1))); }
    }
    throw last;
  }
  window.Api = {
    get: (p) => request('GET', p), post: (p, b) => request('POST', p, b || {}), put: (p, b) => request('PUT', p, b || {}),
    retrying, ApiError,
    setToken(t) { token = t; try { t ? localStorage.setItem('slot_token', t) : localStorage.removeItem('slot_token'); } catch (e) {} },
    hasToken: () => !!token, isOffline: () => offline,
    on(ev, f) { listeners[ev].push(f); },
    uuid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); },
  };
})();
