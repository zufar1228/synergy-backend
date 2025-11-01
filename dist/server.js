"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/server.ts
require("dotenv/config"); // Pastikan dotenv diimpor dan dikonfigurasi di awal
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const models_1 = require("./db/models");
const deviceRoutes_1 = __importDefault(require("./api/routes/deviceRoutes"));
const warehouseRoutes_1 = __importDefault(require("./api/routes/warehouseRoutes"));
const analyticsRoutes_1 = __importDefault(require("./api/routes/analyticsRoutes"));
const client_1 = require("./mqtt/client");
const heartbeatChecker_1 = require("./jobs/heartbeatChecker");
const repeatDetectionJob_1 = require("./jobs/repeatDetectionJob"); // <-- 1. IMPORT JOB BARU
const areaRoutes_1 = __importDefault(require("./api/routes/areaRoutes"));
const authMiddleware_1 = require("./api/middlewares/authMiddleware");
const userRoutes_1 = __importDefault(require("./api/routes/userRoutes"));
const navigationRoutes_1 = __importDefault(require("./api/routes/navigationRoutes"));
const incidentRoutes_1 = __importDefault(require("./api/routes/incidentRoutes"));
const alertRoutes_1 = __importDefault(require("./api/routes/alertRoutes"));
const keamananRoutes_1 = __importDefault(require("./api/routes/keamananRoutes"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "5001", 10);
// Middlewares
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express_1.default.json());
// Health Check Route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "API is running with TypeScript!",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
    });
});
// Readiness check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Keep-alive endpoint for cron jobs (prevents Render spin-down)
app.get("/keep-alive", (req, res) => {
    res.status(200).json({
        status: "alive",
        message: "App is active and responding",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// HEAD version of keep-alive for cron services that prefer HEAD requests
app.head("/keep-alive", (req, res) => {
    res.status(200).end();
});
app.use("/api/devices", authMiddleware_1.authMiddleware, deviceRoutes_1.default);
app.use("/api/warehouses", authMiddleware_1.authMiddleware, warehouseRoutes_1.default);
app.use("/api/analytics", authMiddleware_1.authMiddleware, analyticsRoutes_1.default);
app.use("/api/areas", authMiddleware_1.authMiddleware, areaRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/navigation", navigationRoutes_1.default);
app.use("/api/incidents", incidentRoutes_1.default);
app.use("/api/alerts", alertRoutes_1.default);
app.use("/api/security-logs", authMiddleware_1.authMiddleware, keamananRoutes_1.default);
app.listen(PORT, async () => {
    console.log(`Server is listening on port ${PORT}`);
    // Initialize services asynchronously after server starts
    const initializeServices = async () => {
        try {
            console.log("Initializing database...");
            await Promise.race([
                (0, models_1.syncDatabase)(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Database sync timeout")), 30000)),
            ]);
            console.log("Database initialized successfully");
            console.log("Initializing MQTT client...");
            (0, client_1.initializeMqttClient)();
            console.log("MQTT client initialization started");
            console.log("Starting heartbeat job...");
            (0, heartbeatChecker_1.startHeartbeatJob)();
            console.log("Heartbeat job started");
            console.log("Starting repeat detection job...");
            (0, repeatDetectionJob_1.startRepeatDetectionJob)(); // <-- 2. PANGGIL FUNGSI JOB BARU
            console.log("Repeat detection job started");
        }
        catch (error) {
            console.error("Error during service initialization:", error);
            // Don't exit the process, just log the error
            // The server should still be able to handle requests even if some services fail
        }
    };
    // Start initialization in the background
    initializeServices();
});
