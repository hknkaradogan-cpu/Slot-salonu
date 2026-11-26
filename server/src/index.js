'use strict';
const path = require('path');
const fs = require('fs');
const { createApp } = require('./app');

const env = process.env;
const dataDir = env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

let secret = env.APP_SECRET;
if (!secret) {
  const f = path.join(dataDir, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, require('crypto').randomBytes(32).toString('hex'), { mode: 0o600 });
  secret = fs.readFileSync(f, 'utf8').trim();
}

const cfg = {
  dbFile: path.join(dataDir, 'slotsalonu.db'),
  secret,
  publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 8080}`,
  staticDir: env.STATIC_DIR || path.join(__dirname, '..', '..', 'client'),
  corsOrigin: env.CORS_ORIGIN || '*',
  trustProxy: env.TRUST_PROXY === '1',
  tzOffsetMin: Number(env.TZ_OFFSET_MIN || 180),
  billingMode: env.BILLING_MODE || 'mock',
  packageName: env.ANDROID_PACKAGE || 'com.slotsalonu.app',
  serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE,
  rtdnSecret: env.RTDN_SECRET,
  smtpUrl: env.SMTP_URL, mailFrom: env.MAIL_FROM || 'SLOT SALONU <no-reply@slotsalonu.app>',
  admin: { email: env.ADMIN_EMAIL, username: env.ADMIN_USERNAME || 'yonetici', password: env.ADMIN_PASSWORD },
};
if (cfg.billingMode !== 'google') console.warn('[uyarı] BILLING_MODE=mock — gerçek ödeme doğrulaması KAPALI. Canlıda BILLING_MODE=google kullanın.');

const app = createApp(cfg);
const port = Number(env.PORT || 8080);
app.server.listen(port, () => console.log(`SLOT SALONU sunucusu :${port} (${cfg.publicUrl})`));

// İade edilen satın alımları saatlik senkronize et (Google modu)
if (cfg.billingMode === 'google') setInterval(() => app.syncVoided(Date.now() - 3 * 24 * 3600e3).catch(e => console.error('[voided]', e.message)), 3600e3);
// Eski spin yanıtlarını temizle (spin sonucu tohumlardan her zaman yeniden hesaplanabilir)
setInterval(() => app.db.prepare('UPDATE spins SET response=NULL WHERE created_at<? AND response IS NOT NULL').run(Date.now() - 2 * 24 * 3600e3), 3600e3);
process.on('SIGTERM', () => app.close().then(() => process.exit(0)));
