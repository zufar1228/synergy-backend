# PowerShell script to run automatic Telegram notification test with deployed backend
Write-Host "🚀 Starting Automatic Telegram Notification Test (Deployed Backend)..." -ForegroundColor Green
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
Write-Host "📱 Step 2: Triggering automatic Telegram notification via deployed API..." -ForegroundColor Yellow

# Replace YOUR_JWT_TOKEN_HERE with your actual JWT token
$jwtToken = "YOUR_JWT_TOKEN_HERE"

try {
    $response = Invoke-RestMethod -Uri "https://api.synergyiot.ninja/api/keamanan/trigger-repeat-detection" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $jwtToken"
        } `
        -ErrorAction Stop

    Write-Host "✅ API call successful!" -ForegroundColor Green
} catch {
    Write-Host "❌ API call failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Make sure to replace YOUR_JWT_TOKEN_HERE with a valid JWT token" -ForegroundColor Yellow
    Write-Host "🔑 Get a JWT token by logging into https://synergyiot.ninja and checking browser dev tools" -ForegroundColor Yellow
    Write-Host "   Look for 'authorization' header in Network tab when making API calls" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "🎉 SUCCESS! Check your Telegram group and deployed frontend dashboard." -ForegroundColor Green
Write-Host "📱 Telegram: Security alert sent with real images" -ForegroundColor Cyan
Write-Host "🌐 Frontend: https://synergyiot.ninja (Keamanan section)" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Note: Make sure to replace YOUR_JWT_TOKEN_HERE with your actual JWT token" -ForegroundColor Yellow
Write-Host "🔑 You can get the token from browser dev tools after logging into the frontend" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"