// backend/src/emails/RepeatAlertEmail.tsx
import * as React from "react";

interface RepeatAlertEmailProps {
  warehouseName: string;
  areaName: string;
  attributes: string;
  detectionCount: number;
  durationMinutes: number;
  firstSeen: string;
  lastSeen: string;
  imageUrl: string;
}

export const RepeatAlertEmail: React.FC<Readonly<RepeatAlertEmailProps>> = ({
  warehouseName,
  areaName,
  attributes,
  detectionCount,
  durationMinutes,
  firstSeen,
  lastSeen,
  imageUrl,
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
      <h1 style={{ color: "#d9534f" }}>Peringatan Keamanan Berulang</h1>
      <p>
        Sistem telah mendeteksi individu yang sama berulang kali di area
        terlarang.
      </p>

      <div style={{ padding: "10px 0" }}>
        <img
          src={imageUrl}
          alt="Deteksi Terakhir"
          style={{ width: "100%", borderRadius: "5px" }}
        />
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #eee" }} />

      <h3 style={{ marginTop: "20px" }}>Detail Deteksi</h3>
      <p>
        <strong>Ciri-ciri:</strong> {attributes}
      </p>
      <p>
        <strong>Lokasi:</strong> {warehouseName} - {areaName}
      </p>
      <p>
        <strong>Total Deteksi:</strong> {detectionCount} kali dalam{" "}
        {durationMinutes} menit
      </p>
      <p>
        <strong>Pertama Terlihat:</strong> {firstSeen}
      </p>
      <p>
        <strong>Terakhir Terlihat:</strong> {lastSeen}
      </p>

      <hr style={{ border: "none", borderTop: "1px solid #eee" }} />

      <p style={{ fontSize: "12px", color: "#888", marginTop: "20px" }}>
        Ini adalah notifikasi otomatis. Harap segera tindak lanjuti.
      </p>
    </div>
  </div>
);
