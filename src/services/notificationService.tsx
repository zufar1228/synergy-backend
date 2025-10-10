// backend/src/services/notificationService.ts
import { Resend } from "resend";
import { AlertEmail } from "../emails/AlertEmail";
import * as React from "react";
import { render } from "@react-email/render";
import { InviteEmail } from "../emails/InviteEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

// Gunakan 'typeof' untuk mendapatkan tipe props dari komponen
type AlertEmailProps = React.ComponentProps<typeof AlertEmail>;

interface EmailParams {
  to: string;
  subject: string;
  emailProps: AlertEmailProps;
}

export const sendAlertEmail = async ({
  to,
  subject,
  emailProps,
}: EmailParams) => {
  // Gunakan 'await' karena render bersifat async
  const emailHtml = await render(<AlertEmail {...emailProps} />);

  try {
    const { data, error } = await resend.emails.send({
      from: "Monitoring System <onboarding@resend.dev>",
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
  } catch (error) {
    console.error(`[Notification] Failed to send email to ${to}:`, error);
  }
};

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
      from: "Sistem Undangan <onboarding@resend.dev>",
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
