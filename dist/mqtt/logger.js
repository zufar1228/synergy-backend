"use strict";
/**
 * @file logger.ts
 * @purpose Centralized MQTT logger with environment-driven log level
 * @usedBy mqtt client and router modules
 * @deps env
 * @exports log
 * @sideEffects Writes to stdout/stderr
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const env_1 = require("../config/env");
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};
const configuredLevel = env_1.env.LOG_LEVEL ?? (env_1.env.NODE_ENV === 'production' ? 'info' : 'debug');
const currentLevel = LEVELS[configuredLevel] ?? LEVELS.info;
exports.log = {
    debug: (...args) => currentLevel <= LEVELS.debug && console.log('[MQTT]', ...args),
    info: (...args) => currentLevel <= LEVELS.info && console.log('[MQTT]', ...args),
    warn: (...args) => currentLevel <= LEVELS.warn && console.warn('[MQTT]', ...args),
    error: (...args) => currentLevel <= LEVELS.error && console.error('[MQTT]', ...args)
};
