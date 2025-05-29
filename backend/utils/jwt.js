import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export const generateTokens = (payload) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    issuer: "pwnbuffer.org",
    audience: "pwnbuffer-client",
  });

  const refreshToken = jwt.sign(
    {
      ...payload,
      tokenType: "refresh",
      jti: crypto.randomUUID(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
      issuer: "pwnbuffer.org",
      audience: "pwnbuffer-client",
    }
  );

  return { accessToken, refreshToken };
};

export const verifyToken = (token, options = {}) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: "pwnbuffer.org",
    audience: "pwnbuffer-client",
    ...options,
  });
};

export const decodeToken = (token) => {
  return jwt.decode(token, { complete: true });
};

export const generateSecureSecret = () => {
  return crypto.randomBytes(64).toString("hex");
};

const tokenBlacklist = new Set();

export const blacklistToken = (token) => {
  const decoded = decodeToken(token);
  if (decoded && decoded.payload.jti) {
    tokenBlacklist.add(decoded.payload.jti);
  }
};

export const isTokenBlacklisted = (token) => {
  const decoded = decodeToken(token);
  return (
    decoded && decoded.payload.jti && tokenBlacklist.has(decoded.payload.jti)
  );
};
