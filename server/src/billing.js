/*
 * Google Play Billing sunucu doğrulaması.
 *  - GooglePlayVerifier: Google Play Developer API (androidpublisher v3) ile
 *    purchases.products.get / consume / voidedpurchases.list çağrıları.
 *    Kimlik doğrulama: servis hesabı JSON anahtarı + RS256 JWT -> OAuth erişim belirteci.
 *  - MockVerifier: geliştirme ve otomatik testler için (BILLING_MODE=mock).
 *    Belirteç biçimi: mock:<purchased|pending|canceled>:<obfuscatedAccountId>:<herhangi>
 * Ortak dönüş: { state: 'purchased'|'pending'|'canceled', orderId, obfuscatedAccountId, quantity }
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const STATE = { 0: 'purchased', 1: 'canceled', 2: 'pending' };

export class GooglePlayVerifier {
  constructor({ packageName, serviceAccount }) {
    this.packageName = packageName;
    this.sa = typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount;
    this.token = null; this.tokenExp = 0;
  }
  async accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && now < this.tokenExp - 60) return this.token;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'RS256', typ: 'JWT' });
    const claim = b64({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
    const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claim}`), this.sa.private_key).toString('base64url');
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
    if (!r.ok) throw new Error('google_oauth_failed ' + r.status);
    const j = await r.json(); this.token = j.access_token; this.tokenExp = now + (j.expires_in || 3600);
    return this.token;
  }
  base() { return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.packageName)}`; }
  async verify(productId, purchaseToken) {
    const t = await this.accessToken();
    const r = await fetch(`${this.base()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`, { headers: { Authorization: `Bearer ${t}` } });
    if (r.status === 404 || r.status === 400) return { state: 'invalid' };
    if (!r.ok) throw new Error('google_verify_failed ' + r.status);
    const j = await r.json();
    return { state: STATE[j.purchaseState] || 'invalid', orderId: j.orderId || null, obfuscatedAccountId: j.obfuscatedExternalAccountId || null, quantity: j.quantity || 1, consumed: j.consumptionState === 1 };
  }
  async consume(productId, purchaseToken) {
    const t = await this.accessToken();
    const r = await fetch(`${this.base()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
    return r.ok;
  }
  async voided(startTimeMs) {
    const t = await this.accessToken();
    const r = await fetch(`${this.base()}/purchases/voidedpurchases?startTime=${startTimeMs}&type=0`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error('google_voided_failed ' + r.status);
    const j = await r.json();
    return (j.voidedPurchases || []).map(v => ({ purchaseToken: v.purchaseToken, orderId: v.orderId }));
  }
}

export class MockVerifier {
  constructor() { this.overrides = new Map(); this.consumedTokens = new Set(); this.voidedList = []; }
  async verify(productId, token) {
    if (this.overrides.has(token)) return this.overrides.get(token);
    const m = /^mock:(purchased|pending|canceled):([^:]*):/.exec(token);
    if (!m) return { state: 'invalid' };
    return { state: m[1], orderId: 'GPA.MOCK-' + crypto.createHash('md5').update(token).digest('hex').slice(0, 12), obfuscatedAccountId: m[2] || null, quantity: 1 };
  }
  async consume(productId, token) { this.consumedTokens.add(token); return true; }
  async voided() { return this.voidedList; }
}

export function createVerifier(cfg) {
  if (cfg.billingMode === 'google') return new GooglePlayVerifier({ packageName: cfg.packageName, serviceAccount: cfg.serviceAccount });
  return new MockVerifier();
}

