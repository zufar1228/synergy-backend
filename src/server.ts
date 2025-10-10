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

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "5001", 10);

// Middlewares
app.use(cors());
app.use(express.json());

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ message: "API is running with TypeScript!" });
});

app.use("/api/devices", authMiddleware, deviceRoutes);
app.use("/api/warehouses", authMiddleware, warehouseRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/areas", authMiddleware, areaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/navigation", navigationRoutes);

app.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  await syncDatabase();
  initializeMqttClient();
  startHeartbeatJob();
});
