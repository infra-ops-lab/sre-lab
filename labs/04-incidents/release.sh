#!/usr/bin/env bash
# Game day: deploy release 2 of checkout, like a CD pipeline would.
set -euo pipefail
cd "$(dirname "$0")"
echo "$(date '+%H:%M:%S')  deploying checkout release 2 ..."
helm -n shop upgrade checkout podinfo/podinfo --version 6.17.0 --reuse-values -f release-2-values.yaml --wait >/dev/null
echo "$(date '+%H:%M:%S')  checkout release 2 deployed: $(helm -n shop history checkout --max 1 -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["description"])')"
