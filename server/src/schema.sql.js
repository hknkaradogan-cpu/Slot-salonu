// Otomatik: src/schema.sql içeriği (Deno/Supabase'de dosya okumadan kullanmak için)
export default `-- SLOT SALONU veritabanı şeması (PostgreSQL). Tüm tablolar "slot" şemasındadır.
-- Her müşteri (marka) kendi veritabanını/projesini kullanır; böylece oyuncu verileri birbirinden tamamen ayrıdır.
CREATE SCHEMA IF NOT EXISTS slot;

CREATE TABLE IF NOT EXISTS slot.users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  xp BIGINT NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  wager_rem BIGINT NOT NULL DEFAULT 0,
  total_wagered BIGINT NOT NULL DEFAULT 0,
  total_won BIGINT NOT NULL DEFAULT 0,
  spins BIGINT NOT NULL DEFAULT 0,
  biggest_win BIGINT NOT NULL DEFAULT 0,
  last_daily_at BIGINT,
  reward_claimed_upto INTEGER NOT NULL DEFAULT 0,
  starter_bought BOOLEAN NOT NULL DEFAULT FALSE,
  refund_debt BIGINT NOT NULL DEFAULT 0,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  avatar INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_u ON slot.users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_u ON slot.users (lower(username));

CREATE TABLE IF NOT EXISTS slot.sessions (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, admin BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON slot.sessions(user_id);
CREATE TABLE IF NOT EXISTS slot.tokens (token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, type TEXT NOT NULL, expires_at BIGINT NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE IF NOT EXISTS slot.ledger (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, delta BIGINT NOT NULL, balance_after BIGINT NOT NULL, type TEXT NOT NULL, ref TEXT, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_user ON slot.ledger(user_id, id);
CREATE TABLE IF NOT EXISTS slot.seeds (user_id BIGINT PRIMARY KEY REFERENCES slot.users(id) ON DELETE CASCADE, server_seed TEXT NOT NULL, server_seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS slot.revealed_seeds (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, server_seed TEXT NOT NULL, server_seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, last_nonce BIGINT NOT NULL, revealed_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.spins (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, game TEXT NOT NULL, bet BIGINT NOT NULL, win BIGINT NOT NULL, client_key TEXT NOT NULL, server_seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce BIGINT NOT NULL, rtp NUMERIC(6,4), response TEXT, created_at BIGINT NOT NULL, UNIQUE(user_id, client_key));
CREATE INDEX IF NOT EXISTS spins_game ON slot.spins(game);
CREATE INDEX IF NOT EXISTS spins_user ON slot.spins(user_id, id);
CREATE TABLE IF NOT EXISTS slot.settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.games_config (game TEXT PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT TRUE, rtp NUMERIC(6,4) NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.rtp_history (id BIGSERIAL PRIMARY KEY, game TEXT NOT NULL, old_rtp NUMERIC(6,4), new_rtp NUMERIC(6,4) NOT NULL, admin_id BIGINT, note TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.packages (product_id TEXT PRIMARY KEY, name TEXT NOT NULL, coins BIGINT NOT NULL, price_label TEXT NOT NULL, bonus_label TEXT, one_time BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS slot.purchases (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id), product_id TEXT NOT NULL, purchase_token TEXT NOT NULL UNIQUE, order_id TEXT, state TEXT NOT NULL, coins BIGINT NOT NULL DEFAULT 0, credited BOOLEAN NOT NULL DEFAULT FALSE, consumed BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.friends (user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, friend_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, status TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(user_id, friend_id));
CREATE TABLE IF NOT EXISTS slot.gifts (id BIGSERIAL PRIMARY KEY, from_id BIGINT NOT NULL, to_id BIGINT NOT NULL, amount BIGINT NOT NULL, created_at BIGINT NOT NULL, claimed_at BIGINT);
CREATE TABLE IF NOT EXISTS slot.quests (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, target BIGINT NOT NULL, reward BIGINT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS slot.quest_progress (user_id BIGINT NOT NULL, quest_id BIGINT NOT NULL, day TEXT NOT NULL, progress BIGINT NOT NULL DEFAULT 0, meta TEXT, claimed BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(user_id, quest_id, day));
CREATE TABLE IF NOT EXISTS slot.events (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at BIGINT NOT NULL, ends_at BIGINT NOT NULL, xp_mult INTEGER NOT NULL DEFAULT 1, bonus_coins BIGINT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS slot.event_claims (user_id BIGINT NOT NULL, event_id BIGINT NOT NULL, claimed_at BIGINT NOT NULL, PRIMARY KEY(user_id, event_id));
CREATE TABLE IF NOT EXISTS slot.tickets (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'acik', reply TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.audit (id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL, action TEXT NOT NULL, target_user BIGINT, details TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.outbox (id BIGSERIAL PRIMARY KEY, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, sent BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.app_versions (id BIGSERIAL PRIMARY KEY, version_code INTEGER NOT NULL, version_name TEXT NOT NULL, apk_url TEXT NOT NULL, notes TEXT, mandatory BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.api_metrics (day TEXT NOT NULL, route TEXT NOT NULL, count BIGINT NOT NULL DEFAULT 0, total_ms BIGINT NOT NULL DEFAULT 0, max_ms BIGINT NOT NULL DEFAULT 0, errors BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(day, route));
CREATE TABLE IF NOT EXISTS slot.client_perf (id BIGSERIAL PRIMARY KEY, user_id BIGINT, game TEXT, fps NUMERIC(6,2), worst_ms INTEGER, device TEXT, app_version TEXT, created_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS slot.server_config (key TEXT PRIMARY KEY, value TEXT NOT NULL); -- gizli sunucu ayarları (yalnızca sunucu okur)

-- Supabase: veriler yalnızca sunucu (Edge Function) üzerinden erişilir; istemci anahtarlarıyla doğrudan erişim kapalıdır.
REVOKE ALL ON SCHEMA slot FROM PUBLIC;
`;
