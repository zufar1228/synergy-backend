@echo off
echo 🚀 Starting Automatic Telegram Notification Test (Deployed Backend)...
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
echo 📱 Step 2: Triggering automatic Telegram notification via deployed API...
curl -X POST "https://api.synergyiot.ninja/api/keamanan/trigger-repeat-detection" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" ^
  --silent --show-error

if %errorlevel% neq 0 (
    echo ❌ API call failed! Make sure to replace YOUR_JWT_TOKEN_HERE with a valid JWT token
    echo 💡 Get a JWT token by logging into the frontend and checking browser dev tools
    pause
    exit /b 1
)

echo.
echo 🎉 SUCCESS! Check your Telegram group and deployed frontend dashboard.
echo 📱 Telegram: Security alert sent with real images
echo 🌐 Frontend: https://synergyiot.ninja (Keamanan section)
echo.
echo 📝 Note: Make sure to replace YOUR_JWT_TOKEN_HERE with your actual JWT token
echo 🔑 You can get the token from browser dev tools after logging into the frontend
echo.
pause