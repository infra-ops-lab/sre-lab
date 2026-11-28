#!/usr/bin/env bash
# Module 5: is the orders service healthy, as its callers see it?
# Passes when 2 replicas are ready and a client in another namespace gets HTTP 200 from http://orders.orders/.
set -uo pipefail
ok=true

ready=$(kubectl -n orders get deploy orders -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
if [ "${ready:-0}" -ge 2 ]; then echo "PASS  2 replicas ready"
else echo "FAIL  ${ready:-0}/2 replicas ready"; ok=false; fi

code=$(kubectl -n ts-client exec client -- curl -s -m 3 -o /dev/null -w '%{http_code}' http://orders.orders/ 2>/dev/null)
if [ "$code" = "200" ]; then echo "PASS  client gets HTTP 200 from http://orders.orders/"
else echo "FAIL  client gets '${code:-no response}' from http://orders.orders/"; ok=false; fi

$ok && echo "Fixed." || exit 1
