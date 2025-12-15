"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const models_1 = require("./db/models");
const deviceRoutes_1 = __importDefault(require("./api/routes/deviceRoutes"));
const warehouseRoutes_1 = __importDefault(require("./api/routes/warehouseRoutes"));
const analyticsRoutes_1 = __importDefault(require("./api/routes/analyticsRoutes"));
const client_1 = require("./mqtt/client");
const heartbeatChecker_1 = require("./jobs/heartbeatChecker");
const repeatDetectionJob_1 = require("./jobs/repeatDetectionJob");
const areaRoutes_1 = __importDefault(require("./api/routes/areaRoutes"));
const authMiddleware_1 = require("./api/middlewares/authMiddleware");
const userRoutes_1 = __importDefault(require("./api/routes/userRoutes"));
const navigationRoutes_1 = __importDefault(require("./api/routes/navigationRoutes"));
const incidentRoutes_1 = __importDefault(require("./api/routes/incidentRoutes"));
const alertRoutes_1 = __importDefault(require("./api/routes/alertRoutes"));
const keamananRoutes_1 = __importDefault(require("./api/routes/keamananRoutes"));
const telegramRoutes_1 = __importDefault(require("./api/routes/telegramRoutes"));
const telegramService_1 = require("./services/telegramService");
const app = (0, express_1.default)();
// Azure sets PORT as a string; ensure numeric and bind to all interfaces
const PORT = parseInt(process.env.PORT || "5001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
// Middlewares
app.use((0, cors_1.default)({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express_1.default.json());
// Health Check Route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "🚀 Backend TypeScript API is running!",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        port: PORT,
    });
});
// Readiness check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Keep-alive endpoint
app.get("/keep-alive", (req, res) => {
    res.status(200).json({
        status: "alive",
        message: "App is active",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
app.head("/keep-alive", (req, res) => {
    res.status(200).end();
});
// Routes
app.use("/api/devices", authMiddleware_1.authMiddleware, deviceRoutes_1.default);
app.use("/api/warehouses", authMiddleware_1.authMiddleware, warehouseRoutes_1.default);
app.use("/api/analytics", authMiddleware_1.authMiddleware, analyticsRoutes_1.default);
app.use("/api/areas", authMiddleware_1.authMiddleware, areaRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/navigation", navigationRoutes_1.default);
app.use("/api/incidents", incidentRoutes_1.default);
app.use("/api/alerts", alertRoutes_1.default);
app.use("/api/security-logs", authMiddleware_1.authMiddleware, keamananRoutes_1.default);
app.use("/api/telegram", telegramRoutes_1.default);
// ✅ TAMBAHAN: Error handling untuk production
app.use((err, req, res, next) => {
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
                        (0, models_1.syncDatabase)(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Database sync timeout")), 15000)),
                    ]).catch(err => {
                        console.error("⚠️ Database sync failed:", err?.message);
                        console.log("⚠️ Continuing without sync...");
                    });
                    console.log("✅ Database initialized");
                }
                else {
                    console.log("ℹ️ Production: skipping database sync");
                }
                // MQTT
                console.log("🔄 Initializing MQTT client...");
                try {
                    (0, client_1.initializeMqttClient)();
                    console.log("✅ MQTT client started");
                }
                catch (err) {
                    console.error("⚠️ MQTT failed:", err?.message);
                }
                // Jobs
                console.log("🔄 Starting jobs...");
                try {
                    (0, heartbeatChecker_1.startHeartbeatJob)();
                    (0, repeatDetectionJob_1.startRepeatDetectionJob)();
                    console.log("✅ Jobs started");
                }
                catch (err) {
                    console.error("⚠️ Jobs failed:", err.message);
                }
                // Telegram Webhook Setup (only if configured)
                if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_URL) {
                    console.log("🔄 Setting up Telegram webhook...");
                    try {
                        await (0, telegramService_1.setWebhook)();
                        console.log("✅ Telegram webhook configured");
                    }
                    catch (err) {
                        console.error("⚠️ Telegram webhook setup failed:", err.message);
                    }
                }
                else {
                    console.log("ℹ️ Telegram: Not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL missing)");
                }
                console.log("🎉 All services initialized!");
            }
            catch (error) {
                console.error("❌ Service initialization error:", error);
            }
        };
        initializeServices();
    });
});
//tes
