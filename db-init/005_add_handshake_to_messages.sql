-- Add optional handshake envelope to messages so receivers that are offline
-- can still derive session material later.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS handshake_json JSONB;

