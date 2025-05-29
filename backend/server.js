import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { generalLimiter } from "./middleware/security.js";
import authRoutes from "./routes/auth.js";


console.log("🟡 Loading environment variables...");
dotenv.config();


const requiredEnvVars = ["JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    "❌ Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  process.exit(1);
}
console.log("✅ Environment variables loaded");

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

console.log("🟡 Setting up Express app...");


app.set("trust proxy", 1);


console.log("🟡 Applying security middleware...");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);


console.log("🟡 Setting up CORS...");
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.FRONTEND_URL?.split(",") || [
      "http:
    ];

    
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
};

app.use(cors(corsOptions));


console.log("🟡 Setting up rate limiting...");
app.use(generalLimiter);


console.log("🟡 Setting up body parsing...");
app.use(
  express.json({
    limit: "10mb",
    strict: true,
    type: ["application/json"],
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
    parameterLimit: 20,
  })
);


console.log("🟡 Setting up logging...");
if (NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}


console.log("🟡 Setting up health check...");
app.get("/health", (req, res) => {
  console.log("✅ Health check requested");
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

app.get("/test", (req, res) => {
  console.log("✅ Test endpoint hit");
  res.json({ message: "Test endpoint working" });
});


console.log("🔗 Registering API routes...");
app.use("/api/auth", authRoutes);
console.log("✅ Auth routes registered at /api/auth");


app.use("*", (req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});


app.use((err, req, res, _next) => {
  console.error("❌ Error:", {
    message: err.message,
    stack: NODE_ENV === "development" ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy violation",
    });
  }

  
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
    });
  }

  
  res.status(err.status || 500).json({
    success: false,
    message: NODE_ENV === "production" ? "Internal server error" : err.message,
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});


process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});

console.log("🟡 Starting server...");
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${NODE_ENV} mode`);
  console.log(`📊 Health check: http:
  console.log(`🔗 API Base: http:
  if (NODE_ENV === "development") {
    console.log("📝 Available endpoints:");
    console.log("   GET  /health");
    console.log("   POST /api/auth/register");
    console.log("   POST /api/auth/login");
    console.log("   POST /api/auth/logout");
    console.log("   GET  /api/auth/me");
  }
});
