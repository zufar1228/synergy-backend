"use strict";
// backend/src/api/controllers/warehouseController.ts
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
exports.deleteWarehouse = exports.updateWarehouse = exports.getWarehouseById = exports.createWarehouse = exports.listWarehouses = exports.getAreasWithSystems = void 0;
const warehouseService = __importStar(require("../../services/warehouseService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const models_1 = require("../../db/models");
const getAreasWithSystems = async (req, res) => {
    try {
        const { id } = req.params;
        const data = await warehouseService.getWarehouseWithAreaSystems(id);
        res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.getAreasWithSystems = getAreasWithSystems;
const listWarehouses = async (req, res) => {
    try {
        // Panggil fungsi baru yang mengembalikan statistik
        const data = await warehouseService.getAllWarehousesWithStats();
        res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.listWarehouses = listWarehouses;
const createWarehouse = async (req, res) => {
    try {
        const warehouse = await warehouseService.createWarehouse(req.body);
        res.status(201).json(warehouse);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.createWarehouse = createWarehouse;
const getWarehouseById = async (req, res) => {
    try {
        // Fungsi findByPk sudah ada di service (getWarehouseWithAreaSystems),
        // tapi kita buat yang lebih simpel di sini
        const warehouse = await models_1.Warehouse.findByPk(req.params.id);
        if (!warehouse)
            return res.status(404).json({ message: "Warehouse not found" });
        res.status(200).json(warehouse);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.getWarehouseById = getWarehouseById;
const updateWarehouse = async (req, res) => {
    try {
        const warehouse = await warehouseService.updateWarehouse(req.params.id, req.body);
        res.status(200).json(warehouse);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.updateWarehouse = updateWarehouse;
const deleteWarehouse = async (req, res) => {
    try {
        await warehouseService.deleteWarehouse(req.params.id);
        res.status(204).send(); // No Content
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.deleteWarehouse = deleteWarehouse;
