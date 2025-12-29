// telegram-notification-simulator.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Device ID for keamanan system
const DEVICE_ID = "4cd41258-296f-4c30-8e22-c0dab7d4f950";
const BUCKET_NAME = 'captured_images';
const LOCAL_IMAGE_PATH = path.join(__dirname, 'test.jpg');

/**
 * Upload image to Supabase storage and return the public URL
 */
async function uploadImageToStorage(imageIndex) {
  console.log(`📤 Uploading test.jpg as image ${imageIndex}...`);

  // Read the image file
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(LOCAL_IMAGE_PATH);
  } catch (e) {
    console.error(`❌ Failed to read test.jpg: ${e.message}`);
    throw new Error('Image file not found');
  }

  // Create unique filename
  const image_path = `${DEVICE_ID}/telegram-sim-${imageIndex}-${Date.now()}.jpg`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(image_path, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (uploadError) {
    console.error("❌ Upload failed:", uploadError.message);
    throw new Error('Upload failed');
  }

  // Get public URL
  const imageUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(image_path).data.publicUrl;
  console.log(`✅ Image ${imageIndex} uploaded:`, imageUrl);

  return imageUrl;
}

/**
 * Simulate repeat person detections to trigger Telegram notifications
 */
async function simulateRepeatDetections() {
  console.log('🚨 Starting Telegram Notification Simulation with Real Images...');

  try {
    // First, upload 3 copies of the test image
    console.log('📸 Uploading test images to Supabase...');
    const imageUrls = [];
    for (let i = 1; i <= 3; i++) {
      const imageUrl = await uploadImageToStorage(i);
      imageUrls.push(imageUrl);
    }

    console.log('✅ All images uploaded successfully!');

    // Create 3 detections of the same person within 15 SECONDS
    const baseTime = new Date();

    // Detection 1: 12 seconds ago
    const detection1Time = new Date(baseTime.getTime() - 12 * 1000);

    // Detection 2: 8 seconds ago
    const detection2Time = new Date(baseTime.getTime() - 8 * 1000);

    // Detection 3: Just now (4 seconds ago)
    const detection3Time = new Date(baseTime.getTime() - 4 * 1000);

    console.log('📝 Creating 3 repeat detections with real image URLs...');

    // Same person attributes for all detections (green shirt person - different from previous)
    const personAttributes = [
      {
        confidence: 0.96,
        attributes: [
          {
            attribute: "person wearing a green shirt",
            confidence: 0.88
          }
        ]
      }
    ];

    // Insert Detection 1
    const { data: log1, error: error1 } = await supabase
      .from('keamanan_logs')
      .insert({
        device_id: DEVICE_ID,
        image_url: imageUrls[0],
        detected: true,
        confidence: 0.92,
        attributes: personAttributes,
        status: 'unacknowledged',
        created_at: detection1Time.toISOString()
      })
      .select();

    if (error1) {
      console.error('❌ Error creating detection 1:', error1);
      return;
    }
    console.log('✅ Detection 1 created:', log1[0].id);

    // Insert Detection 2
    const { data: log2, error: error2 } = await supabase
      .from('keamanan_logs')
      .insert({
        device_id: DEVICE_ID,
        image_url: imageUrls[1],
        detected: true,
        confidence: 0.88,
        attributes: personAttributes,
        status: 'unacknowledged',
        created_at: detection2Time.toISOString()
      })
      .select();

    if (error2) {
      console.error('❌ Error creating detection 2:', error2);
      return;
    }
    console.log('✅ Detection 2 created:', log2[0].id);

    // Insert Detection 3
    const { data: log3, error: error3 } = await supabase
      .from('keamanan_logs')
      .insert({
        device_id: DEVICE_ID,
        image_url: imageUrls[2],
        detected: true,
        confidence: 0.91,
        attributes: personAttributes,
        status: 'unacknowledged',
        created_at: detection3Time.toISOString()
      })
      .select();

    if (error3) {
      console.error('❌ Error creating detection 3:', error3);
      return;
    }
    console.log('✅ Detection 3 created:', log3[0].id);

    console.log('\n🎯 Repeat detections with REAL images created successfully!');
    console.log('🔄 To trigger Telegram notification, run this command from backend folder:');
    console.log('   node -e "const { findAndNotifyRepeatDetections } = require(\'./dist/services/repeatDetectionService.js\'); findAndNotifyRepeatDetections().then(() => console.log(\'✅ Telegram notification sent!\')).catch(console.error);"');

    console.log('\n✅ Telegram notification simulation setup completed!');
    console.log('📲 Run the above command to send the Telegram alert.');
    console.log('🌐 Check your frontend to see the real uploaded images!');

  } catch (error) {
    console.error('💥 Simulation failed:', error);
  }
}

// Run the simulation
if (require.main === module) {
  simulateRepeatDetections()
    .then(() => {
      console.log('🏁 Simulation finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Simulation failed:', error);
      process.exit(1);
    });
}

module.exports = { simulateRepeatDetections };