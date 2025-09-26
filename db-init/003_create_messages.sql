-- Description: Creates the messages table for storing encrypted chat messages.
-- Up Migration

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    ciphertext TEXT NOT NULL, -- Encrypted message content
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sender
        FOREIGN KEY(sender_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_recipient
        FOREIGN KEY(recipient_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- Optional: Create indexes for faster querying of conversations
CREATE INDEX idx_messages_sender_recipient ON messages(sender_id, recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Down Migration
-- Not strictly necessary for this project, but good practice.
-- DROP TABLE IF EXISTS messages;
