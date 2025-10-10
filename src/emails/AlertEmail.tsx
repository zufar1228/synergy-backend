// backend/src/emails/AlertEmail.tsx
import * as React from "react";

interface AlertEmailProps {
  incidentType: string;
  warehouseName: string;
  areaName: string;
  deviceName: string;
  timestamp: string; // Waktu dalam format lokal yang sudah diformat
  details: Array<{ key: string; value: string | number }>;
}

export const AlertEmail: React.FC<Readonly<AlertEmailProps>> = ({
  incidentType,
  warehouseName,
  areaName,
  deviceName,
  timestamp,
  details,
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
        border: "1px solid #ddd",
        borderRadius: "5px",
        padding: "20px",
      }}
    >
      <h1 style={{ color: "#d9534f" }}>Peringatan Kritis: {incidentType}</h1>
      <p>
        Sistem telah mendeteksi insiden yang memerlukan perhatian Anda segera.
      </p>
      <hr style={{ border: "none", borderTop: "1px solid #eee" }} />
      <h3 style={{ marginTop: "20px" }}>Detail Lokasi</h3>
      <p>
        <strong>Gudang:</strong> {warehouseName}
      </p>
      <p>
        <strong>Area:</strong> {areaName}
      </p>
      <p>
        <strong>Perangkat:</strong> {deviceName}
      </p>
      <p>
        <strong>Waktu Kejadian:</strong> {timestamp}
      </p>
      <hr style={{ border: "none", borderTop: "1px solid #eee" }} />
      <h3 style={{ marginTop: "20px" }}>Detail Data</h3>
      {details.map((detail) => (
        <p key={detail.key}>
          <strong>{detail.key}:</strong> {detail.value}
        </p>
      ))}
      <hr style={{ border: "none", borderTop: "1px solid #eee" }} />
      <p style={{ fontSize: "12px", color: "#888", marginTop: "20px" }}>
        Anda menerima email ini karena Anda berlangganan notifikasi untuk sistem
        ini. Ubah preferensi notifikasi Anda di pengaturan akun.
      </p>
    </div>
  </div>
);
