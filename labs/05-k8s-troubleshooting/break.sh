#!/usr/bin/env bash
# Module 5: deploy the "orders" service with one hidden problem.
#   ./labs/05-k8s-troubleshooting/break.sh 3     # scenario 3
#   ./labs/05-k8s-troubleshooting/break.sh reset # remove everything
# Don't read the rest of this file until you've solved the scenario: in real life nobody tells you what broke.
set -euo pipefail
n="${1:?usage: break.sh <1-8|reset>}"

kubectl delete namespace orders --ignore-not-found --wait=true >/dev/null
[ "$n" = reset ] && { kubectl delete namespace ts-client --ignore-not-found >/dev/null; echo "removed"; exit 0; }

# A client in another namespace, standing in for the services that call orders.
kubectl create namespace ts-client --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n ts-client get pod client >/dev/null 2>&1 || \
  kubectl -n ts-client run client --image=curlimages/curl:8.17.0 --restart=Never --command -- sleep infinity >/dev/null

image="ghcr.io/stefanprodan/podinfo:6.17.0"
args='["./podinfo", "--port=9898", "--level=info"]'
cpu="10m"; mem_request="32Mi"; mem_limit="128Mi"; ready_path="/readyz"; svc_app="orders"; env=""; policy=""

case "$n" in
  1) image="ghcr.io/stefanprodan/podinfo:6.17.9" ;;
  2) args='["./podinfo", "--port=9898", "--level=info", "--ui-colour=green"]' ;;
  3) mem_request="8Mi"; mem_limit="8Mi" ;;
  4) cpu="40" ;;
  5) env='
          env:
            - name: DB_PASSWORD
              valueFrom: { secretKeyRef: { name: orders-db, key: password } }' ;;
  6) ready_path="/ready" ;;
  7) svc_app="order" ;;
  8) policy='
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-ingress, namespace: orders }
spec: { podSelector: {}, policyTypes: [Ingress] }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-same-namespace, namespace: orders }
spec:
  podSelector: {}
  ingress: [{ from: [{ podSelector: {} }] }]' ;;
  *) echo "unknown scenario: $n"; exit 1 ;;
esac

kubectl apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Namespace
metadata: { name: orders }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: orders, namespace: orders, labels: { app: orders } }
spec:
  replicas: 2
  selector: { matchLabels: { app: orders } }
  template:
    metadata: { labels: { app: orders } }
    spec:
      containers:
        - name: orders
          image: ${image}
          command: ${args}
          ports: [{ name: http, containerPort: 9898 }]${env}
          readinessProbe:
            httpGet: { path: ${ready_path}, port: http }
            periodSeconds: 5
          resources:
            requests: { cpu: "${cpu}", memory: ${mem_request} }
            limits: { memory: ${mem_limit} }
---
apiVersion: v1
kind: Service
metadata: { name: orders, namespace: orders }
spec:
  selector: { app: ${svc_app} }
  ports: [{ name: http, port: 80, targetPort: http }]
${policy}
EOF
echo "Scenario $n deployed. Users report that orders isn't working. Check with:"
echo "  ./labs/05-k8s-troubleshooting/check.sh"
