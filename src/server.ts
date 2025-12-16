import "dotenv/config";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { syncDatabase } from "./db/models";
import deviceRoutes from "./api/routes/deviceRoutes";
import warehouseRoutes from "./api/routes/warehouseRoutes";
import analyticsRoutes from "./api/routes/analyticsRoutes";
import { initializeMqttClient } from "./mqtt/client";
import { startHeartbeatJob } from "./jobs/heartbeatChecker";
import { startRepeatDetectionJob } from "./jobs/repeatDetectionJob";
import areaRoutes from "./api/routes/areaRoutes";
import { authMiddleware } from "./api/middlewares/authMiddleware";
import userRoutes from "./api/routes/userRoutes";
import navigationRoutes from "./api/routes/navigationRoutes";
import incidentRoutes from "./api/routes/incidentRoutes";
import alertRoutes from "./api/routes/alertRoutes";
import keamananRoutes from "./api/routes/keamananRoutes";
import telegramRoutes from "./api/routes/telegramRoutes";
import intrusiRoutes from "./api/routes/intrusiRoutes"; // <-- TinyML Intrusion Detection
import { setWebhook as setupTelegramWebhook } from "./services/telegramService";

const app: Express = express();

// Azure sets PORT as a string; ensure numeric and bind to all interfaces
const PORT: number = parseInt(process.env.PORT || "5001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Middlewares
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 Backend TypeScript API is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    port: PORT,
  });
});

// Readiness check
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Keep-alive endpoint
app.get("/keep-alive", (req: Request, res: Response) => {
  res.status(200).json({
    status: "alive",
    message: "App is active",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.head("/keep-alive", (req: Request, res: Response) => {
  res.status(200).end();
});

// Routes
app.use("/api/devices", authMiddleware, deviceRoutes);
app.use("/api/warehouses", authMiddleware, warehouseRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/areas", authMiddleware, areaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/navigation", navigationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/security-logs", authMiddleware, keamananRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api", intrusiRoutes); // <-- TinyML Intrusion Detection (routes prefixed with /api)

// ✅ TAMBAHAN: Error handling untuk production
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Server is listening on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  // Initialize services in background (NON-BLOCKING)
  setImmediate(async () => {
    const initializeServices = async () => {
      try {
        // Database - skip in production or add timeout
        if (process.env.NODE_ENV !== "production") {
          console.log("🔄 Initializing database...");
          await Promise.race([
            syncDatabase(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Database sync timeout")), 15000)
            ),
          ]).catch(err => {
            console.error("⚠️ Database sync failed:", err?.message);
            console.log("⚠️ Continuing without sync...");
          });
          console.log("✅ Database initialized");
        } else {
          console.log("ℹ️ Production: skipping database sync");
        }

        // MQTT
        console.log("🔄 Initializing MQTT client...");
        try {
          initializeMqttClient();
          console.log("✅ MQTT client started");
        } catch (err: any) {
          console.error("⚠️ MQTT failed:", err?.message);
        }

        // Jobs
        console.log("🔄 Starting jobs...");
        try {
          startHeartbeatJob();
          startRepeatDetectionJob();
          console.log("✅ Jobs started");
        } catch (err: any) {
          console.error("⚠️ Jobs failed:", err.message);
        }

        // Telegram Webhook Setup (only if configured)
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_URL) {
          console.log("🔄 Setting up Telegram webhook...");
          try {
            await setupTelegramWebhook();
            console.log("✅ Telegram webhook configured");
          } catch (err: any) {
            console.error("⚠️ Telegram webhook setup failed:", err.message);
          }
        } else {
          console.log("ℹ️ Telegram: Not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL missing)");
        }

        console.log("🎉 All services initialized!");
      } catch (error) {
        console.error("❌ Service initialization error:", error);
      }
    };

    initializeServices();
  });
});

//tes