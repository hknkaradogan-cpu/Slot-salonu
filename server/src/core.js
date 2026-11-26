'use strict';
/* Şifreleme, oturum, seviye/XP, günlük ödül ve cüzdan (jeton defteri) yardımcıları */
const crypto = require('crypto');
const { err } = require('./http');

/* ---------- şifreler (scrypt) ---------- */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(h, expected);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(n = 8) { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += CODE_ALPHA[b[i] % 32]; return s; }

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const USER_RE = /^[A-Za-z0-9_]{3,16}$/;
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) throw err(400, 'weak_password', 'Şifre en az 8 karakter olmalı.');
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) || !/\d/.test(pw)) throw err(400, 'weak_password', 'Şifre en az bir harf ve bir rakam içermeli.');
}

/* ---------- seviye / XP ---------- */
const MAX_LEVEL = 100;
// L seviyesine ulaşmak için gereken toplam XP: 1→2: 500, sonra her seviyede +100
const cumXp = (L) => 500 * (L - 1) + 50 * (L - 1) * (L - 2);
const XP_MAX = cumXp(MAX_LEVEL);
function levelFromXp(xp) {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cumXp(mid) <= xp) lo = mid; else hi = mid - 1; }
  return lo;
}
function levelInfo(xp) {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, xp, into: 0, need: 0, max: true };
  return { level, xp, into: xp - cumXp(level), need: cumXp(level + 1) - cumXp(level), max: false };
}

/* ---------- günlük ödül ---------- */
function dailyAmount(level, anchors) {
  const a = anchors.slice().sort((x, y) => x[0] - y[0]);
  if (level <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (level <= a[i][0]) {
      const [l0, c0] = a[i - 1], [l1, c1] = a[i];
      return Math.round((c0 + (c1 - c0) * (level - l0) / (l1 - l0)) / 10) * 10;
    }
  }
  return a[a.length - 1][1];
}
const DAY_MS = 24 * 3600 * 1000;

/* ---------- cüzdan ----------
 * Tüm bakiye değişiklikleri buradan ve bir transaction içinde geçer.
 * unlimited=1 olan (yalnızca sunucuda tanımlanan) yönetici hesabında
 * bakiye düşülmez; işlem yine deftere yazılır. */
function applyCoins(db, user, delta, type, ref, now, opts = {}) {
  delta = Math.trunc(delta);
  if (!Number.isSafeInteger(delta)) throw err(400, 'bad_amount');
  const u = db.prepare('SELECT id, balance, unlimited FROM users WHERE id=?').get(user.id ?? user);
  if (!u) throw err(404, 'user_not_found');
  let next = u.balance + delta;
  if (u.unlimited && delta < 0) next = u.balance;
  if (next < 0) {
    if (opts.clamp) next = 0; else throw err(402, 'insufficient_funds', 'Yetersiz jeton.');
  }
  db.prepare('UPDATE users SET balance=? WHERE id=?').run(next, u.id);
  db.prepare('INSERT INTO ledger(user_id,delta,balance_after,type,ref,created_at) VALUES(?,?,?,?,?,?)').run(u.id, next - u.balance === 0 && u.unlimited ? delta : next - u.balance, next, type, ref == null ? null : String(ref), now);
  return { balance: next, applied: next - u.balance };
}

function dayKey(now, tzOffsetMin) {
  return new Date(now + tzOffsetMin * 60000).toISOString().slice(0, 10);
}

module.exports = { hashPassword, verifyPassword, sha256, randomToken, randomCode, EMAIL_RE, USER_RE, checkPassword, cumXp, XP_MAX, MAX_LEVEL, levelFromXp, levelInfo, dailyAmount, DAY_MS, applyCoins, dayKey };
