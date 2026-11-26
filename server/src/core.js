// Şifreleme, seviye/XP (1.000.000 seviye), ödül hesapları — ES modülü (Node + Deno)
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }
export const err = (status, code, message) => new HttpError(status, code, message);

/* ---------- şifreler (scrypt, rastgele tuz, sabit zamanlı karşılaştırma) ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(h, expected);
}
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(n = 8) { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += CODE_ALPHA[b[i] % 32]; return s; }
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
export function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) throw err(400, 'weak_password', 'Şifre en az 8 karakter olmalı.');
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) || !/\d/.test(pw)) throw err(400, 'weak_password', 'Şifre en az bir harf ve bir rakam içermeli.');
}

/* ---------- SEVİYE / XP ----------
 * Maksimum seviye 1.000.000. L seviyesinden L+1'e geçmek için gereken XP:
 *     need(L) = 50 + 10·L + L²/50
 *   Sv1: 60 · Sv10: 152 · Sv100: 1.250 · Sv1.000: 30.050 · Sv100.000: 201 milyon · Sv1.000.000: ~20 milyar
 * Toplam XP kapalı formülle (BigInt ile taşma olmadan) hesaplanır; Sv1.000.000 için ~6,7·10^15 XP (JS ve
 * PostgreSQL bigint sınırlarının altında).
 * Hızlı seviye atlamayı önlemek için tek spinde kazanılabilecek XP, o seviyenin ihtiyacının 1/25'i ile sınırlıdır:
 * yani bahis ne kadar büyük olursa olsun bir seviye en az ~25 spin sürer. */
export const MAX_LEVEL = 1000000;
export const XP_PER_COINS = 100;
export const MIN_SPINS_PER_LEVEL = 25;
export function needXp(L) { return Math.floor(50 + 10 * L + (L * L) / 50); }
export function cumXp(L) { // L seviyesine ulaşmak için gereken toplam XP
  if (L <= 1) return 0;
  const n = BigInt(L - 1), l = BigInt(L);
  const exact300 = 300n * 50n * n + 300n * 5n * n * l + n * l * (2n * l - 1n); // 300 ile çarpılmış tam değer
  return Number(exact300 / 300n);
}
export const XP_MAX = cumXp(MAX_LEVEL);
export function levelFromXp(xp) {
  xp = Number(xp);
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const mid = Math.floor((lo + hi + 1) / 2); if (cumXp(mid) <= xp) lo = mid; else hi = mid - 1; }
  return lo;
}
export function levelInfo(xp) {
  xp = Number(xp); const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, xp, into: 0, need: 0, max: true };
  const base = cumXp(level);
  return { level, xp, into: xp - base, need: cumXp(level + 1) - base, max: false };
}
export function maxXpPerSpin(level) { return Math.max(1, Math.ceil(needXp(level) / MIN_SPINS_PER_LEVEL)); }

/* ---------- seviye ödülleri (1.000.000 seviyeye ölçeklenir) ----------
 * Her `every` seviyede bir ödül: seviye × perLevel jeton (Sv10: 10.000 … Sv100: 100.000 … Sv1.000.000: 1 milyar)
 * + isteğe bağlı özel ödüller. Toplu alma aritmetik seri formülüyle hesaplanır (taşma yok). */
export function levelRewardRange(fromExclusive, toInclusive, cfg) {
  const every = cfg.every, per = cfg.perLevel;
  const i0 = Math.floor(fromExclusive / every) + 1, i1 = Math.floor(toInclusive / every);
  if (i1 < i0) return { coins: 0, count: 0, upto: fromExclusive };
  const sumI = (BigInt(i0 + i1) * BigInt(i1 - i0 + 1)) / 2n;
  let coins = BigInt(per) * BigInt(every) * sumI;
  for (const [lv, c] of Object.entries(cfg.special || {})) { const L = +lv; if (L > fromExclusive && L <= toInclusive) coins += BigInt(c); }
  const c = Number(coins);
  if (!Number.isSafeInteger(c)) throw err(400, 'overflow', 'Ödül hesabı sınırı aştı.');
  return { coins: c, count: i1 - i0 + 1, upto: i1 * every };
}
export function levelRewardAt(L, cfg) { return L % cfg.every === 0 ? L * cfg.perLevel + Number((cfg.special || {})[L] || 0) : 0; }

/* ---------- günlük ödül ---------- */
export function dailyAmount(level, anchors, perLevelAfter = 10, max = 1000000) {
  const a = anchors.slice().sort((x, y) => x[0] - y[0]);
  if (level <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (level <= a[i][0]) { const [l0, c0] = a[i - 1], [l1, c1] = a[i]; return Math.round((c0 + (c1 - c0) * (level - l0) / (l1 - l0)) / 10) * 10; }
  }
  const [lL, lC] = a[a.length - 1];
  return Math.min(max, lC + (level - lL) * perLevelAfter);
}
export const DAY_MS = 24 * 3600 * 1000;
export function dayKey(now, tzOffsetMin) { return new Date(now + tzOffsetMin * 60000).toISOString().slice(0, 10); }
