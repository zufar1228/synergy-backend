"use strict";
/**
 * @file calibration/index.ts
 * @purpose Barrel export for calibration feature module
 * @usedBy server.ts
 * @deps calibrationRoutes
 * @exports calibrationRoutes
 * @sideEffects None
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calibrationRoutes = void 0;
var calibrationRoutes_1 = require("./routes/calibrationRoutes");
Object.defineProperty(exports, "calibrationRoutes", { enumerable: true, get: function () { return __importDefault(calibrationRoutes_1).default; } });
