/*
 * RNG katmanı
 *  - FairRng: Denetlenebilir (provably fair) RNG. Her spin sonucu
 *    HMAC-SHA256(serverSeed, clientSeed:nonce:blok) akışından üretilir.
 *    Sunucu tohumunun SHA-256 özeti spinlerden ÖNCE oyuncuya gösterilir;
 *    tohum değiştirildiğinde eski tohum açıklanır ve oyuncu her spini
 *    tools/verify-spin.js ile yeniden hesaplayabilir.
 *  - FastRng: Sadece simülasyon için hızlı xoshiro128** üreteci.
 * Oyun sonucu YALNIZCA bu akıştan belirlenir; oyuncu geçmişi, bakiye veya
 * başka bir durum kazanma olasılığını etkilemez.
 */
import crypto from 'node:crypto';

export class FairRng {
  constructor(serverSeed, clientSeed, nonce) {
    this.serverSeed = serverSeed;
    this.clientSeed = clientSeed;
    this.nonce = nonce;
    this.block = 0;
    this.buf = null;
    this.pos = 8;
    this.count = 0;
  }
  _refill() {
    const h = crypto.createHmac('sha256', this.serverSeed);
    h.update(`${this.clientSeed}:${this.nonce}:${this.block++}`);
    this.buf = h.digest();
    this.pos = 0;
  }
  /** [0,1) aralığında 32 bit çözünürlüklü sayı */
  next() {
    if (this.pos >= 8) this._refill();
    const v = this.buf.readUInt32BE(this.pos * 4);
    this.pos++;
    this.count++;
    return v / 4294967296;
  }
}

export class FastRng {
  constructor(seed) {
    const b = crypto.createHash('sha256').update(String(seed)).digest();
    this.a = b.readUInt32LE(0) | 0; this.b = b.readUInt32LE(4) | 0;
    this.c = b.readUInt32LE(8) | 0; this.d = b.readUInt32LE(12) | 0;
    if (!(this.a | this.b | this.c | this.d)) this.a = 1;
  }
  next() {
    const r = Math.imul(rotl(Math.imul(this.b, 5), 7), 9);
    const t = this.b << 9;
    this.c ^= this.a; this.d ^= this.b; this.b ^= this.c; this.a ^= this.d;
    this.c ^= t; this.d = rotl(this.d, 11);
    return (r >>> 0) / 4294967296;
  }
}
function rotl(x, k) { return (x << k) | (x >>> (32 - k)); }

export function newServerSeed() { return crypto.randomBytes(32).toString('hex'); }
export function hashSeed(seed) { return crypto.createHash('sha256').update(seed).digest('hex'); }

