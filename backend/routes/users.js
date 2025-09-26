import express from "express";
import { pool } from "../db/index.js"; // You correctly import 'pool' here
import { authenticateToken } from "../middleware/auth_middleware.js";
import { searchLimiter } from "../middleware/security.js";

const router = express.Router();

// GET /api/users - Fetches all users except the one making the request
router.get("/", authenticateToken, async (req, res) => {
  try {
    // req.user is added by the authenticateToken middleware
    // Restore the original query to exclude the current user from the list
    const result = await pool.query(
      "SELECT id, username, display_name, profile_picture FROM users WHERE id != $1",
      [req.user.userId]
    );

    // The frontend expects an array of objects with { id, name, username, profilePicUrl }
    const users = result.rows.map((user) => ({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      profilePicUrl: user.profile_picture
    }));

    res.json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET /api/users/search?username=<query> - Searches for users by username
router.get("/search", authenticateToken, searchLimiter, async (req, res) => {
  try {
    const { username } = req.query;
    const currentUserId = req.user.userId;

    if (!username) {
      return res.status(400).json({ message: "Username query parameter is required." });
    }

    const result = await pool.query(
      "SELECT id, username, display_name, profile_picture FROM users WHERE username ILIKE $1 AND id != $2",
      [`%${username}%`, currentUserId]
    );

    const users = result.rows.map((user) => ({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      profilePicUrl: user.profile_picture
    }));

    res.json(users);
  } catch (error) {
    console.error("Failed to search users:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET /api/users/:id - Fetches a single user by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT id, username, display_name, profile_picture FROM users WHERE id = $1 LIMIT 1",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      profilePicUrl: user.profile_picture
    });
  } catch (error) {
    console.error("Failed to fetch user by ID:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// PUT /api/users/profile - Updates current user's profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { displayName, profilePicture } = req.body;
    const userId = req.user.userId;

    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 255)) {
      return res.status(400).json({ message: "Display name must be a string with max 255 characters." });
    }

    if (profilePicture !== undefined && typeof profilePicture !== 'string') {
      return res.status(400).json({ message: "Profile picture must be a string." });
    }

    // Build dynamic query based on provided fields
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      updateFields.push(`display_name = $${paramCount}`);
      values.push(displayName);
      paramCount++;
    }

    if (profilePicture !== undefined) {
      updateFields.push(`profile_picture = $${paramCount}`);
      values.push(profilePicture);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update." });
    }

    values.push(userId);

    const query = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, username, display_name, profile_picture
    `;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      profilePicUrl: user.profile_picture
    });
  } catch (error) {
    console.error("Failed to update user profile:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET /api/users/me - Gets current user's profile
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      "SELECT id, username, display_name, profile_picture FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.display_name || user.username,
      username: user.username,
      profilePicUrl: user.profile_picture
    });
  } catch (error) {
    console.error("Failed to fetch current user profile:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

export default router;
