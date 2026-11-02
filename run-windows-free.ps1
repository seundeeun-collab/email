Write-Host '=== Virtual Email 100% FREE - No Buying ===' -ForegroundColor Green
pip install aiosmtpd flask flask-cors --quiet
Remove-Item -Recurse -Force option2-raw-python/data -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path option2-raw-python/data/inbox | Out-Null
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
Write-Host 'Starting SMTP 127.0.0.1:1025...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$PWD'; python option2-raw-python/server.py --host 127.0.0.1 --port 1025"
Write-Host 'Starting Web http://localhost:5000...' -ForegroundColor Yellow
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$PWD'; python option2-raw-python/app.py"
Start-Sleep 4
Write-Host 'Creating 6 test emails...' -ForegroundColor Yellow
python option2-raw-python/test_send.py --port 1025
python option2-raw-python/test_send.py --port 1025 --to support@yourdomain.com,hello@yourdomain.com,myvirtualbox@yourdomain.com
Get-ChildItem option2-raw-python/data/inbox/ | Format-Table
Invoke-RestMethod http://localhost:5000/api/emails | ConvertTo-Json -Depth 2
Start-Process http://localhost:5000
Write-Host 'FREE READY - http://localhost:5000 - catch-all works - No buying' -ForegroundColor Green
