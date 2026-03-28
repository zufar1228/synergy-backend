"use strict";
// backend/src/api/middlewares/validateRequest.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params
        });
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
