/**
 * @file lingkungan/index.ts
 * @purpose Barrel export for lingkungan (environment monitoring) feature module
 * @usedBy server.ts
 * @deps lingkunganRoutes
 * @exports lingkunganRoutes
 * @sideEffects None
 */

// Routes
export { default as lingkunganRoutes } from './routes/lingkunganRoutes';
