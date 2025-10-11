"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateIncidentStatus = void 0;
// backend/src/services/incidentService.ts
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const updateIncidentStatus = async (incidentId, userId, status, notes) => {
    const incident = await models_1.Incident.findByPk(incidentId);
    if (!incident) {
        throw new apiError_1.default(404, "Insiden tidak ditemukan.");
    }
    incident.status = status;
    incident.notes = notes || incident.notes; // Hanya update notes jika ada
    incident.acknowledged_by = userId;
    incident.acknowledged_at = new Date();
    await incident.save();
    return incident;
};
exports.updateIncidentStatus = updateIncidentStatus;
