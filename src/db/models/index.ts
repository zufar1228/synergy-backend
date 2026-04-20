/**
 * @file index.ts
 * @purpose Re-exports Drizzle schema/client as canonical DB layer + connection test utility
 * @usedBy server.ts
 * @deps drizzle.ts, schema.ts
 * @exports db, all schema tables, initDatabase
 * @sideEffects DB connection test on initDatabase()
 */

// Re-export Drizzle schema and client as the canonical database layer.
export { db } from '../drizzle';
export * from '../schema';

// Connection test utility (replaces old syncDatabase)
import { db } from '../drizzle';
import { sql } from 'drizzle-orm';

export const initDatabase = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    console.log('Database connection established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};
