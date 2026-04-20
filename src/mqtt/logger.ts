/**
 * @file logger.ts
 * @purpose Centralized MQTT logger with environment-driven log level
 * @usedBy mqtt client and router modules
 * @deps env
 * @exports log
 * @sideEffects Writes to stdout/stderr
 */

import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const configuredLevel: LogLevel =
  env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug');
const currentLevel = LEVELS[configuredLevel] ?? LEVELS.info;

export const log = {
  debug: (...args: unknown[]) =>
    currentLevel <= LEVELS.debug && console.log('[MQTT]', ...args),
  info: (...args: unknown[]) =>
    currentLevel <= LEVELS.info && console.log('[MQTT]', ...args),
  warn: (...args: unknown[]) =>
    currentLevel <= LEVELS.warn && console.warn('[MQTT]', ...args),
  error: (...args: unknown[]) =>
    currentLevel <= LEVELS.error && console.error('[MQTT]', ...args)
};
