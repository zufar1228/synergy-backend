"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRepeatAlertEmail = exports.sendInviteEmail = exports.sendAlertEmail = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// backend/src/services/notificationService.ts
const resend_1 = require("resend");
const AlertEmail_1 = require("../emails/AlertEmail");
const RepeatAlertEmail_1 = require("../emails/RepeatAlertEmail");
const InviteEmail_1 = require("../emails/InviteEmail");
const render_1 = require("@react-email/render");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
// Ganti "domain-anda-terverifikasi.com" dengan domain yang Anda verifikasi di Resend
const SENDER_DOMAIN = "synergyiot.tech";
const sendAlertEmail = async ({ to, subject, emailProps, }) => {
    // Gunakan 'await' karena render bersifat async
    const emailHtml = await (0, render_1.render)((0, jsx_runtime_1.jsx)(AlertEmail_1.AlertEmail, { ...emailProps }));
    try {
        const { data, error } = await resend.emails.send({
            // === UBAH INI ===
            from: `Peringatan <no-reply@${SENDER_DOMAIN}>`,
            to: [to],
            subject: subject,
            html: emailHtml,
        });
        // Cek jika ada error dari Resend
        if (error) {
            console.error(`[Notification] Resend error for ${to}:`, error);
            return;
        }
        console.log(`[Notification] Email sent successfully to ${to}`, data.id);
    }
    catch (error) {
        console.error(`[Notification] Failed to send email to ${to}:`, error);
    }
};
exports.sendAlertEmail = sendAlertEmail;
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
// TAMBAHKAN FUNGSI BARU INI
const sendRepeatAlertEmail = async ({ to, subject, emailProps, }) => {
    const emailHtml = await (0, render_1.render)((0, jsx_runtime_1.jsx)(RepeatAlertEmail_1.RepeatAlertEmail, { ...emailProps }));
    try {
        const { data, error } = await resend.emails.send({
            // === UBAH INI ===
            from: `Peringatan Keamanan <security@${SENDER_DOMAIN}>`,
            to: [to],
            subject: subject,
            html: emailHtml,
        });
        if (error)
            throw error;
        console.log(`[Notification] Repeat alert email sent to ${to}`, data.id);
    }
    catch (error) {
        console.error(`[Notification] Failed to send repeat alert email to ${to}:`, error);
        throw new Error("Gagal mengirim email peringatan berulang.");
    }
};
exports.sendRepeatAlertEmail = sendRepeatAlertEmail;
