// Node.js sunucusu: kendi sunucunuzda / VPS'te çalıştırmak için.
// DATABASE_URL verilirse PostgreSQL, verilmezse DATA_DIR altında gömülü PGlite kullanılır.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { createPgliteDb, createPostgresDb } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive' };

export async function startNodeServer(opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  const dataDir = env.DATA_DIR || path.join(here, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  let secret = env.APP_SECRET;
  if (!secret) { const f = path.join(dataDir, '.secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 }); secret = fs.readFileSync(f, 'utf8').trim(); }
  const db = opts.db || (env.DATABASE_URL ? await createPostgresDb(env.DATABASE_URL) : await createPgliteDb(path.join(dataDir, 'pg')));
  const calibration = JSON.parse(fs.readFileSync(path.join(here, 'games', 'calibration.json'), 'utf8'));
  const staticDir = env.STATIC_DIR || path.join(here, '..', '..', 'client');
  const apkDir = path.join(dataDir, 'apk');
  const api = await createApi({
    db, secret, calibration, clock: opts.clock, verifier: opts.verifier, logger: opts.logger,
    publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 8080}`,
    corsOrigin: env.CORS_ORIGIN || '*', tzOffsetMin: Number(env.TZ_OFFSET_MIN || 180),
    billingMode: env.BILLING_MODE || 'mock', packageName: env.ANDROID_PACKAGE || 'com.slotsalonu.app',
    serviceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SERVICE_ACCOUNT_FILE && fs.readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8')),
    rtdnSecret: env.RTDN_SECRET, resendKey: env.RESEND_API_KEY, mailFrom: env.MAIL_FROM || 'SLOT SALONU <no-reply@slotsalonu.app>',
    brandName: env.BRAND_NAME, setupToken: env.SETUP_TOKEN, quiet: opts.quiet, allowDevMail: opts.allowDevMail,
    admin: { email: env.ADMIN_EMAIL, username: env.ADMIN_USERNAME || 'yonetici', password: env.ADMIN_PASSWORD },
    limitOverrides: opts.limitOverrides,
    storeApk: async (bytes, name) => { fs.mkdirSync(apkDir, { recursive: true }); fs.writeFileSync(path.join(apkDir, name), bytes); return `${env.PUBLIC_URL || ''}/apk/${name}`; },
  });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
        const base = p.startsWith('/apk/') ? apkDir : staticDir; if (p.startsWith('/apk/')) p = p.slice(4);
        const file = path.normalize(path.join(base, p));
        if (file.startsWith(path.normalize(base)) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
          return fs.createReadStream(file).pipe(res);
        }
        res.writeHead(404); return res.end('Not found');
      }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
      const ip = (env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
      const out = await api.handle(request, ip);
      res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) { try { res.writeHead(500); res.end(); } catch {} }
  });
  return { server, api, db, close: () => new Promise(r => server.close(async () => { await db.close(); r(); })) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await startNodeServer();
  const port = Number(process.env.PORT || 8080);
  s.server.listen(port, () => console.log(`SLOT SALONU sunucusu :${port} (${s.db.kind})`));
  process.on('SIGTERM', () => s.close().then(() => process.exit(0)));
}
