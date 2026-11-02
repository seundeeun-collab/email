#!/bin/bash
pip install aiosmtpd flask flask-cors -q
rm -rf option2-raw-python/data && mkdir -p option2-raw-python/data/inbox
nohup python option2-raw-python/server.py --host 127.0.0.1 --port 1025 > server.log 2>&1 &
nohup python option2-raw-python/app.py > app.log 2>&1 &
sleep 3
python option2-raw-python/test_send.py --port 1025
echo "FREE READY http://localhost:5000"
ls option2-raw-python/data/inbox/
curl http://localhost:5000/api/emails
