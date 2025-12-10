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

const app: Express = express();

// ✅ FIX: Azure akan set PORT sebagai string
const PORT:  number = parseInt(process.env. PORT || "5001", 10);

// Middlewares
app.use(
  cors({
    origin: process.env. FRONTEND_URL || "http://localhost:3000",
    credentials:  true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 Backend TypeScript API is running!",
    timestamp:  new Date().toISOString(),
    environment: process.env. NODE_ENV || "development",
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

app.head("/keep-alive", (req:  Request, res: Response) => {
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

// ✅ TAMBAHAN: Error handling untuk production
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.listen(PORT, async () => {
  console.log(`✅ Server is listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  const initializeServices = async () => {
    try {
      console. log("🔄 Initializing database...");
      await Promise.race([
        syncDatabase(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database sync timeout")), 30000)
        ),
      ]);
      console.log("✅ Database initialized");

      console.log("🔄 Initializing MQTT client...");
      initializeMqttClient();
      console.log("✅ MQTT client started");

      console.log("🔄 Starting heartbeat job.. .");
      startHeartbeatJob();
      console.log("✅ Heartbeat job started");

      console.log("🔄 Starting repeat detection job.. .");
      startRepeatDetectionJob();
      console.log("✅ Repeat detection job started");

      console.log("🎉 All services initialized successfully!");
    } catch (error) {
      console.error("❌ Error during service initialization:", error);
    }
  };

  initializeServices();
});