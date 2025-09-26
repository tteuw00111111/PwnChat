import { Router } from "express";
import { pool } from "../db/index.js";
import { authenticateToken } from "../middleware/auth_middleware.js";
import { body, validationResult } from "express-validator";
import { messageLimiter } from "../middleware/security.js";

export default function (io, userSocketMap) {
  const router = Router();

  /**
   * GET /api/messages/conversations
   * Fetches a list of unique users the authenticated user has conversed with.
   */
  router.get("/conversations", authenticateToken, async (req, res) => {
    console.log("Hitting /api/messages/conversations route");
    try {
      const myId = req.user.userId;

      const query = `
        SELECT DISTINCT
            CASE
                WHEN sender_id = $1 THEN recipient_id
                ELSE sender_id
            END AS conversant_id
        FROM messages
        WHERE sender_id = $1 OR recipient_id = $1;
      `;

      const result = await pool.query(query, [myId]);
      const conversantIds = result.rows.map(row => row.conversant_id);

      if (conversantIds.length > 0) {
        const usersQuery = `
          SELECT id, username, display_name, profile_picture FROM users WHERE id = ANY($1::uuid[]);
        `;
        const usersResult = await pool.query(usersQuery, [conversantIds]);
        res.json(usersResult.rows);
      } else {
        res.json([]);
      }

    } catch (err) {
      console.error("Failed to fetch conversations:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  /**
   * GET /api/messages/:peerId
   * Fetches the message history between the authenticated user and a specific peer.
   */
  router.get("/:peerId", authenticateToken, async (req, res) => {
    console.log(`Hitting /api/messages/:peerId route with peerId: ${req.params.peerId}`);
    try {
      const { peerId } = req.params;
      const { limit, offset } = req.query;
      const myId = req.user.userId;

      let query = `
        SELECT id, sender_id, recipient_id, ciphertext, created_at, handshake_json, header_json
        FROM messages
        WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
        ORDER BY created_at DESC
      `;
      const queryParams = [myId, peerId];

      if (limit) {
        query += ` LIMIT $3`;
        queryParams.push(parseInt(limit));
      }
      if (offset) {
        query += ` OFFSET $4`;
        queryParams.push(parseInt(offset));
      }

      const result = await pool.query(query, queryParams);
      res.json(result.rows.reverse()); // Reverse to maintain chronological order on frontend
    } catch (err) {
      console.error("Failed to fetch message history:", err);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  /**
   * POST /api/messages
   * 1. Stores a new encrypted message in the database.
   * 2. Pushes the message in real-time to the recipient if they are online.
   */
  router.post(
    "/",
    authenticateToken,
    messageLimiter,
    [
      body("recipientId").isUUID().withMessage("Invalid recipient ID"),
      body("ciphertext")
        .isString()
        .notEmpty().withMessage("Ciphertext cannot be empty")
        .isLength({ max: 8 * 1024 }).withMessage("Ciphertext too large"),
      body("handshake").optional().isObject().withMessage("Invalid handshake"),
      body("header").optional().isObject().withMessage("Invalid header"),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        try {
          console.warn("/api/messages validation failed", {
            user: req.user?.userId,
            errors: errors.array(),
            bodyShape: {
              recipientId: req.body?.recipientId,
              ciphertextType: typeof req.body?.ciphertext,
              ciphertextLen: typeof req.body?.ciphertext === 'string' ? req.body.ciphertext.length : undefined,
            },
          });
        } catch {}
        return res.status(400).json({ errors: errors.array() });
      }

      try {
        const senderId = req.user.userId;
        const senderUsername = req.user.sub;
        const { recipientId, ciphertext, handshake, header } = req.body;

        if (recipientId === senderId) {
          return res.status(400).json({ message: "Cannot send a message to yourself" });
        }

        const r = await pool.query("SELECT 1 FROM users WHERE id=$1", [recipientId]);
        if (!r.rowCount) {
          return res.status(404).json({ message: "Recipient not found" });
        }

        const query = `
          INSERT INTO messages (sender_id, recipient_id, ciphertext, handshake_json, header_json)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, created_at, handshake_json, header_json;
        `;
        const result = await pool.query(query, [
          senderId,
          recipientId,
          ciphertext,
          handshake ?? null,
          header ?? null,
        ]);
        const newMessage = result.rows[0];

        const recipientSockets = userSocketMap.get(recipientId);
        if (recipientSockets && recipientSockets.size > 0) {
          const payload = {
            senderId,
            senderUsername,
            ciphertext,
            id: newMessage.id,
            created_at: newMessage.created_at,
            handshake: newMessage.handshake_json || undefined,
            header: newMessage.header_json || undefined,
          };
          console.log("Emitting private:message with payload:", payload);
          for (const sid of recipientSockets) {
            io.to(sid).emit("private:message", payload);
          }
        }

        const senderSockets = userSocketMap.get(senderId);
        if (senderSockets && senderSockets.size > 0) {
          for (const sid of senderSockets) {
            io.to(sid).emit("message:delivered", {
              id: newMessage.id,
              recipientId,
              created_at: newMessage.created_at,
            });
          }
        }

        res.status(201).json(newMessage);
      } catch (err) {
        console.error("Failed to send message:", err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  );

  return router;
}
