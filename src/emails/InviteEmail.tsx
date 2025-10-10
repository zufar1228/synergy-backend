// backend/src/emails/InviteEmail.tsx
import * as React from "react";

interface InviteEmailProps {
  inviteLink: string;
}

export const InviteEmail: React.FC<Readonly<InviteEmailProps>> = ({
  inviteLink,
}) => (
  <div
    style={{
      fontFamily: "sans-serif",
      padding: "20px",
      backgroundColor: "#f4f4f4",
    }}
  >
    <div
      style={{
        maxWidth: "600px",
        margin: "auto",
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "5px",
      }}
    >
      <h1 style={{ color: "#333" }}>Anda Diundang!</h1>
      <p>Anda telah diundang untuk bergabung dengan platform Monitoring IoT.</p>
      <p>
        Untuk menerima undangan dan mengatur akun Anda, silakan klik tombol di
        bawah ini:
      </p>
      <a
        href={inviteLink}
        style={{
          display: "inline-block",
          padding: "12px 20px",
          margin: "20px 0",
          backgroundColor: "#007bff",
          color: "white",
          textDecoration: "none",
          borderRadius: "5px",
          fontWeight: "bold",
        }}
      >
        Terima Undangan
      </a>
      <p style={{ fontSize: "12px", color: "#888" }}>
        Jika Anda tidak mengenali undangan ini, Anda bisa mengabaikan email ini
        dengan aman.
      </p>
    </div>
  </div>
);
