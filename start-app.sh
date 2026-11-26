#!/bin/bash
# Starts the SRE practice app at http://localhost:4300 in the background and opens it.
cd ~/sre-lab/app
if [ -f app.pid ] && kill -0 "$(cat app.pid)" 2>/dev/null; then echo "already running (pid $(cat app.pid))"; else
  nohup python3 server.py > app.log 2>&1 < /dev/null &
  echo $! > app.pid
  for i in $(seq 1 20); do curl -s -o /dev/null http://localhost:4300/ && break; sleep 0.5; done
fi
echo "SRE practice app: http://localhost:4300   (stop: ~/sre-lab/stop-app.sh)"
[ "${1:-}" = "--no-open" ] || open http://localhost:4300
