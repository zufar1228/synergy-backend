"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInviteEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// backend/src/services/notificationService.ts
const resend_1 = require("resend");
const InviteEmail_1 = require("../emails/InviteEmail");
const render_1 = require("@react-email/render");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
// Ganti "domain-anda-terverifikasi.com" dengan domain yang Anda verifikasi di Resend
const SENDER_DOMAIN = "synergyiot.ninja";
const sendInviteEmail = async ({ to, inviteLink, }) => {
    const emailHtml = await (0, render_1.render)((0, jsx_runtime_1.jsx)(InviteEmail_1.InviteEmail, { inviteLink: inviteLink }));
    try {
        const { data, error } = await resend.emails.send({
            // === UBAH INI ===
            from: `Sistem Undangan <invites@${SENDER_DOMAIN}>`,
            to: [to],
            subject: "Undangan untuk Bergabung dengan Platform Monitoring IoT",
            html: emailHtml,
        });
        if (error)
            throw error;
        console.log(`[Notification] Invite email sent successfully to ${to}`, data.id);
    }
    catch (error) {
        console.error(`[Notification] Failed to send invite email to ${to}:`, error);
        throw new Error("Gagal mengirim email undangan.");
    }
};
exports.sendInviteEmail = sendInviteEmail;
