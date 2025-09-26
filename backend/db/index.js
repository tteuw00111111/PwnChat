// backend/db/index.js
import "dotenv/config";
import pg from "pg";
import { v4 as uuidv4 } from 'uuid'; // Import uuid for potential use, though session_id comes from bridge

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST ?? process.env.PGHOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? process.env.PGPORT ?? 5432),
  user: process.env.DB_USER ?? process.env.PGUSER ?? "myuser",
  password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? "mypassword",
  database: process.env.DB_NAME ?? process.env.PGDATABASE ?? "pwnbuffer_chat",
  ssl: false,
});

// Helper to ensure consistent user ID order
function getOrderedUserIds(userId1, userId2) {
  return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
}

export async function saveSession(userId1, userId2, sharedAesKeyB64) {
  if (userId1 === userId2) {
    console.warn("Attempted to save session with self. Skipping.");
    return null;
  }

  const [u1, u2] = getOrderedUserIds(userId1, userId2);
  try {
    const res = await pool.query(
      `INSERT INTO sessions (user_id_1, user_id_2, shared_aes_key_b64)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id_1, user_id_2) DO UPDATE SET
       shared_aes_key_b64 = EXCLUDED.shared_aes_key_b64, updated_at = NOW()
       RETURNING *`,
      [u1, u2, sharedAesKeyB64]
    );
    return res.rows[0];
  } catch (error) {
    console.error("Error saving session:", error);
    throw error;
  }
}

export async function getSession(userId1, userId2) {
  const [u1, u2] = getOrderedUserIds(userId1, userId2);
  try {
    const res = await pool.query(
      `SELECT shared_aes_key_b64 FROM sessions WHERE user_id_1 = $1 AND user_id_2 = $2`,
      [u1, u2]
    );
    return res.rows[0] ? res.rows[0].shared_aes_key_b64 : null;
  } catch (error) {
    console.error("Error getting session:", error);
    throw error;
  }
}

// Optional: boot check
(async () => {
  const r = await pool.query("SELECT 1");
  console.log("DB ready:", r.rows[0]);
})().catch((e) => {
  console.error("DB connection failed:", e);
  process.exit(1);
});
