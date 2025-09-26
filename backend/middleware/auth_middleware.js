// backend/middleware/auth_middleware.js
import { verifyToken } from "../utils/jwt.js";

export const authenticateToken = (req, res, next) => {
  // 👈 Renamed this function
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
};
