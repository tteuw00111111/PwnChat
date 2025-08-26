import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/index.js"; // Import our database connection pool

const router = express.Router();
const SALT_ROUNDS = 10; // The cost factor for hashing

/**
 * POST /api/auth/register
 * Creates a new user in the database.
 */
router.post("/register", async (req, res) => {
  try {
    const { username, password, publicKeyBundle } = req.body;

    // Basic validation
    if (!username || !password || !publicKeyBundle) {
      return res
        .status(400)
        .json({
          message: "Username, password, and public key bundle are required.",
        });
    }

    // Hash the password before storing it
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert the new user into the 'users' table
    const newUser = await db.query(
      "INSERT INTO users (username, password_hash, public_key_bundle) VALUES ($1, $2, $3) RETURNING id, username",
      [username, passwordHash, JSON.stringify(publicKeyBundle)]
    );

    res
      .status(201)
      .json({ user: newUser.rows[0], message: "User created successfully." });
  } catch (error) {
    // This error will trigger if the username is not unique
    if (error.code === "23505") {
      return res.status(409).json({ message: "Username already exists." });
    }
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT.
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required." });
    }

    // Find the user in the database
    const result = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    const user = result.rows[0];

    if (!user) {
      // Use a generic message to avoid confirming if a username exists
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Compare the provided password with the stored hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // If credentials are valid, create a JWT payload
    const payload = {
      userId: user.id,
      username: user.username,
    };

    // Sign the token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });

    // Send the token back to the client
    res.json({ token });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

export default router;
