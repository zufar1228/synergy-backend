"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteArea = exports.updateArea = exports.createArea = exports.listAreas = void 0;
const areaService = __importStar(require("../../services/areaService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
// Fungsi error handling generik untuk menghindari repetisi
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({ message: "An unexpected error occurred." });
};
const listAreas = async (req, res) => {
    try {
        const { warehouse_id } = req.query;
        let data;
        if (warehouse_id) {
            data = await areaService.getAreasByWarehouse(warehouse_id);
        }
        else {
            data = await areaService.getAllAreas();
        }
        res.status(200).json(data);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.listAreas = listAreas;
const createArea = async (req, res) => {
    try {
        const area = await areaService.createArea(req.body);
        res.status(201).json(area);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.createArea = createArea;
const updateArea = async (req, res) => {
    try {
        const area = await areaService.updateArea(req.params.id, req.body);
        res.status(200).json(area);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateArea = updateArea;
const deleteArea = async (req, res) => {
    try {
        await areaService.deleteArea(req.params.id);
        res.status(204).send();
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.deleteArea = deleteArea;
