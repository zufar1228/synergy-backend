// backend/src/emails/AllClearEmail.tsx
import * as React from "react";

interface AllClearEmailProps {
  warehouseName: string;
  areaName: string;
  deviceName: string;
  timestamp: string;
}

export const AllClearEmail: React.FC<Readonly<AllClearEmailProps>> = ({
  warehouseName,
  areaName,
  deviceName,
  timestamp,
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
      <h1 style={{ color: "#28a745" }}>Sistem Kembali Normal</h1>
      <p>Sistem ventilasi di area berikut telah kembali ke kondisi normal.</p>
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
        <strong>Waktu Pemulihan:</strong> {timestamp}
      </p>
    </div>
  </div>
);
