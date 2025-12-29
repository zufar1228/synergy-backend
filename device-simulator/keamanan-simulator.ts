// backend/device-simulator/keamanan-simulator.ts
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Device ID for testing (you may need to change this to an actual keamanan device)
const TEST_DEVICE_ID = "4cd41258-296f-4c30-8e22-c0dab7d4f950"; // Kamera Keamanan 1 - UPDATED

interface KeamananDetection {
  device_id: string;
  image_url: string;
  detected: boolean;
  box: any;
  confidence: number;
  attributes: any[];
}

async function simulateKeamananDetection() {
  console.log("🛡️ Starting Keamanan Detection Simulation...");

  // Simulate a person detection
  const detection: KeamananDetection = {
    device_id: TEST_DEVICE_ID,
    image_url: "https://example.com/detection-image.jpg", // Placeholder image URL
    detected: true,
    box: { x1: 100, y1: 50, x2: 200, y2: 200 },
    confidence: 0.85,
    attributes: [
      { attribute: "person wearing a blue shirt", confidence: 0.92 },
      { attribute: "person wearing a hat", confidence: 0.88 }
    ]
  };

  try {
    // Insert detection into database
    const { data, error } = await supabase
      .from('keamanan_logs')
      .insert([{
        id: randomUUID(),
        device_id: detection.device_id,
        image_url: detection.image_url,
        detected: detection.detected,
        box: detection.box,
        confidence: detection.confidence,
        attributes: detection.attributes,
        status: 'unacknowledged'
      }])
      .select();

    if (error) {
      console.error("❌ Error inserting keamanan log:", error);
      return;
    }

    console.log("✅ Keamanan detection logged successfully:", data[0]);

    // Wait a bit and create another detection to trigger repeat detection
    console.log("⏳ Waiting 2 minutes before creating repeat detection...");
    await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));

    // Create a repeat detection with same attributes
    const repeatDetection = {
      ...detection,
      id: randomUUID(),
      confidence: 0.92 // Slightly higher confidence
    };

    const { data: repeatData, error: repeatError } = await supabase
      .from('keamanan_logs')
      .insert([{
        id: repeatDetection.id,
        device_id: repeatDetection.device_id,
        image_url: repeatDetection.image_url,
        detected: repeatDetection.detected,
        box: repeatDetection.box,
        confidence: repeatDetection.confidence,
        attributes: repeatDetection.attributes,
        status: 'unacknowledged'
      }])
      .select();

    if (repeatError) {
      console.error("❌ Error inserting repeat detection:", repeatError);
      return;
    }

    console.log("✅ Repeat detection logged successfully:", repeatData[0]);
    console.log("🎯 Repeat detection should trigger notification within 15 minutes!");

  } catch (error) {
    console.error("❌ Simulation failed:", error);
  }
}

// Run the simulation
if (require.main === module) {
  simulateKeamananDetection()
    .then(() => {
      console.log("🏁 Simulation completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Simulation failed:", error);
      process.exit(1);
    });
}

export { simulateKeamananDetection };