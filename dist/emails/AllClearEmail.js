"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllClearEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const AllClearEmail = ({ warehouseName, areaName, deviceName, timestamp, }) => ((0, jsx_runtime_1.jsx)("div", { style: {
        fontFamily: "sans-serif",
        padding: "20px",
        backgroundColor: "#f4f4f4",
    }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
            maxWidth: "600px",
            margin: "auto",
            backgroundColor: "white",
            border: "1px solid #ddd",
            borderRadius: "5px",
            padding: "20px",
        }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { color: "#28a745" }, children: "Sistem Kembali Normal" }), (0, jsx_runtime_1.jsx)("p", { children: "Sistem ventilasi di area berikut telah kembali ke kondisi normal." }), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: "20px" }, children: "Detail Lokasi" }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Gudang:" }), " ", warehouseName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Area:" }), " ", areaName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Perangkat:" }), " ", deviceName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Waktu Pemulihan:" }), " ", timestamp] })] }) }));
exports.AllClearEmail = AllClearEmail;
