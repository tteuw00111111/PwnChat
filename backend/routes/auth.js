// backend/routes/auth.js
import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db/index.js";
import { authLimiter } from "../middleware/security.js";
import { generateTokens } from "../utils/jwt.js";

const router = Router();

const usernameRe = /^[A-Za-z0-9]{3,30}$/;

// --- helpers ---
function isNonEmptyObject(x) {
  return (
    x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0
  );
}

/**
 * POST /api/auth/register
 * Body: { username, password, publicBundle, oneTimePreKeys? }
 */
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, password, publicBundle, oneTimePreKeys } = req.body ?? {};

    if (!username || !password || !isNonEmptyObject(publicBundle)) {
      return res.status(400).json({
        message: "Username, password, and public key bundle are required.",
      });
    }
    if (!usernameRe.test(username)) {
      return res.status(400).json({
        message: "Username must be 3-30 alphanumeric characters",
      });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(password, rounds);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertUserSQL = `
        INSERT INTO users (username, password_hash, public_key_bundle)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
        RETURNING id, username
      `;
      const userRes = await client.query(insertUserSQL, [
        username,
        passwordHash,
        JSON.stringify(publicBundle),
      ]);

      if (userRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Username is already taken" });
      }

      if (Array.isArray(oneTimePreKeys) && oneTimePreKeys.length > 0) {
        const insertPrekey = `
          INSERT INTO one_time_prekeys (user_id, key_pub)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `;
        const userId = userRes.rows[0].id;
        const tasks = [];
        for (const pk of oneTimePreKeys) {
          if (pk && typeof pk.publicKeyB64 === "string") {
            tasks.push(client.query(insertPrekey, [userId, pk.publicKeyB64]));
          }
        }
        if (tasks.length) await Promise.all(tasks);
      }

      await client.query("COMMIT");
      return res.status(201).json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 * Returns: { accessToken, refreshToken }
 */
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required." });
    }

    const q = await pool.query(
      "SELECT id, username, password_hash FROM users WHERE username=$1 LIMIT 1",
      [username]
    );
    if (!q.rowCount)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // Use the standardized 'generateTokens' function from jwt.js
    const { accessToken, refreshToken } = generateTokens({
      sub: user.username,
      userId: user.id, // Use userId to match middleware expectations
    });

    // Return both tokens to the client
    return res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
