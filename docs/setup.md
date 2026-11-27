# Lab environment

All labs run on a local **kind** cluster with a monitoring stack and a small demo service called **checkout**. You set it up once; every module reuses it.

## What you need

| Tool | Tested version | Notes |
|---|---|---|
| Docker (Desktop or Engine) | 29.6 | Give it at least **4 CPUs and 8 GB RAM** |
| kind | v0.33.0 | Node image Kubernetes **v1.37.0** |
| kubectl | v1.37 | |
| Helm | v3.16 | |

Clone the repository; lab files live in `labs/`:

```bash
git clone https://github.com/infra-ops-lab/sre-lab.git
cd sre-lab
```

## 1. Create the cluster

One control-plane node and two workers, so you can see scheduling and node failures later.

```bash
kind create cluster --config labs/setup/kind-config.yaml
kubectl get nodes
```

```text
NAME                    STATUS   ROLES           AGE   VERSION
sre-lab-control-plane   Ready    control-plane   60s   v1.37.0
sre-lab-worker          Ready    <none>          45s   v1.37.0
sre-lab-worker2         Ready    <none>          45s   v1.37.0
```

Right after `kind create`, nodes can show `NotReady` for about 30 seconds while the network plugin starts. That's normal; the next step waits for them anyway.

## 2. Install the monitoring stack

[kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) installs Prometheus, Alertmanager, Grafana, node-exporter and kube-state-metrics.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack --version 94.0.0 \
  -n monitoring --create-namespace -f labs/setup/monitoring-values.yaml --wait --timeout 10m
```

The values file (`labs/setup/monitoring-values.yaml`) makes Prometheus pick up **every** ServiceMonitor and PrometheusRule in the cluster, and turns off scraping of control-plane components that kind hides on localhost. Without that, you'd start with alerts that fire forever and that nobody can fix.

## 3. Deploy the demo service and its users

**checkout** is [podinfo](https://github.com/stefanprodan/podinfo), a small Go web service that exposes Prometheus metrics, with 3 replicas. **loadgen** sends it about 14 requests per second, like real users.

```bash
helm repo add podinfo https://stefanprodan.github.io/podinfo
helm install checkout podinfo/podinfo --version 6.17.0 -n shop --create-namespace \
  --set replicaCount=3 --set serviceMonitor.enabled=true --set serviceMonitor.interval=15s --wait
kubectl apply -f labs/app/loadgen.yaml
kubectl -n shop get pods
```

```text
NAME                                READY   STATUS    RESTARTS   AGE
checkout-podinfo-59d46f9b4f-j5w6c   1/1     Running   0          40s
checkout-podinfo-59d46f9b4f-s9mzb   1/1     Running   0          40s
checkout-podinfo-59d46f9b4f-t4qcs   1/1     Running   0          40s
loadgen-55c798bb87-6wcfj            1/1     Running   0          10s
```

You control how "unhappy" the users are with two settings. Labs tell you when to change them:

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=10   # 10% of requests hit an endpoint that returns 500
kubectl -n shop set env deploy/loadgen SLOW_PCT=5     # 5% of requests take 2 seconds
kubectl -n shop set env deploy/loadgen ERROR_PCT=0 SLOW_PCT=0   # back to healthy
```

## 4. Open the UIs

Run each in its own terminal (or add `&`):

```bash
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-alertmanager 9093:9093
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
```

| UI | URL | Login |
|---|---|---|
| Prometheus | <http://localhost:9090> | none |
| Alertmanager | <http://localhost:9093> | none |
| Grafana | <http://localhost:3000> | `admin` / `sre-lab` (local lab only) |

Check that Prometheus sees the users' traffic. In the Prometheus UI, run:

```promql
sum by (path, status) (rate(http_request_duration_seconds_count{namespace="shop"}[1m]))
```

```text
{path="root", status="200"}     14.21
{path="healthz", status="200"}  0.23
{path="readyz", status="200"}   0.23
{path="metrics", status="200"}  0.1
```

Notice that health checks and metric scrapes show up too. They are **not** users; Module 1 shows why that matters.

## Clean up

```bash
kind delete cluster --name sre-lab
```

You can recreate everything in about 10 minutes with the steps above.
