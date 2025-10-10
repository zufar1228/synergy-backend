"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const AlertEmail = ({ incidentType, warehouseName, areaName, deviceName, timestamp, details, }) => ((0, jsx_runtime_1.jsx)("div", { style: {
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
        }, children: [(0, jsx_runtime_1.jsxs)("h1", { style: { color: "#d9534f" }, children: ["Peringatan Kritis: ", incidentType] }), (0, jsx_runtime_1.jsx)("p", { children: "Sistem telah mendeteksi insiden yang memerlukan perhatian Anda segera." }), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: "20px" }, children: "Detail Lokasi" }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Gudang:" }), " ", warehouseName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Area:" }), " ", areaName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Perangkat:" }), " ", deviceName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Waktu Kejadian:" }), " ", timestamp] }), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: "20px" }, children: "Detail Data" }), details.map((detail) => ((0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsxs)("strong", { children: [detail.key, ":"] }), " ", detail.value] }, detail.key))), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("p", { style: { fontSize: "12px", color: "#888", marginTop: "20px" }, children: "Anda menerima email ini karena Anda berlangganan notifikasi untuk sistem ini. Ubah preferensi notifikasi Anda di pengaturan akun." })] }) }));
exports.AlertEmail = AlertEmail;
