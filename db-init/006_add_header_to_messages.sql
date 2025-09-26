-- Add optional ratchet header to messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS header_json JSONB;

