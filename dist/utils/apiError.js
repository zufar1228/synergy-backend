"use strict";
/**
 * @file apiError.ts
 * @purpose Custom error class with HTTP status code for API error responses
 * @usedBy All controllers and services
 * @deps None
 * @exports ApiError (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.default = ApiError;
