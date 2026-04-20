"use strict";
/**
 * @file keamanan/index.ts
 * @purpose Barrel export for keamanan (security camera) feature module
 * @usedBy server.ts
 * @deps keamananRoutes, repeatDetectionJob
 * @exports keamananRoutes, startRepeatDetectionJob
 * @sideEffects None
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepeatDetectionJob = exports.keamananRoutes = void 0;
// Routes
var keamananRoutes_1 = require("./routes/keamananRoutes");
Object.defineProperty(exports, "keamananRoutes", { enumerable: true, get: function () { return __importDefault(keamananRoutes_1).default; } });
// Jobs
var repeatDetectionJob_1 = require("./jobs/repeatDetectionJob");
Object.defineProperty(exports, "startRepeatDetectionJob", { enumerable: true, get: function () { return repeatDetectionJob_1.startRepeatDetectionJob; } });
