#!/usr/bin/env bash
# Print the notifications Alertmanager sent to the fake pager and ticket queue, one line each.
#   ./labs/03-alerting/show-notifications.sh          # last hour
#   ./labs/03-alerting/show-notifications.sh 10m      # last 10 minutes
#   ./labs/03-alerting/show-notifications.sh 24h count  # how many notifications per alert
set -euo pipefail
since="${1:-1h}"
mode="${2:-list}"

read -r -d '' PARSE <<'PY' || true
import json, os, sys
from datetime import datetime
receiver = os.environ["RECEIVER"]
for line in sys.stdin:
    ts, _, rest = line.partition(" ")
    if "{" not in rest:
        continue
    try:
        req = json.loads(rest[rest.index("{"):])
        body = req.get("json") or json.loads(req["body"])
    except (ValueError, KeyError, TypeError):
        continue
    for a in body.get("alerts", []):
        labels = a["labels"]
        local = datetime.fromisoformat(ts[:19] + "+00:00").astimezone().strftime("%H:%M:%S")
        print("%s  %-8s %-9s %-32s severity=%-7s %s" % (
            local, receiver, a["status"], labels.get("alertname", ""),
            labels.get("severity", ""), a["annotations"].get("runbook_url", "")))
PY

for receiver in pager tickets; do
  kubectl -n monitoring logs "deploy/$receiver" --since="$since" --timestamps 2>/dev/null \
    | RECEIVER="$receiver" python3 -c "$PARSE"
done | sort | if [ "$mode" = count ]; then
  awk '$3 == "firing" { n[$2 " " $4 " " $5]++ } END { for (k in n) printf "%4d  %s\n", n[k], k }' | sort -rn
else
  cat
fi
