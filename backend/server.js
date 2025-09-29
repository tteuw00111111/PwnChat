import express from "express";
import http from "http";
import https from "https";
import fs from "node:fs";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { resolve, join } from "node:path";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import keyRoutes from "./routes/keys.js";

import messageRoutes from "./routes/messages.js";

dotenv.config();
const app = express();
let httpServer;
if (process.env.HTTPS_KEY && process.env.HTTPS_CERT) {
  try {
    const key = fs.readFileSync(process.env.HTTPS_KEY);
    const cert = fs.readFileSync(process.env.HTTPS_CERT);
    httpServer = https.createServer({ key, cert }, app);
    console.log("TLS enabled: using HTTPS server");
  } catch (e) {
    console.warn("Failed to load TLS key/cert, falling back to HTTP:", e);
    httpServer = http.createServer(app);
  }
} else {
  httpServer = http.createServer(app);
}
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

const userSocketMap = new Map();

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(helmet());
if (NODE_ENV === "production") {
  try {
    app.use(
      helmet.contentSecurityPolicy({
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "https:", "wss:"],
        },
      })
    );
  } catch (e) {
    console.warn("CSP not applied:", e);
  }
}
app.use(cors());
const DEV_LOG_DIR = resolve(process.cwd(), "devtool-logs");
try { fs.mkdirSync(DEV_LOG_DIR, { recursive: true }); } catch {}
const BACKEND_LOG = join(DEV_LOG_DIR, `backend-${Date.now()}.log`);
const backendStream = fs.createWriteStream(BACKEND_LOG, { flags: "a" });

app.use(morgan(NODE_ENV === "development" ? "dev" : "combined", { stream: backendStream }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/messages", messageRoutes(io, userSocketMap));
app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  try {
    backendStream.write(`[error] ${new Date().toISOString()} ${String(err?.stack || err)}\n`);
  } catch {}
  res.status(500).json({ message: "Internal Server Error" });
});


io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error: Token not provided."));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error("Authentication error: Invalid token."));
    }
    socket.user = decoded;
    next();
  });
});

io.on("connection", (socket) => {
  const userId = socket.user.userId;
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ User connected: ${socket.id}`);
  }

  let set = userSocketMap.get(userId);
  if (!set) {
    set = new Set();
    userSocketMap.set(userId, set);
  }
  set.add(socket.id);

  socket.on("profile:picture:update", ({ userId: updatedUserId, profilePicUrl }) => {
    try {
      socket.broadcast.emit("profile:picture:updated", {
        userId: updatedUserId,
        profilePicUrl
      });
      console.log(`📸 Profile picture updated for user ${updatedUserId}`);
    } catch (error) {
      console.error("Failed to broadcast profile picture update:", error);
    }
  });

  socket.on("disconnect", () => {
    const s = userSocketMap.get(userId);
    if (s) {
      s.delete(socket.id);
      if (s.size === 0) userSocketMap.delete(userId);
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ User disconnected: ${socket.id}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
});

process.on("uncaughtException", (err) => {
  try { backendStream.write(`[uncaughtException] ${err.stack || String(err)}\n`); } catch {}
});
process.on("unhandledRejection", (reason) => {
  try { backendStream.write(`[unhandledRejection] ${String(reason)}\n`); } catch {}
});
