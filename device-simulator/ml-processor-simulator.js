// device-simulator/ml-processor-simulator.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Simulate ML processing of pending images
async function processPendingImages() {
  console.log('🔍 Checking for pending images to process...');

  try {
    // 1. Get pending images
    const { data: pendingImages, error: fetchError } = await supabase
      .from('pending_images')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (fetchError) {
      console.error('❌ Error fetching pending images:', fetchError);
      return;
    }

    if (!pendingImages || pendingImages.length === 0) {
      console.log('📭 No pending images to process');
      return;
    }

    console.log(`📋 Found ${pendingImages.length} pending image(s) to process`);

    // 2. Process each image
    for (const image of pendingImages) {
      console.log(`\n🤖 Processing image: ${image.image_path}`);

      // Simulate ML detection (random detection for testing)
      const detected = true; // FORCE DETECTION FOR TESTING REPEAT
      const confidence = detected ? (Math.random() * 0.4 + 0.6) : 0; // 0.6-1.0 if detected

      let attributes = null;
      if (detected) {
        // FORCE EXACT SAME ATTRIBUTES FOR REPEAT TESTING - single person with red shirt
        attributes = [
          {
            confidence: Math.random() * 0.1 + 0.9,
            attributes: [
              { attribute: "person wearing a red shirt", confidence: Math.random() * 0.1 + 0.8 }
            ]
          }
        ];
      }

      // 3. Insert detection result into keamanan_logs
      const detectionData = {
        device_id: image.device_id,
        image_url: supabase.storage.from('captured_images').getPublicUrl(image.image_path).data.publicUrl,
        detected: detected,
        confidence: confidence,
        attributes: attributes,
        status: 'unacknowledged'
      };

      const { data: insertedLog, error: insertError } = await supabase
        .from('keamanan_logs')
        .insert([detectionData])
        .select();

      if (insertError) {
        console.error('❌ Error inserting keamanan log:', insertError);
        continue;
      }

      console.log('✅ Detection logged:', {
        id: insertedLog[0].id,
        detected: detected,
        confidence: confidence.toFixed(2),
        personCount: attributes ? attributes.length : 0
      });

      // 4. Update pending image status to processed
      const { error: updateError } = await supabase
        .from('pending_images')
        .update({ status: 'processed' })
        .eq('id', image.id);

      if (updateError) {
        console.error('❌ Error updating pending image status:', updateError);
      } else {
        console.log('✅ Pending image marked as processed');
      }

      // 5. If detection occurred, trigger repeat detection check
      if (detected && attributes && attributes.length > 0) {
        console.log('🔄 Checking for repeat detections...');
        // This would normally trigger the repeat detection service
        // For now, we'll just log it
        console.log('ℹ️  Repeat detection would be checked here');
      }
    }

    console.log('\n🎉 ML processing completed!');

  } catch (error) {
    console.error('💥 ML processing failed:', error);
  }
}

// Run the processor
if (require.main === module) {
  processPendingImages()
    .then(() => {
      console.log('🏁 ML Processor finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 ML Processor failed:', error);
      process.exit(1);
    });
}

module.exports = { processPendingImages };