@echo off
echo 🚀 Starting Automatic Telegram Notification Test...
echo.

echo 📸 Step 1: Running simulator to upload images and create detections...
cd "c:\Users\FSOS\Documents\Magang SMT7\iot-monitoring-system\backend\device-simulator"
node telegram-notification-simulator.js

if %errorlevel% neq 0 (
    echo ❌ Simulator failed!
    pause
    exit /b 1
)

echo.
echo 📱 Step 2: Triggering automatic Telegram notification...
cd "c:\Users\FSOS\Documents\Magang SMT7\iot-monitoring-system\backend"
npx ts-node -e "import('./src/services/repeatDetectionService').then(({ findAndNotifyRepeatDetections }) => findAndNotifyRepeatDetections().then(() => console.log('✅ Telegram notification sent!')).catch(console.error));"

if %errorlevel% neq 0 (
    echo ❌ Notification failed!
    pause
    exit /b 1
)

echo.
echo 🎉 SUCCESS! Check your Telegram group and frontend dashboard.
echo 📱 Telegram: Security alert sent with real images
echo 🌐 Frontend: http://localhost:3000 (Keamanan section)
echo.
pause