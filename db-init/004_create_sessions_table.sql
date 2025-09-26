-- Drop existing sessions table and related objects if they exist
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS sessions;

-- Create the sessions table with shared_aes_key_b64
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID NOT NULL REFERENCES users(id),
    user_id_2 UUID NOT NULL REFERENCES users(id),
    shared_aes_key_b64 TEXT NOT NULL, -- Changed from session_id
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique session for a pair of users, regardless of order
    UNIQUE (user_id_1, user_id_2),
    
    -- Enforce consistent ordering of user IDs to prevent duplicate entries
    -- for the same pair of users (e.g., (A,B) and (B,A) are treated as the same)
    CHECK (user_id_1 < user_id_2)
);

-- Create an index for faster lookups by user IDs
CREATE INDEX idx_sessions_user_ids ON sessions(user_id_1, user_id_2);

-- Add a trigger to update the 'updated_at' column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();