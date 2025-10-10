"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const InviteEmail = ({ inviteLink, }) => ((0, jsx_runtime_1.jsx)("div", { style: {
        fontFamily: "sans-serif",
        padding: "20px",
        backgroundColor: "#f4f4f4",
    }, children: (0, jsx_runtime_1.jsxs)("div", { style: {
            maxWidth: "600px",
            margin: "auto",
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "5px",
        }, children: [(0, jsx_runtime_1.jsx)("h1", { style: { color: "#333" }, children: "Anda Diundang!" }), (0, jsx_runtime_1.jsx)("p", { children: "Anda telah diundang untuk bergabung dengan platform Monitoring IoT." }), (0, jsx_runtime_1.jsx)("p", { children: "Untuk menerima undangan dan mengatur akun Anda, silakan klik tombol di bawah ini:" }), (0, jsx_runtime_1.jsx)("a", { href: inviteLink, style: {
                    display: "inline-block",
                    padding: "12px 20px",
                    margin: "20px 0",
                    backgroundColor: "#007bff",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: "5px",
                    fontWeight: "bold",
                }, children: "Terima Undangan" }), (0, jsx_runtime_1.jsx)("p", { style: { fontSize: "12px", color: "#888" }, children: "Jika Anda tidak mengenali undangan ini, Anda bisa mengabaikan email ini dengan aman." })] }) }));
exports.InviteEmail = InviteEmail;
