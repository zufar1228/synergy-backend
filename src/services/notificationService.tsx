// backend/src/services/notificationService.ts
import { Resend } from "resend";
import { AlertEmail } from "../emails/AlertEmail";
import { RepeatAlertEmail } from "../emails/RepeatAlertEmail";
import { InviteEmail } from "../emails/InviteEmail";
import { render } from "@react-email/render";

const resend = new Resend(process.env.RESEND_API_KEY);

// Ganti "domain-anda-terverifikasi.com" dengan domain yang Anda verifikasi di Resend
const SENDER_DOMAIN = "synergyiot.tech";

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

// TAMBAHKAN FUNGSI BARU INI
export const sendRepeatAlertEmail = async ({
  to,
  subject,
  emailProps,
}: {
  to: string;
  subject: string;
  emailProps: React.ComponentProps<typeof RepeatAlertEmail>;
}) => {
  const emailHtml = await render(<RepeatAlertEmail {...emailProps} />);

  try {
    const { data, error } = await resend.emails.send({
      // === UBAH INI ===
      from: `Peringatan Keamanan <security@${SENDER_DOMAIN}>`,
      to: [to],
      subject: subject,
      html: emailHtml,
    });
    if (error) throw error;
    console.log(`[Notification] Repeat alert email sent to ${to}`, data.id);
  } catch (error) {
    console.error(
      `[Notification] Failed to send repeat alert email to ${to}:`,
      error
    );
    throw new Error("Gagal mengirim email peringatan berulang.");
  }
};
