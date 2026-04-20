"use strict";
/**
 * @file validateRequest.ts
 * @purpose Zod schema validation middleware for request body/query/params
 * @usedBy Route files that need input validation
 * @deps zod
 * @exports validate
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const validate = (schema) => (req, res, next) => {
    try {
        const parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params
        });
        // Assign parsed values back so unknown keys are stripped
        if (parsed.body)
            req.body = parsed.body;
        if (parsed.query)
            req.query = parsed.query;
        if (parsed.params)
            req.params = parsed.params;
        next();
    }
    catch (e) {
        // Mengirim response dengan format yang lebih bersih
        return res.status(400).json({
            message: 'Invalid request data',
            errors: e.flatten().fieldErrors
        });
    }
};
exports.validate = validate;
