// Supabase'de çalışan asıl sunucu kodu. CI (GitHub Actions) bunu tek dosya olarak paketleyip
// başlatıcı fonksiyona (bootstrap.ts) yükler; başlatıcı her soğuk başlangıçta bu paketi yükler.
import { createApi } from '../src/api.js';
import { createPostgresDb } from '../src/db.js';
import CAL from './calibration.gen.js';

export async function start(d) {
  const db = await createPostgresDb(d.env('SUPABASE_DB_URL'), d.postgres);
  const conf = {};
  for (const r of await db.q('SELECT key, value FROM slot.server_config')) conf[r.key] = r.value;
  const get = (k) => d.env(k) || conf[k] || '';
  return createApi({
    db, skipSchema: true, calibration: CAL, secret: get('APP_SECRET'),
    tzOffsetMin: Number(get('TZ_OFFSET_MIN') || 180), billingMode: get('BILLING_MODE') || 'mock', packageName: get('ANDROID_PACKAGE') || 'com.slotsalonu.app',
    serviceAccount: get('GOOGLE_SERVICE_ACCOUNT_JSON') || undefined, rtdnSecret: get('RTDN_SECRET') || undefined,
    resendKey: get('RESEND_API_KEY') || undefined, mailFrom: get('MAIL_FROM') || 'SLOT SALONU <onboarding@resend.dev>', brandName: get('BRAND_NAME') || 'SLOT SALONU',
    setupTokenHash: conf.SETUP_TOKEN_SHA256 || undefined,
    signing: get('SIGNING_KEYSTORE_B64') ? { keystore: get('SIGNING_KEYSTORE_B64'), storePassword: get('SIGNING_STORE_PASSWORD'), keyAlias: get('SIGNING_KEY_ALIAS'), keyPassword: get('SIGNING_KEY_PASSWORD') } : null,
    verifyCiToken: (t) => d.verifyCi(t),
    storeApk: async (bytes, name) => {
      const r = await fetch(`${d.SB_URL}/storage/v1/object/slot-updates/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${d.SB_KEY}`, 'Content-Type': 'application/vnd.android.package-archive', 'x-upsert': 'true' }, body: bytes });
      if (!r.ok) throw new Error('storage ' + r.status + ' ' + (await r.text()));
      return `${d.SB_URL}/storage/v1/object/public/slot-updates/${name}`;
    },
  });
}
