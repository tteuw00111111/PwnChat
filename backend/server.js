import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

// Import your API routes
import authRoutes from "./routes/auth.js";

// --- INITIALIZATION ---

// Load environment variables from .env file
dotenv.config();
console.log("✅ Environment variables loaded.");

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

// This in-memory map tracks which user is connected to which socket.
// In a production environment with multiple server instances, you would replace this
// with a shared store like Redis.
const userSocketMap = new Map(); // Maps -> userId: socket.id

// --- SOCKET.IO SERVER SETUP ---

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// --- EXPRESS MIDDLEWARE ---

// Set security-related HTTP headers
app.use(helmet());

// Configure Cross-Origin Resource Sharing
app.use(cors());

// Log HTTP requests
app.use(morgan(NODE_ENV === "development" ? "dev" : "combined"));

// Parse incoming JSON payloads
app.use(express.json({ limit: "1mb" }));

// --- API ROUTES ---

app.use("/api/auth", authRoutes);
console.log("✅ API routes registered.");

// --- SOCKET.IO MIDDLEWARE & EVENT HANDLING ---

/**
 * Socket.IO Authentication Middleware
 * This is the gatekeeper for all incoming real-time connections.
 * It runs for every new client trying to connect.
 */
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("Authentication error: Token not provided."));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error("Authentication error: Invalid token."));
    }
    // Attach the decoded user payload to the socket object for later use.
    socket.user = decoded;
    next();
  });
});

/**
 * Main Connection Handler
 * This logic runs after a user has been successfully authenticated by the middleware.
 */
io.on("connection", (socket) => {
  const userId = socket.user.userId;
  console.log(`✅ User connected: ${socket.id}, UserID: ${userId}`);

  // Track the user's socket ID.
  userSocketMap.set(userId, socket.id);

  // Handler for receiving a private message
  socket.on("privateMessage", ({ recipientId, text }) => {
    const recipientSocketId = userSocketMap.get(recipientId);

    if (recipientSocketId) {
      // If the recipient is online, send the message directly to their socket.
      io.to(recipientSocketId).emit("privateMessage", {
        text,
        from: userId,
      });
    } else {
      // If the user is offline, you could save the message to a database here.
      console.log(`Message for offline user ${recipientId} received.`);
    }
  });

  // Handler for when a user disconnects
  socket.on("disconnect", () => {
    // Remove the user from the tracking map.
    userSocketMap.delete(userId);
    console.log(`❌ User disconnected: ${socket.id}, UserID: ${userId}`);
  });
});

// --- SERVER STARTUP & GRACEFUL SHUTDOWN ---

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
});

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  io.close(() => {
    console.log("Socket.IO server closed.");
    httpServer.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
