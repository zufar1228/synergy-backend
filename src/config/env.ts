/**
 * @file env.ts
 * @purpose Centralized environment variable loader and validator
 * @usedBy All modules requiring env config
 * @deps dotenv
 * @exports env
 * @sideEffects Reads process.env, throws on missing required vars
 */

import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(5001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // MQTT
  MQTT_HOST: z.string().min(1),
  MQTT_USERNAME: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  // EMQX API
  EMQX_API_URL: z.string().url().optional(),
  EMQX_APP_ID: z.string().min(1).optional(),
  EMQX_APP_SECRET: z.string().min(1).optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_GROUP_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_CRITICAL_REMINDER_MS: z.coerce.number().default(30 * 60 * 1000),
  TELEGRAM_RECOVERY_COOLDOWN_MS: z.coerce.number().default(2 * 60 * 1000),

  // VAPID (Web Push)
  VAPID_SUBJECT: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),

  // ML Server
  ML_SERVER_URL: z.string().url().default('http://localhost:5002')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
