"use strict";
/**
 * @file payloadUtils.ts
 * @purpose Helpers for parsing MQTT payload metadata
 * @usedBy mqtt message router
 * @deps none
 * @exports toOptionalNumber, toBooleanFlag
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBooleanFlag = exports.toOptionalNumber = void 0;
const toOptionalNumber = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
exports.toOptionalNumber = toOptionalNumber;
const toBooleanFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';
exports.toBooleanFlag = toBooleanFlag;
