// Re-export Drizzle schema and client as the canonical database layer.
// Legacy Sequelize models are no longer used at runtime.
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
