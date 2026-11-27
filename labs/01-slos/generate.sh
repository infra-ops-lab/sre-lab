#!/usr/bin/env bash
# Turn checkout-slos.yaml into a PrometheusRule (recording rules + multi-window burn-rate alerts).
set -euo pipefail
cd "$(dirname "$0")"
docker run --rm -v "$PWD:/work" -w /work ghcr.io/slok/sloth:v0.16.0 \
  generate -i checkout-slos.yaml -o checkout-slo-rules.yaml
echo "wrote checkout-slo-rules.yaml"
