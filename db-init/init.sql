-- Enable the pgcrypto extension to get access to gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the users table
CREATE TABLE users (
    -- UUID is a more secure and robust primary key than a simple number.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- UNIQUE ensures the database rejects any attempt to create two users
    -- with the same username.
    username VARCHAR(255) UNIQUE NOT NULL,
    
    -- This will store the hashed password from bcrypt.
    password_hash VARCHAR(255) NOT NULL,
    
    -- JSONB is a binary JSON format, perfect for storing the public key bundle object.
    public_key_bundle JSONB,
    
    -- Automatically records when the user account was created.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- You can add an index for faster username lookups during login.
CREATE INDEX idx_users_username ON users(username);

-- You can insert a test user for development if you want.
-- Note: Replace the hash with a real one generated from your backend for a test password.
-- INSERT INTO users (username, password_hash) VALUES ('testuser', '$2b$10$Kx/Abc123...');