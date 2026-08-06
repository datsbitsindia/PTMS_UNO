$ProjectDir = $PSScriptRoot
if (-not $ProjectDir) { $ProjectDir = "c:\Users\user\Documents\TODO\TaskManager" }
Set-Location $ProjectDir

# Start Node server in background hidden window
Start-Process -FilePath "node" -ArgumentList "app.js" -WorkingDirectory $ProjectDir -WindowStyle Hidden

# Wait 3 seconds for server & database connection to be ready
Start-Sleep -Seconds 3

# Launch PWA app window in Chrome or Edge
$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

if (Test-Path $ChromePath) {
    Start-Process -FilePath $ChromePath -ArgumentList "--app=http://localhost:3000"
} elseif (Test-Path $EdgePath) {
    Start-Process -FilePath $EdgePath -ArgumentList "--app=http://localhost:3000"
} else {
    Start-Process "http://localhost:3000"
}
