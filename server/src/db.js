// Veritabanı bağdaştırıcıları. Ortak arayüz:
//   db.q(sql, params) -> satır dizisi        db.tx(async (q) => ...) -> tek transaction
// - Postgres (Supabase / kendi sunucunuz): postgres.js
// - PGlite: tek dosyalık gömülü Postgres (kurulum gerektirmeyen küçük kurulumlar ve testler)
const INT8 = 20;

export async function createPgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir || undefined, { parsers: { [INT8]: (v) => Number(v) } });
  await pg.waitReady;
  let chain = Promise.resolve(); // PGlite tek bağlantı: transaction'ları sıraya al
  return {
    kind: 'pglite',
    async q(text, params = []) { return (await pg.query(text, params)).rows; },
    tx(fn) {
      const run = chain.then(() => pg.transaction(async (t) => fn(async (text, params = []) => (await t.query(text, params)).rows)));
      chain = run.catch(() => {});
      return run;
    },
    async exec(sql) { await pg.exec(sql); },
    async close() { await pg.close(); },
  };
}

export async function createPostgresDb(url, postgresLib) {
  const postgres = postgresLib || (await import('postgres')).default;
  const sql = postgres(url, {
    max: 3, prepare: false, idle_timeout: 20,
    types: { bigint: { to: INT8, from: [INT8], parse: (x) => Number(x), serialize: (x) => String(x) } },
  });
  const wrap = (s) => async (text, params = []) => Array.from(await s.unsafe(text, params));
  return {
    kind: 'postgres',
    q: wrap(sql),
    tx: (fn) => sql.begin((t) => fn(wrap(t))),
    async exec(text) { await sql.unsafe(text); },
    async close() { await sql.end({ timeout: 2 }); },
  };
}
