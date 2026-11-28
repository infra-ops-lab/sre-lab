# Lab: A canary that rolls itself back

In this lab you deploy a **payments** service with Argo Rollouts, ship a good release as a canary, then ship Module 4's bad release again. This time, automated analysis catches it on one pod and rolls it back on its own.

| | |
|---|---|
| **Time** | About 45 minutes |
| **You need** | The [lab environment](../setup.md) running, with Prometheus on <http://localhost:9090> |
| **Files** | `labs/07-safe-change/` |

## Part 1: Install Argo Rollouts and payments

[Argo Rollouts](https://argo-rollouts.readthedocs.io/) adds a `Rollout` resource: a Deployment with canary and blue-green strategies, and analysis.

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm install argo-rollouts argo/argo-rollouts --version 2.43.12 -n argo-rollouts --create-namespace \
  --set dashboard.enabled=true --wait
kubectl apply -f labs/07-safe-change/payments.yaml
```

Open `labs/07-safe-change/payments.yaml` and read it.

**Task:** answer from the file:

1. What are the canary steps, and how many pods run the new version at the first step?
2. What does the analysis measure, how often, and when does it fail the rollout?
3. How does Prometheus know which version each pod runs?

??? success "Solution"
    1. **20%** (1 of 5 pods) for 2 minutes, then **60%** for 1 minute, then 100%. Without a service mesh, the weight is a share of **pods**, so it's approximate: each pod gets about the same share of requests.
    2. The **5xx ratio of the canary pods only**, every 30 seconds after a 60-second delay. `successCondition: result[0] < 0.02`: under 2% passes. `failureLimit: 1`: the second failed measurement aborts the rollout.
    3. The ServiceMonitor has `podTargetLabels: [rollouts-pod-template-hash]`, so every metric from a pod gets a `rollouts_pod_template_hash` label. Each version of the pod template has its own hash, and the analysis query selects the canary's.

Wait about a minute for the pods, then check the status with the lab's helper script:

```bash
./labs/07-safe-change/status.sh
```

```text
rollout:  Healthy  step 4
pods by version:
   5   6ff7b4fcf4  Running
```

Optional: the Argo Rollouts dashboard shows the same thing graphically. Run `kubectl -n argo-rollouts port-forward svc/argo-rollouts-dashboard 3100:3100` open <http://localhost:3100>, and choose the `pay` namespace.

## Part 2: A good release

Release v2 changes only the UI message. Ship it, by changing the pod template as a CD pipeline would:

```bash
kubectl -n pay patch rollout payments --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["./podinfo","--port=9898","--level=info","--ui-message=payments v2"]}]'
watch -n 10 ./labs/07-safe-change/status.sh
```

(No `watch` on your system? Run `status.sh` by hand every 15 seconds.)

**Task:** follow the rollout. How long does it take, and what does the analysis record?

??? success "What you see"
    | Time | Status |
    |---|---|
    | 0:15 | `Paused step 1`: 1 pod on v2, 4 on v1 |
    | 2:00 | `Progressing step 2`, then `Paused step 3`: 3 pods on v2 |
    | 3:20 | `Healthy step 4`: all 5 pods on v2 |

    ```text
    analysis: payments-69774c57f7-2  Successful  [0] [0] [0] [0] [0]
    ```

    Five measurements, all with a 0% error ratio, and the rollout promoted itself. Nobody had to watch a dashboard.

## Part 3: The bad release, again

Release v3 is Module 4's release 2: podinfo's random-error fault, which returns 500, 400 and 409 responses.

**Task:** predict what happens: how long until something reacts, how many pods get v3, and what users see. Then ship it:

```bash
kubectl -n pay patch rollout payments --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["./podinfo","--port=9898","--level=info","--ui-message=payments v3","--random-error=true"]}]'
watch -n 10 ./labs/07-safe-change/status.sh
```

??? success "What you see"
    ```text
    rollout:  Degraded  step 0  RolloutAborted: Rollout aborted update to revision 3: Background analysis
              phase error/failed: Metric "error-ratio" assessed Failed due to failed (2) > failureLimit (1)
    analysis: payments-7ddffcc995-3  Failed  [0.0619] [0.1105]
    pods by version:
       5   69774c57f7  Running
    ```

    - Only **1 pod** ever ran v3.
    - The analysis measured **6%**, then **11%** 5xx on the canary. Two failures: **aborted after about 90 seconds**.
    - Argo Rollouts scaled the canary to 0 and the stable version back to 5 pods. No human did anything.

**Task:** how many requests failed? Compare with Module 4, where the same fault went to every pod. Run this a minute or two after the abort (the `[10m]` window must cover the whole canary):

```promql
sum(increase(http_request_duration_seconds_count{namespace="pay", path="root", status!="200"}[10m]))
sum(increase(http_request_duration_seconds_count{namespace="pay", path="root"}[10m]))
```

??? success "Solution"
    | | Module 4 (full release) | This canary |
    |---|---|---|
    | Pods with the bad version | 3 of 3 | 1 of 5 |
    | Time until mitigation | 4 minutes, because a human was already looking (45+ minutes on a long-running cluster) | about 1.5 minutes, automatic |
    | Failed requests | about 1,180 | about **100** |
    | Share of requests that failed during the incident | about 31% | about 2% |

    The canary cut the damage by about 10x, and it did that **without** anyone being paged. The two factors multiply: a fifth of the traffic, for a fraction of the time.

    Notice the analysis threshold measured only **5xx** (the canary's 400 and 409 responses weren't counted), and it still worked, because 9% 5xx is well above 2%. It would be better to measure all failures, as Module 4's postmortem asked.

## Part 4: Back to a clean state

After the abort, the rollout is **Degraded**: its spec still asks for v3, but it's running v2. In a GitOps setup, you **revert the commit**. Here, revert the pod template to v2:

```bash
kubectl -n pay patch rollout payments --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["./podinfo","--port=9898","--level=info","--ui-message=payments v2"]}]'
./labs/07-safe-change/status.sh
```

**Task:** why does it become `Healthy` immediately, without running another canary?

??? success "Solution"
    The reverted template is identical to the stable version (same pod-template hash), and those pods are already running. There's nothing new to roll out, so there's nothing to analyse.

## Part 5: Design a rollout for a risky change

**Task:** you need to ship a change to payments that also adds a database column, and you want to limit the blast radius. On paper, write:

1. The canary steps and analysis you'd use, and what you'd add to the analysis besides the 5xx ratio.
2. How you'd make the database change safe to roll back.
3. What you'd do differently if payments ran in 30 clusters in 3 regions.

??? success "Example answer"
    1. **Steps**: 5% (or one pod) for 10 minutes, 25% for 10 minutes, 50% for 10 minutes, 100%. **Analysis**: error ratio including 4xx caused by the service, **p99 latency** compared with the stable version, and a **minimum request count** so the analysis doesn't pass a canary that served almost nothing. Longer steps than the lab's, because payments errors are expensive and some problems take a while to show.
    2. **Expand and contract**: add the new column in a separate, earlier change; deploy code that works with both the old and new schema; only remove anything old after the new version has fully rolled out and baked.
    3. **Waves**: one cluster in one region first, then the rest of that region, then the other regions one at a time, with bake time and automated gates on the payment SLOs between waves. Never all three regions in the same window.

## Check your work

- [ ] You can explain each part of the Rollout and AnalysisTemplate, including how the query selects only the canary pods.
- [ ] You watched a good release promote itself after passing analysis.
- [ ] You watched a bad release abort itself after about 90 seconds on one pod.
- [ ] You compared the failed requests with Module 4's full release.
- [ ] You can describe a safe rollout for a change that includes a schema change, and for a fleet of clusters.

## Reset

Keep Argo Rollouts installed; later modules may use it. Remove payments:

```bash
kubectl delete -f labs/07-safe-change/payments.yaml
```

**Next:** [Test yourself](test-yourself.md).
