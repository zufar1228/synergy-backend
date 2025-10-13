// backend/src/server.ts
import "dotenv/config"; // Pastikan dotenv diimpor dan dikonfigurasi di awal
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { syncDatabase } from "./db/models";
import deviceRoutes from "./api/routes/deviceRoutes";
import warehouseRoutes from "./api/routes/warehouseRoutes";
import analyticsRoutes from "./api/routes/analyticsRoutes";
import { initializeMqttClient } from "./mqtt/client";
import { startHeartbeatJob } from "./jobs/heartbeatChecker";
import areaRoutes from "./api/routes/areaRoutes";
import { authMiddleware } from "./api/middlewares/authMiddleware";
import userRoutes from "./api/routes/userRoutes";
import navigationRoutes from "./api/routes/navigationRoutes";
import incidentRoutes from "./api/routes/incidentRoutes";
import alertRoutes from "./api/routes/alertRoutes";

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "5001", 10);

// Middlewares
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "API is running with TypeScript!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Readiness check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Keep-alive endpoint for cron jobs (prevents Render spin-down)
app.get("/keep-alive", (req: Request, res: Response) => {
  res.status(200).json({
    status: "alive",
    message: "App is active and responding",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// HEAD version of keep-alive for cron services that prefer HEAD requests
app.head("/keep-alive", (req: Request, res: Response) => {
  res.status(200).end();
});

app.use("/api/devices", authMiddleware, deviceRoutes);
app.use("/api/warehouses", authMiddleware, warehouseRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/areas", authMiddleware, areaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/navigation", navigationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/alerts", alertRoutes);

app.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);

  // Initialize services asynchronously after server starts
  const initializeServices = async () => {
    try {
      console.log("Initializing database...");
      await Promise.race([
        syncDatabase(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database sync timeout")), 30000)
        ),
      ]);
      console.log("Database initialized successfully");

      console.log("Initializing MQTT client...");
      initializeMqttClient();
      console.log("MQTT client initialization started");

      console.log("Starting heartbeat job...");
      startHeartbeatJob();
      console.log("Heartbeat job started");

      console.log("All services initialized successfully!");
    } catch (error) {
      console.error("Error during service initialization:", error);
      // Don't exit the process, just log the error
      // The server should still be able to handle requests even if some services fail
    }
  };

  // Start initialization in the background
  initializeServices();
});
