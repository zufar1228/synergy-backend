/**
 * @file server.ts
 * @purpose Express application entry point — mounts routes, middleware, MQTT, cron jobs
 * @usedBy Node.js runtime (main entry)
 * @deps express, cors, rate-limit, all routes, mqtt/client, jobs, db/models
 * @exports None (self-starting server)
 * @sideEffects HTTP server listen, DB init, MQTT connect, cron jobs start, Telegram webhook setup
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { initDatabase } from './db/models';
import { pool } from './db/drizzle';
import deviceRoutes from './api/routes/deviceRoutes';
import warehouseRoutes from './api/routes/warehouseRoutes';
import analyticsRoutes from './api/routes/analyticsRoutes';
import { initializeMqttClient, client as mqttClient } from './mqtt/client';
import { startHeartbeatJob } from './jobs/heartbeatChecker';
import { startRepeatDetectionJob } from './features/keamanan/jobs/repeatDetectionJob';
import { startDisarmReminderJob } from './features/intrusi/jobs/disarmReminderJob';
import areaRoutes from './api/routes/areaRoutes';
import { authMiddleware } from './api/middlewares/authMiddleware';
import userRoutes from './api/routes/userRoutes';
import navigationRoutes from './api/routes/navigationRoutes';
import alertRoutes from './api/routes/alertRoutes';
import keamananRoutes from './features/keamanan/routes/keamananRoutes';
import intrusiRoutes from './features/intrusi/routes/intrusiRoutes';
import lingkunganRoutes from './features/lingkungan/routes/lingkunganRoutes';
import calibrationRoutes from './features/calibration/routes/calibrationRoutes';
import telegramRoutes from './api/routes/telegramRoutes';
import { setWebhook as setupTelegramWebhook } from './services/telegramService';

const app: Express = express();

const PORT = env.PORT;
const HOST = env.HOST;
const FRONTEND_URL = env.FRONTEND_URL;

// Trust first proxy (Azure App Service, nginx, etc.) so req.ip is correct
app.set('trust proxy', 1);

// Middlewares
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

// Global rate limiter
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 5000 : 1000, // Much higher limit for dev so SSR doesn't crash
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  })
);

// Health Check Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: '🚀 Backend TypeScript API is running!',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    port: PORT
  });
});

// Readiness check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Keep-alive endpoint
app.get('/keep-alive', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    message: 'App is active',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.head('/keep-alive', (req: Request, res: Response) => {
  res.status(200).end();
});

// Calibration API — no auth, isolated from main app (prototype tool)
app.use('/api-cal', calibrationRoutes);

// Routes
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/warehouses', authMiddleware, warehouseRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/areas', authMiddleware, areaRoutes);
app.use('/api/users', userRoutes); // has per-route auth (some endpoints need public access)
app.use('/api/navigation', authMiddleware, navigationRoutes);
app.use('/api/alerts', authMiddleware, alertRoutes);
app.use('/api/security-logs', authMiddleware, keamananRoutes);
app.use('/api/intrusi', authMiddleware, intrusiRoutes);
app.use('/api/lingkungan', authMiddleware, lingkunganRoutes);

// Telegram webhook gets a stricter rate limit to prevent abuse
app.use(
  '/api/telegram/webhook',
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // max 60 updates/min from Telegram
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use('/api/telegram', telegramRoutes); // has per-route auth (webhook must stay public)

// ✅ TAMBAHAN: Error handling untuk production
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  if (err && err.statusCode) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  res.status(500).json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Track cron tasks for graceful shutdown
let cronTasks: ReturnType<typeof import('node-cron').schedule>[] = [];

const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Server is listening on ${HOST}:${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);

  // Initialize services in background (NON-BLOCKING)
  setImmediate(async () => {
    const initializeServices = async () => {
      try {
        // Database connection check
        console.log('🔄 Checking database connection...');
        await Promise.race([
          initDatabase(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Database connection timeout')),
              15000
            )
          )
        ]).catch((err) => {
          console.error('⚠️ Database connection failed:', err?.message);
          console.log('⚠️ Continuing without database...');
        });
        console.log('✅ Database connected');

        // MQTT
        console.log('🔄 Initializing MQTT client...');
        try {
          initializeMqttClient();
          console.log('✅ MQTT client started');
        } catch (err: any) {
          console.error('⚠️ MQTT failed:', err?.message);
        }

        // Jobs
        console.log('🔄 Starting jobs...');
        try {
          cronTasks.push(startHeartbeatJob());
          cronTasks.push(startRepeatDetectionJob());
          cronTasks.push(startDisarmReminderJob());
          console.log('✅ Jobs started');
        } catch (err: any) {
          console.error('⚠️ Jobs failed:', err.message);
        }

        // Telegram Webhook Setup (only if configured)
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_URL) {
          console.log('🔄 Setting up Telegram webhook...');
          try {
            await setupTelegramWebhook();
            console.log('✅ Telegram webhook configured');
          } catch (err: any) {
            console.error('⚠️ Telegram webhook setup failed:', err.message);
          }
        } else {
          console.log(
            'ℹ️ Telegram: Not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL missing)'
          );
        }

        console.log('🎉 All services initialized!');
      } catch (error) {
        console.error('❌ Service initialization error:', error);
      }
    };

    initializeServices();
  });
});

// ─── Graceful Shutdown ────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
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
    if (mqttClient && mqttClient.connected) {
      mqttClient.end(false);
      console.log('✅ MQTT client disconnected');
    }
  } catch (err) {
    console.error('⚠️ Error disconnecting MQTT:', err);
  }

  // 4. Drain database pool
  try {
    await pool.end();
    console.log('✅ Database pool drained');
  } catch (err) {
    console.error('⚠️ Error draining DB pool:', err);
  }

  console.log('👋 Shutdown complete.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
