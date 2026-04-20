"use strict";
/**
 * @file lingkungan/index.ts
 * @purpose Barrel export for lingkungan (environment monitoring) feature module
 * @usedBy server.ts
 * @deps LingkunganLog, PredictionResult models, lingkunganRoutes
 * @exports LingkunganLog, PredictionResult, lingkunganRoutes
 * @sideEffects None
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lingkunganRoutes = exports.PredictionResult = exports.LingkunganLog = void 0;
// Models
var lingkunganLog_1 = require("./models/lingkunganLog");
Object.defineProperty(exports, "LingkunganLog", { enumerable: true, get: function () { return __importDefault(lingkunganLog_1).default; } });
var predictionResult_1 = require("./models/predictionResult");
Object.defineProperty(exports, "PredictionResult", { enumerable: true, get: function () { return __importDefault(predictionResult_1).default; } });
// Routes
var lingkunganRoutes_1 = require("./routes/lingkunganRoutes");
Object.defineProperty(exports, "lingkunganRoutes", { enumerable: true, get: function () { return __importDefault(lingkunganRoutes_1).default; } });
