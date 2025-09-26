BEGIN;


-- One-time prekeys are stored public-only here; private material stays on client.
CREATE TABLE IF NOT EXISTS one_time_prekeys (
id BIGSERIAL PRIMARY KEY,
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
key_pub TEXT NOT NULL,
uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
consumed_at TIMESTAMPTZ
);


-- Query common path efficiently
CREATE INDEX IF NOT EXISTS idx_prekeys_user_available
ON one_time_prekeys(user_id)
WHERE consumed_at IS NULL;


COMMIT;