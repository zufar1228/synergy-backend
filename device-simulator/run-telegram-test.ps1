# PowerShell script to run automatic Telegram notification test
Write-Host "🚀 Starting Automatic Telegram Notification Test..." -ForegroundColor Green
Write-Host ""

Write-Host "📸 Step 1: Running simulator to upload images and create detections..." -ForegroundColor Yellow
Set-Location "c:\Users\FSOS\Documents\Magang SMT7\iot-monitoring-system\backend\device-simulator"
try {
    & node telegram-notification-simulator.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Simulator failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "❌ Simulator failed with error: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "📱 Step 2: Triggering automatic Telegram notification..." -ForegroundColor Yellow
Set-Location "c:\Users\FSOS\Documents\Magang SMT7\iot-monitoring-system\backend"
try {
    & npx ts-node -e "import('./src/services/repeatDetectionService').then(({ findAndNotifyRepeatDetections }) => findAndNotifyRepeatDetections().then(() => console.log('✅ Telegram notification sent!')).catch(console.error));"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Notification failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} catch {
    Write-Host "❌ Notification failed with error: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "🎉 SUCCESS! Check your Telegram group and frontend dashboard." -ForegroundColor Green
Write-Host "📱 Telegram: Security alert sent with real images" -ForegroundColor Cyan
Write-Host "🌐 Frontend: http://localhost:3000 (Keamanan section)" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"