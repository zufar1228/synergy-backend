"use strict";
/**
 * @file lingkungan/index.ts
 * @purpose Barrel export for lingkungan (environment monitoring) feature module
 * @usedBy server.ts
 * @deps lingkunganRoutes
 * @exports lingkunganRoutes
 * @sideEffects None
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lingkunganRoutes = void 0;
// Routes
var lingkunganRoutes_1 = require("./routes/lingkunganRoutes");
Object.defineProperty(exports, "lingkunganRoutes", { enumerable: true, get: function () { return __importDefault(lingkunganRoutes_1).default; } });
