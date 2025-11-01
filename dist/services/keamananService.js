"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateKeamananLogStatus = void 0;
// backend/src/services/keamananService.ts
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const updateKeamananLogStatus = async (logId, userId, status, notes) => {
    const log = await models_1.KeamananLog.findByPk(logId);
    if (!log)
        throw new apiError_1.default(404, "Log keamanan tidak ditemukan.");
    log.status = status;
    log.notes = notes || log.notes;
    log.acknowledged_by = userId;
    log.acknowledged_at = new Date();
    await log.save();
    return log;
};
exports.updateKeamananLogStatus = updateKeamananLogStatus;
