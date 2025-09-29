import { Router } from "express";
import { pool } from "../db/index.js";
import { authenticateToken } from "../middleware/auth_middleware.js";
import { body, validationResult } from "express-validator";

const router = Router();

/**
 * GET /api/keys/:username
 * Fetches the public key bundle for a given user. This is needed to
 * initiate a secure session with them.
 */
router.get("/:username", authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res
        .status(400)
        .json({ message: "Username parameter is required" });
    }

    const query = "SELECT public_key_bundle FROM users WHERE username = $1 LIMIT 1";
    const result = await pool.query(query, [username]);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "User not found or has no key bundle" });
    }

    // The public_bundle column is stored as JSONB in PostgreSQL
    const publicBundle = result.rows[0].public_key_bundle;
    if (!publicBundle) {
      return res
        .status(404)
        .json({ message: "Key bundle not available for this user" });
    }

    res.json(publicBundle);
  } catch (err) {
    console.error(
      `Failed to fetch key bundle for ${req.params.username}:`,
      err
    );
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/keys/bundle
 * Allows an authenticated user to upload their own public key bundle.
 */
router.post("/bundle", authenticateToken, async (req, res) => {
  try {
    // The user's ID is attached to the request by the `authenticateToken` middleware
    const userId = req.user.userId;
    const publicBundle = req.body;

    if (!publicBundle) {
      return res.status(400).json({ message: "Public bundle is required" });
    }

    const query = "UPDATE users SET public_key_bundle = $1 WHERE id = $2";
    await pool.query(query, [publicBundle, userId]);

    res.status(200).json({ message: "Bundle uploaded successfully" });
  } catch (err) {
    console.error('Failed to upload key bundle:', err.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;

// Additional endpoint: fetch and consume one-time prekey for a user
// GET /api/keys/:username/prekey
router.get("/:username/prekey", authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    // Resolve user id
    const userRow = await pool.query(
      "SELECT id FROM users WHERE username=$1 LIMIT 1",
      [username]
    );
    if (!userRow.rowCount) {
      return res.status(404).json({ message: "User not found" });
    }
    const userId = userRow.rows[0].id;

    // Select one available prekey and mark as consumed atomically
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query(
        `SELECT id, key_pub FROM one_time_prekeys WHERE user_id=$1 AND consumed_at IS NULL ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [userId]
      );
      if (!row.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "No prekeys available" });
      }
      const prekey = row.rows[0];
      await client.query(
        `UPDATE one_time_prekeys SET consumed_at=now() WHERE id=$1`,
        [prekey.id]
      );
      await client.query("COMMIT");
      return res.json({ id: prekey.id, publicKeyB64: prekey.key_pub });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Failed to fetch prekey:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/keys/prekeys
 * Body: { prekeys: string[] | { publicKeyB64: string }[] }
 * Adds one-time prekeys for the authenticated user.
 */
router.post(
  "/prekeys",
  authenticateToken,
  [
    body("prekeys").isArray({ min: 1 }).withMessage("prekeys must be a non-empty array"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const userId = req.user.userId;
      const arr = req.body.prekeys || [];
      const items = arr.map((x) => (typeof x === 'string' ? x : x?.publicKeyB64)).filter(Boolean);
      if (!items.length) return res.status(400).json({ message: "No valid prekeys" });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const sql = `INSERT INTO one_time_prekeys (user_id, key_pub) VALUES ($1, $2) ON CONFLICT DO NOTHING`;
        for (const pk of items) {
          await client.query(sql, [userId, pk]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      res.status(201).json({ ok: true, added: items.length });
    } catch (err) {
      console.error('Failed to upload prekeys:', err);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
);
