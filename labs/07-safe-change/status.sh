#!/usr/bin/env bash
# Module 7: one-line status of the payments rollout, its analysis, and which version each pod runs.
#   watch -n 10 ./labs/07-safe-change/status.sh
set -uo pipefail
kubectl -n pay get rollout payments -o jsonpath='{"rollout:  "}{.status.phase}{"  step "}{.status.currentStepIndex}{"  "}{.status.message}{"\n"}'
kubectl -n pay get analysisrun --sort-by=.metadata.creationTimestamp -o jsonpath='{range .items[*]}{"analysis: "}{.metadata.name}{"  "}{.status.phase}{"  "}{range .status.metricResults[*].measurements[*]}{.value}{" "}{end}{"\n"}{end}' 2>/dev/null | tail -2
echo "pods by version:"
kubectl -n pay get pods -l app=payments -L rollouts-pod-template-hash --no-headers | awk '{print "  " $NF "  " $3}' | sort | uniq -c
