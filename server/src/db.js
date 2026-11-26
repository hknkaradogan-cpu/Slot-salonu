'use strict';
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  unlimited INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  wager_rem INTEGER NOT NULL DEFAULT 0,
  total_wagered INTEGER NOT NULL DEFAULT 0,
  total_won INTEGER NOT NULL DEFAULT 0,
  spins INTEGER NOT NULL DEFAULT 0,
  biggest_win INTEGER NOT NULL DEFAULT 0,
  last_daily_at INTEGER,
  starter_bought INTEGER NOT NULL DEFAULT 0,
  refund_debt INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  avatar INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL, balance_after INTEGER NOT NULL,
  type TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id);
CREATE TABLE IF NOT EXISTS seeds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL, server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL, nonce INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS revealed_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  server_seed TEXT NOT NULL, server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL, last_nonce INTEGER NOT NULL, revealed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL, bet INTEGER NOT NULL, win INTEGER NOT NULL,
  client_key TEXT NOT NULL, server_seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL,
  response TEXT, created_at INTEGER NOT NULL,
  UNIQUE(user_id, client_key)
);
CREATE INDEX IF NOT EXISTS spins_game ON spins(game);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS level_rewards (level INTEGER PRIMARY KEY, coins INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS level_claims (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, level INTEGER NOT NULL,
  coins INTEGER NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY(user_id, level)
);
CREATE TABLE IF NOT EXISTS packages (
  product_id TEXT PRIMARY KEY, name TEXT NOT NULL, coins INTEGER NOT NULL,
  price_label TEXT NOT NULL, bonus_label TEXT, one_time INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL, purchase_token TEXT NOT NULL UNIQUE, order_id TEXT,
  state TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 0, credited INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  amount INTEGER NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER
);
CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL,
  target INTEGER NOT NULL, reward INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quest_progress (
  user_id INTEGER NOT NULL, quest_id INTEGER NOT NULL, day TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0, meta TEXT, claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, quest_id, day)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, xp_mult INTEGER NOT NULL DEFAULT 1,
  bonus_coins INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS event_claims (user_id INTEGER NOT NULL, event_id INTEGER NOT NULL, claimed_at INTEGER NOT NULL, PRIMARY KEY(user_id, event_id));
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'acik', reply TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, action TEXT NOT NULL,
  target_user INTEGER, details TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
`;

const DEFAULTS = {
  settings: {
    starting_coins: 50000,
    daily_anchors: [[1, 500], [10, 1000], [20, 2000], [30, 3000], [40, 4000], [50, 5000], [60, 6000], [70, 7000], [80, 8000], [90, 9000], [100, 10000]],
    gift_amounts: [1000, 5000, 10000],
    gift_daily_limit: 5,
  },
  levelRewards: [[10, 10000], [20, 20000], [30, 30000], [40, 40000], [50, 50000], [60, 60000], [70, 70000], [80, 80000], [90, 90000], [100, 100000]],
  packages: [ // tasarım referansındaki mağaza ekranıyla aynı paketler
    ['coins_starter', 'Başlangıç Paketi', 500000, '₺49,99', 'Tek seferlik', 1, 1],
    ['coins_small', 'Küçük Paket', 1000000, '₺79,99', null, 0, 2],
    ['coins_medium', 'Orta Paket', 2000000, '₺149,99', null, 0, 3],
    ['coins_large', 'Büyük Paket', 5000000, '₺299,99', '+%25 değer', 0, 4],
    ['coins_mega', 'Mega Paket', 10000000, '₺499,99', '+%50 değer', 0, 5],
    ['coins_vip', 'VIP Paket', 20000000, '₺799,99', 'En iyi değer', 0, 6],
  ],
  quests: [
    ['50 spin yap', 'spins', 50, 2500], ['500.000 jeton bahis yap', 'wager', 500000, 5000],
    ['Bahsinin 20 katı kazan', 'bigwin', 1, 4000], ['3 farklı oyun oyna', 'games', 3, 3000],
  ],
};

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const has = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c > 0;
  for (const [k, v] of Object.entries(DEFAULTS.settings)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, JSON.stringify(v));
  if (!has('level_rewards')) for (const [l, c] of DEFAULTS.levelRewards) db.prepare('INSERT INTO level_rewards VALUES(?,?)').run(l, c);
  if (!has('packages')) for (const p of DEFAULTS.packages) db.prepare('INSERT INTO packages(product_id,name,coins,price_label,bonus_label,one_time,sort) VALUES(?,?,?,?,?,?,?)').run(...p);
  if (!has('quests')) for (const q of DEFAULTS.quests) db.prepare('INSERT INTO quests(title,type,target,reward) VALUES(?,?,?,?)').run(...q);

  db.tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  db.setting = (k) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? JSON.parse(r.value) : null; };
  db.setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));
  return db;
}

module.exports = { openDb };
