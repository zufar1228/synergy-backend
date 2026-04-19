/**
 * @file intrusi/index.ts
 * @purpose Barrel export for intrusi (door security) feature module
 * @usedBy server.ts
 * @deps IntrusiLog model, intrusiRoutes, disarmReminderJob
 * @exports IntrusiLog, intrusiRoutes, startDisarmReminderJob
 * @sideEffects None
 */

// Models
export { default as IntrusiLog } from './models/intrusiLog';

// Routes
export { default as intrusiRoutes } from './routes/intrusiRoutes';

// Jobs
export { startDisarmReminderJob } from './jobs/disarmReminderJob';
