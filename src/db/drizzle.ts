/**
 * @file drizzle.ts
 * @purpose Drizzle ORM client and PostgreSQL connection pool (primary DB layer)
 * @usedBy All services and features
 * @deps drizzle-orm, pg, schema, env
 * @exports db, pool
 * @sideEffects DB connection pool initialization
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

export const db = drizzle(pool, { schema });
