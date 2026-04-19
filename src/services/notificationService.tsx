/**
 * @file notificationService.tsx
 * @purpose Email sending service using Resend + React Email templates
 * @usedBy userService (invite flow)
 * @deps resend, InviteEmail template, @react-email/render
 * @exports sendInviteEmail
 * @sideEffects Resend API call (email delivery)
 */

import { Resend } from "resend";
import { InviteEmail } from "../emails/InviteEmail";
import { render } from "@react-email/render";

const resend = new Resend(process.env.RESEND_API_KEY);

// Ganti "domain-anda-terverifikasi.com" dengan domain yang Anda verifikasi di Resend
const SENDER_DOMAIN = "synergyiot.ninja";

export const sendInviteEmail = async ({
  to,
  inviteLink,
}: {
  to: string;
  inviteLink: string;
}) => {
  const emailHtml = await render(<InviteEmail inviteLink={inviteLink} />);

  try {
    const { data, error } = await resend.emails.send({
      // === UBAH INI ===
      from: `Sistem Undangan <invites@${SENDER_DOMAIN}>`,
      to: [to],
      subject: "Undangan untuk Bergabung dengan Platform Monitoring IoT",
      html: emailHtml,
    });
    if (error) throw error;
    console.log(
      `[Notification] Invite email sent successfully to ${to}`,
      data.id
    );
  } catch (error) {
    console.error(
      `[Notification] Failed to send invite email to ${to}:`,
      error
    );
    throw new Error("Gagal mengirim email undangan.");
  }
};
