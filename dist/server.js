"use strict";
/**
 * @file server.ts
 * @purpose Express application entry point — mounts routes, middleware, MQTT, cron jobs
 * @usedBy Node.js runtime (main entry)
 * @deps express, cors, rate-limit, all routes, mqtt/client, jobs, db/models
 * @exports None (self-starting server)
 * @sideEffects HTTP server listen, DB init, MQTT connect, cron jobs start, Telegram webhook setup
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const models_1 = require("./db/models");
const drizzle_1 = require("./db/drizzle");
const deviceRoutes_1 = __importDefault(require("./api/routes/deviceRoutes"));
const warehouseRoutes_1 = __importDefault(require("./api/routes/warehouseRoutes"));
const analyticsRoutes_1 = __importDefault(require("./api/routes/analyticsRoutes"));
const client_1 = require("./mqtt/client");
const heartbeatChecker_1 = require("./jobs/heartbeatChecker");
const repeatDetectionJob_1 = require("./features/keamanan/jobs/repeatDetectionJob");
const disarmReminderJob_1 = require("./features/intrusi/jobs/disarmReminderJob");
const areaRoutes_1 = __importDefault(require("./api/routes/areaRoutes"));
const authMiddleware_1 = require("./api/middlewares/authMiddleware");
const userRoutes_1 = __importDefault(require("./api/routes/userRoutes"));
const navigationRoutes_1 = __importDefault(require("./api/routes/navigationRoutes"));
const alertRoutes_1 = __importDefault(require("./api/routes/alertRoutes"));
const keamananRoutes_1 = __importDefault(require("./features/keamanan/routes/keamananRoutes"));
const intrusiRoutes_1 = __importDefault(require("./features/intrusi/routes/intrusiRoutes"));
const lingkunganRoutes_1 = __importDefault(require("./features/lingkungan/routes/lingkunganRoutes"));
const calibrationRoutes_1 = __importDefault(require("./features/calibration/routes/calibrationRoutes"));
const telegramRoutes_1 = __importDefault(require("./api/routes/telegramRoutes"));
const telegramService_1 = require("./services/telegramService");
const app = (0, express_1.default)();
const PORT = env_1.env.PORT;
const HOST = env_1.env.HOST;
const FRONTEND_URL = env_1.env.FRONTEND_URL;
// Trust first proxy (Azure App Service, nginx, etc.) so req.ip is correct
app.set('trust proxy', 1);
// Middlewares
app.use((0, cors_1.default)({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
// Global rate limiter
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 5000 : 1000, // Much higher limit for dev so SSR doesn't crash
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
}));
// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({
        message: '🚀 Backend TypeScript API is running!',
        timestamp: new Date().toISOString(),
        environment: env_1.env.NODE_ENV,
        port: PORT
    });
});
// Readiness check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
// Keep-alive endpoint
app.get('/keep-alive', (req, res) => {
    res.status(200).json({
        status: 'alive',
        message: 'App is active',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
app.head('/keep-alive', (req, res) => {
    res.status(200).end();
});
// Calibration API — no auth, isolated from main app (prototype tool)
app.use('/api-cal', calibrationRoutes_1.default);
// Routes
app.use('/api/devices', authMiddleware_1.authMiddleware, deviceRoutes_1.default);
app.use('/api/warehouses', authMiddleware_1.authMiddleware, warehouseRoutes_1.default);
app.use('/api/analytics', authMiddleware_1.authMiddleware, analyticsRoutes_1.default);
app.use('/api/areas', authMiddleware_1.authMiddleware, areaRoutes_1.default);
app.use('/api/users', userRoutes_1.default); // has per-route auth (some endpoints need public access)
app.use('/api/navigation', authMiddleware_1.authMiddleware, navigationRoutes_1.default);
app.use('/api/alerts', authMiddleware_1.authMiddleware, alertRoutes_1.default);
app.use('/api/security-logs', authMiddleware_1.authMiddleware, keamananRoutes_1.default);
app.use('/api/intrusi', authMiddleware_1.authMiddleware, intrusiRoutes_1.default);
app.use('/api/lingkungan', authMiddleware_1.authMiddleware, lingkunganRoutes_1.default);
// Telegram webhook gets a stricter rate limit to prevent abuse
app.use('/api/telegram/webhook', (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // max 60 updates/min from Telegram
    standardHeaders: true,
    legacyHeaders: false
}));
app.use('/api/telegram', telegramRoutes_1.default); // has per-route auth (webhook must stay public)
// ✅ TAMBAHAN: Error handling untuk production
app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err && err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    res.status(500).json({
        error: 'Internal Server Error',
        message: env_1.env.NODE_ENV === 'development' ? err.message : undefined
    });
});
// Track cron tasks for graceful shutdown
let cronTasks = [];
const server = app.listen(PORT, HOST, () => {
    console.log(`✅ Server is listening on ${HOST}:${PORT}`);
    console.log(`Environment: ${env_1.env.NODE_ENV}`);
    // Initialize services in background (NON-BLOCKING)
    setImmediate(async () => {
        const initializeServices = async () => {
            try {
                // Database connection check
                console.log('🔄 Checking database connection...');
                await Promise.race([
                    (0, models_1.initDatabase)(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 15000))
                ]).catch((err) => {
                    console.error('⚠️ Database connection failed:', err?.message);
                    console.log('⚠️ Continuing without database...');
                });
                console.log('✅ Database connected');
                // MQTT
                console.log('🔄 Initializing MQTT client...');
                try {
                    (0, client_1.initializeMqttClient)();
                    console.log('✅ MQTT client started');
                }
                catch (err) {
                    console.error('⚠️ MQTT failed:', err?.message);
                }
                // Jobs
                console.log('🔄 Starting jobs...');
                try {
                    cronTasks.push((0, heartbeatChecker_1.startHeartbeatJob)());
                    cronTasks.push((0, repeatDetectionJob_1.startRepeatDetectionJob)());
                    cronTasks.push((0, disarmReminderJob_1.startDisarmReminderJob)());
                    console.log('✅ Jobs started');
                }
                catch (err) {
                    console.error('⚠️ Jobs failed:', err.message);
                }
                // Telegram Webhook Setup (only if configured)
                if (env_1.env.TELEGRAM_BOT_TOKEN && env_1.env.TELEGRAM_WEBHOOK_URL) {
                    console.log('🔄 Setting up Telegram webhook...');
                    try {
                        await (0, telegramService_1.setWebhook)();
                        console.log('✅ Telegram webhook configured');
                    }
                    catch (err) {
                        console.error('⚠️ Telegram webhook setup failed:', err.message);
                    }
                }
                else {
                    console.log('ℹ️ Telegram: Not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL missing)');
                }
                console.log('🎉 All services initialized!');
            }
            catch (error) {
                console.error('❌ Service initialization error:', error);
            }
        };
        initializeServices();
    });
});
// ─── Graceful Shutdown ────────────────────────────────────
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
    // 1. Stop accepting new connections
    server.close(() => {
        console.log('✅ HTTP server closed');
    });
    // 2. Stop cron jobs
    for (const task of cronTasks) {
        task.stop();
    }
    console.log('✅ Cron jobs stopped');
    // 3. Disconnect MQTT
    try {
        if (client_1.client && client_1.client.connected) {
            client_1.client.end(false);
            console.log('✅ MQTT client disconnected');
        }
    }
    catch (err) {
        console.error('⚠️ Error disconnecting MQTT:', err);
    }
    // 4. Drain database pool
    try {
        await drizzle_1.pool.end();
        console.log('✅ Database pool drained');
    }
    catch (err) {
        console.error('⚠️ Error draining DB pool:', err);
    }
    console.log('👋 Shutdown complete.');
    process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
