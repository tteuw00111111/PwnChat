// backend/routes/sessions.js
import { Router } from "express";
import { saveSession, getSession } from "../db/index.js";
import { authenticateToken } from "../middleware/auth_middleware.js";
import crypto from "node:crypto";

const router = Router();

/**
 * POST /api/sessions
 * Body: { recipientId: string, sharedAesKeyB64: string } // Changed from sessionId
 * Saves a cryptographic session key between the authenticated user and a recipient.
 */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { recipientId, sharedAesKeyB64 } = req.body; // Changed to sharedAesKeyB64
    const currentUserId = req.user.userId; // From authenticateToken middleware

    if (!recipientId || !sharedAesKeyB64) {
      return res.status(400).json({ message: "Recipient ID and shared AES key are required." });
    }

    const [u1, u2] = currentUserId < recipientId ? [currentUserId, recipientId] : [recipientId, currentUserId];

    await saveSession(u1, u2, sharedAesKeyB64); // Changed to sharedAesKeyB64
    res.status(200).json({ message: "Session saved successfully." });
  } catch (error) {
    console.error("Error saving session:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/sessions/:otherUserId
 * Retrieves the cryptographic session key between the authenticated user and another user.
 */
router.get("/:otherUserId", authenticateToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.userId; // From authenticateToken middleware

    if (!otherUserId) {
      return res.status(400).json({ message: "Other user ID is required." });
    }

    const [u1, u2] = currentUserId < otherUserId ? [currentUserId, otherUserId] : [otherUserId, currentUserId];

    const sharedAesKeyB64 = await getSession(u1, u2); // Changed to sharedAesKeyB64
    if (sharedAesKeyB64) {
      // Re-derive sessionId from the shared key
      const keyBuffer = Buffer.from(sharedAesKeyB64, 'base64');
      const sessionId = crypto.createHash("sha256").update(keyBuffer).digest("hex");

      res.status(200).json({ sessionId, sharedAesKeyB64 }); // Return both
    } else {
      res.status(404).json({ message: "Session not found." });
    }
  } catch (error) {
    console.error("Error retrieving session:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
