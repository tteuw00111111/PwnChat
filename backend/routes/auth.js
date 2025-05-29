import express from "express";
import bcrypt from "bcrypt";
import { generateTokens } from "../utils/jwt.js";
import { validateAuth } from "../middleware/validation.js";
import { authLimiter } from "../middleware/security.js";

const router = express.Router();

router.post("/login", authLimiter, validateAuth, async (req, res) => {
  try {
    const { username, password } = req.body;

    const mockUser = {
      id: 1,
      username: "testuser",
      password: await bcrypt.hash("TestPass123!", 12),
    };

    if (username !== "testuser") {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const validPassword = await bcrypt.compare(password, mockUser.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const { accessToken, refreshToken } = generateTokens({
      id: mockUser.id,
      username: mockUser.username,
    });

    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      user: { id: mockUser.id, username: mockUser.username },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
