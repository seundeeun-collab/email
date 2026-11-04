Write-Host "=== 100% FREE EMAIL ===" -F Green
pip install aiosmtpd flask flask-cors -q
Remove-Item -Recurse -Force option2-raw-python/data -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path option2-raw-python/data/inbox | Out-Null
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$PWD'; python option2-raw-python/server.py --host 127.0.0.1 --port 1025"
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$PWD'; python option2-raw-python/app.py"
Start-Sleep 4
python option2-raw-python/test_send.py --port 1025
Start-Process http://localhost:5000
