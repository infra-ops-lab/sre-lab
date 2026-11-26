#!/bin/bash
cd ~/sre-lab/app
if [ -f app.pid ] && kill "$(cat app.pid)" 2>/dev/null; then echo "stopped"; else echo "not running"; fi
rm -f app.pid
