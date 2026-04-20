/**
 * @file intrusi/index.ts
 * @purpose Barrel export for intrusi (door security) feature module
 * @usedBy server.ts
 * @deps intrusiRoutes, disarmReminderJob
 * @exports intrusiRoutes, startDisarmReminderJob
 * @sideEffects None
 */

// Routes
export { default as intrusiRoutes } from './routes/intrusiRoutes';

// Jobs
export { startDisarmReminderJob } from './jobs/disarmReminderJob';
