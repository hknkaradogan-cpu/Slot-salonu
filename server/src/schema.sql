-- SLOT SALONU veritabanı şeması (PostgreSQL). Tüm tablolar "slot" şemasındadır.
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
CREATE TABLE IF NOT EXISTS slot.client_errors (id BIGSERIAL PRIMARY KEY, user_id BIGINT, message TEXT NOT NULL, stack TEXT, screen TEXT, device TEXT, app_version TEXT, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS client_errors_time ON slot.client_errors(created_at);
CREATE TABLE IF NOT EXISTS slot.okey_tables (id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE, status TEXT NOT NULL, mode TEXT NOT NULL, stake BIGINT NOT NULL DEFAULT 0, rounds INT NOT NULL DEFAULT 1, katlamali BOOLEAN NOT NULL DEFAULT TRUE, private BOOLEAN NOT NULL DEFAULT FALSE, owner_id BIGINT, state TEXT NOT NULL, version BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS okey_tables_match ON slot.okey_tables(status, private, mode, stake, rounds, katlamali);
CREATE TABLE IF NOT EXISTS slot.okey_players (table_id BIGINT NOT NULL REFERENCES slot.okey_tables(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, seat INT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, paid BIGINT NOT NULL DEFAULT 0, payout BIGINT, joined_at BIGINT NOT NULL, PRIMARY KEY (table_id, user_id));
CREATE INDEX IF NOT EXISTS okey_players_user ON slot.okey_players(user_id, active);
CREATE TABLE IF NOT EXISTS slot.okey_invites (id BIGSERIAL PRIMARY KEY, table_id BIGINT NOT NULL REFERENCES slot.okey_tables(id) ON DELETE CASCADE, from_id BIGINT NOT NULL, to_id BIGINT NOT NULL, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS okey_invites_to ON slot.okey_invites(to_id, created_at);
CREATE TABLE IF NOT EXISTS slot.okey_stats (user_id BIGINT PRIMARY KEY REFERENCES slot.users(id) ON DELETE CASCADE, played INT NOT NULL DEFAULT 0, won INT NOT NULL DEFAULT 0, coins_won BIGINT NOT NULL DEFAULT 0, best_score INT);
-- 3.2: volatilite, çevrim içi sayımı, spin bakım indeksleri
ALTER TABLE slot.games_config ADD COLUMN IF NOT EXISTS volatility TEXT;
ALTER TABLE slot.rtp_history ADD COLUMN IF NOT EXISTS old_vol TEXT;
ALTER TABLE slot.rtp_history ADD COLUMN IF NOT EXISTS new_vol TEXT;
ALTER TABLE slot.users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;
ALTER TABLE slot.spins ADD COLUMN IF NOT EXISTS vol TEXT;
CREATE INDEX IF NOT EXISTS spins_resp ON slot.spins(created_at) WHERE response IS NOT NULL;
CREATE INDEX IF NOT EXISTS spins_time ON slot.spins(created_at);
CREATE INDEX IF NOT EXISTS users_seen ON slot.users(last_seen_at);
-- 4.0: platform (bilet, başarım, çark, bulmaca, turnuva, mesaj, sohbet, bildirim)
ALTER TABLE slot.users ADD COLUMN IF NOT EXISTS tickets BIGINT NOT NULL DEFAULT 5;
ALTER TABLE slot.users ADD COLUMN IF NOT EXISTS muted_until BIGINT;
ALTER TABLE slot.users ADD COLUMN IF NOT EXISTS referred_by BIGINT;
CREATE TABLE IF NOT EXISTS slot.notifications (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, data TEXT, created_at BIGINT NOT NULL, read_at BIGINT);
CREATE INDEX IF NOT EXISTS notifications_user ON slot.notifications(user_id, id);
CREATE TABLE IF NOT EXISTS slot.achievement_claims (user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, achievement TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY (user_id, achievement));
CREATE TABLE IF NOT EXISTS slot.wheel_spins (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, free BOOLEAN NOT NULL, prize_index INT NOT NULL, coins BIGINT NOT NULL DEFAULT 0, tickets INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS wheel_spins_user ON slot.wheel_spins(user_id, created_at);
CREATE TABLE IF NOT EXISTS slot.puzzles (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, size INT NOT NULL, start_board TEXT NOT NULL, created_at BIGINT NOT NULL, solved_at BIGINT, moves INT, rewarded BOOLEAN NOT NULL DEFAULT FALSE);
CREATE INDEX IF NOT EXISTS puzzles_user ON slot.puzzles(user_id, solved_at);
CREATE TABLE IF NOT EXISTS slot.tournaments (id BIGSERIAL PRIMARY KEY, kind TEXT NOT NULL, game TEXT NOT NULL, title TEXT NOT NULL, starts_at BIGINT NOT NULL, ends_at BIGINT NOT NULL, entry_tickets INT NOT NULL DEFAULT 0, prizes TEXT NOT NULL, status TEXT NOT NULL, created_at BIGINT NOT NULL, settled_at BIGINT);
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_slot ON slot.tournaments(kind, game, starts_at);
CREATE TABLE IF NOT EXISTS slot.tournament_entries (tournament_id BIGINT NOT NULL REFERENCES slot.tournaments(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, score BIGINT NOT NULL DEFAULT 0, rank INT, prize BIGINT, joined_at BIGINT NOT NULL, PRIMARY KEY (tournament_id, user_id));
CREATE INDEX IF NOT EXISTS tentries_user ON slot.tournament_entries(user_id);
CREATE TABLE IF NOT EXISTS slot.messages (id BIGSERIAL PRIMARY KEY, from_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, to_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at BIGINT NOT NULL, read_at BIGINT);
CREATE INDEX IF NOT EXISTS messages_pair ON slot.messages(from_id, to_id, id);
CREATE INDEX IF NOT EXISTS messages_to ON slot.messages(to_id, read_at);
CREATE TABLE IF NOT EXISTS slot.chat_messages (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at BIGINT NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE);
REVOKE ALL ON SCHEMA slot FROM PUBLIC;

-- 5.0: SPINOVA — Düz Okey, Tavla, Aviator
ALTER TABLE slot.okey_tables ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT '101';
CREATE TABLE IF NOT EXISTS slot.tavla_tables (id BIGSERIAL PRIMARY KEY, code TEXT UNIQUE, status TEXT NOT NULL, stake BIGINT NOT NULL DEFAULT 0, private BOOLEAN NOT NULL DEFAULT FALSE, owner_id BIGINT, state TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS tavla_tables_match ON slot.tavla_tables(status, private, stake);
CREATE TABLE IF NOT EXISTS slot.tavla_players (table_id BIGINT NOT NULL REFERENCES slot.tavla_tables(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, seat INT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, paid BIGINT NOT NULL DEFAULT 0, payout BIGINT, joined_at BIGINT NOT NULL, PRIMARY KEY (table_id, user_id));
CREATE INDEX IF NOT EXISTS tavla_players_user ON slot.tavla_players(user_id, active);
CREATE TABLE IF NOT EXISTS slot.tavla_invites (id BIGSERIAL PRIMARY KEY, table_id BIGINT NOT NULL REFERENCES slot.tavla_tables(id) ON DELETE CASCADE, from_id BIGINT NOT NULL, to_id BIGINT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS slot.tavla_stats (user_id BIGINT PRIMARY KEY REFERENCES slot.users(id) ON DELETE CASCADE, played INT NOT NULL DEFAULT 0, won INT NOT NULL DEFAULT 0, coins_won BIGINT NOT NULL DEFAULT 0, mars INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS slot.aviator_rounds (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES slot.users(id) ON DELETE CASCADE, bet BIGINT NOT NULL, auto NUMERIC(10,2), crash NUMERIC(10,2) NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, start_at BIGINT NOT NULL, status TEXT NOT NULL, cash_mult NUMERIC(10,2), win BIGINT NOT NULL DEFAULT 0, ended_at BIGINT, created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS aviator_rounds_user ON slot.aviator_rounds(user_id, id DESC);
CREATE INDEX IF NOT EXISTS aviator_rounds_time ON slot.aviator_rounds(created_at);

-- 5.5 Avivasor ortak turlar: herkes aynı uçağı izler; bahis satırları tura bağlanır
CREATE TABLE IF NOT EXISTS slot.aviator_games (id BIGINT PRIMARY KEY, crash NUMERIC(10,2) NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, open_at BIGINT NOT NULL, start_at BIGINT NOT NULL, crash_at BIGINT NOT NULL, created_at BIGINT NOT NULL);
ALTER TABLE slot.aviator_rounds ADD COLUMN IF NOT EXISTS game_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS aviator_rounds_game_user ON slot.aviator_rounds(game_id, user_id) WHERE game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS aviator_rounds_open ON slot.aviator_rounds(start_at) WHERE status='flying';
