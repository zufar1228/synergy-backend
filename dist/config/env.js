"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
require("dotenv/config");
const envSchema = zod_1.z.object({
    // Server
    PORT: zod_1.z.coerce.number().default(5001),
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z
        .enum(['development', 'production', 'test'])
        .default('development'),
    FRONTEND_URL: zod_1.z.string().url().default('http://localhost:3000'),
    // Database
    DATABASE_URL: zod_1.z.string().min(1),
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: zod_1.z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1),
    // MQTT
    MQTT_HOST: zod_1.z.string().min(1),
    MQTT_USERNAME: zod_1.z.string().min(1),
    MQTT_PASSWORD: zod_1.z.string().min(1),
    LOG_LEVEL: zod_1.z.enum(['debug', 'info', 'warn', 'error']).optional(),
    // EMQX API
    EMQX_API_URL: zod_1.z.string().url().optional(),
    EMQX_APP_ID: zod_1.z.string().min(1).optional(),
    EMQX_APP_SECRET: zod_1.z.string().min(1).optional(),
    // Telegram
    TELEGRAM_BOT_TOKEN: zod_1.z.string().min(1).optional(),
    TELEGRAM_GROUP_ID: zod_1.z.string().optional(),
    TELEGRAM_WEBHOOK_URL: zod_1.z.string().url().optional(),
    TELEGRAM_WEBHOOK_SECRET: zod_1.z.string().optional(),
    TELEGRAM_CRITICAL_REMINDER_MS: zod_1.z.coerce.number().default(30 * 60 * 1000),
    TELEGRAM_RECOVERY_COOLDOWN_MS: zod_1.z.coerce.number().default(2 * 60 * 1000),
    // VAPID (Web Push)
    VAPID_SUBJECT: zod_1.z.string().optional(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: zod_1.z.string().optional(),
    VAPID_PRIVATE_KEY: zod_1.z.string().optional(),
    // ML Server
    ML_SERVER_URL: zod_1.z.string().url().default('http://localhost:5002')
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of parsed.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Invalid environment variables');
}
exports.env = parsed.data;
