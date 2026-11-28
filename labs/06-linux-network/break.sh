#!/usr/bin/env bash
# Module 6: introduce one problem into the lab6 "api" pod.
#   ./labs/06-linux-network/break.sh 2       # scenario 2
#   ./labs/06-linux-network/break.sh reset   # back to a clean api pod
# Don't read the rest of this file until you've solved the scenario.
set -euo pipefail
n="${1:?usage: break.sh <1-4|reset>}"

# Every scenario starts from a fresh api pod: a restart clears the network settings,
# stops leftover processes and empties the /data volume.
kubectl -n lab6 rollout restart deploy/api >/dev/null
kubectl -n lab6 rollout status deploy/api --timeout=120s >/dev/null
pod=$(kubectl -n lab6 get pods -l app=api --no-headers | awk '$3 == "Running" { print $1; exit }')
net() { kubectl -n lab6 exec "$pod" -c net -- "$@"; }
app() { kubectl -n lab6 exec "$pod" -c app -- "$@"; }

case "$n" in
  reset) echo "api pod restarted: clean"; exit 0 ;;
  1) net tc qdisc add dev eth0 root netem delay 150ms ;;
  2) net tc qdisc add dev eth0 root netem loss 15% ;;
  3) app sh -c 'printf "while :; do :; done\n" > /tmp/report-builder.sh
                for i in 1 2; do nohup sh /tmp/report-builder.sh >/dev/null 2>&1 & done' ;;
  4) app sh -c 'mkdir -p /data/.cache && dd if=/dev/zero of=/data/.cache/thumbnails.tmp bs=1M count=40 2>/dev/null || true' ;;
  *) echo "unknown scenario: $n"; exit 1 ;;
esac
echo "Scenario $n is live. Users say the api is misbehaving. Investigate from the toolbox:"
echo "  kubectl -n lab6 exec -it toolbox -- bash"
