import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 45 * 30 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 20, // Higher limit in dev
  message: { error: "Too many authentication attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests" },
});

export const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: "Too many search requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit how often a user can POST messages
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 messages/minute per IP (adjust as needed)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages sent. Please slow down." },
});
