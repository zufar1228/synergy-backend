"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepeatAlertEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const RepeatAlertEmail = ({ warehouseName, areaName, attributes, detectionCount, durationMinutes, firstSeen, lastSeen, imageUrl, }) => ((0, jsx_runtime_1.jsx)("div", { style: {
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
        }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { color: "#d9534f" }, children: "Peringatan Keamanan Berulang" }), (0, jsx_runtime_1.jsx)("p", { children: "Sistem telah mendeteksi individu yang sama berulang kali di area terlarang." }), (0, jsx_runtime_1.jsx)("div", { style: { padding: "10px 0" }, children: (0, jsx_runtime_1.jsx)("img", { src: imageUrl, alt: "Deteksi Terakhir", style: { width: "100%", borderRadius: "5px" } }) }), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("h3", { style: { marginTop: "20px" }, children: "Detail Deteksi" }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Ciri-ciri:" }), " ", attributes] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Lokasi:" }), " ", warehouseName, " - ", areaName] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Total Deteksi:" }), " ", detectionCount, " kali dalam", " ", durationMinutes, " menit"] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Pertama Terlihat:" }), " ", firstSeen] }), (0, jsx_runtime_1.jsxs)("p", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Terakhir Terlihat:" }), " ", lastSeen] }), (0, jsx_runtime_1.jsx)("hr", { style: { border: "none", borderTop: "1px solid #eee" } }), (0, jsx_runtime_1.jsx)("p", { style: { fontSize: "12px", color: "#888", marginTop: "20px" }, children: "Ini adalah notifikasi otomatis. Harap segera tindak lanjuti." })] }) }));
exports.RepeatAlertEmail = RepeatAlertEmail;
