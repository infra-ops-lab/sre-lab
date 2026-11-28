# Lab: Eight broken services and a DNS outage

In this lab you fix the **orders** service eight times. Each time it's broken in a different way, and you're not told how. Then you take down the cluster's DNS and see what checkout's SLO makes of it.

| | |
|---|---|
| **Time** | About 75 minutes |
| **You need** | The [lab environment](../setup.md) running; Module 2's checkout dashboard for Part 9 |
| **Files** | `labs/05-k8s-troubleshooting/` |

How each scenario works:

```bash
./labs/05-k8s-troubleshooting/break.sh 1    # deploys orders, broken in some way
./labs/05-k8s-troubleshooting/check.sh      # tests it the way callers see it
```

`check.sh` passes when **2 replicas are Ready** and a **client in another namespace** (`ts-client`) gets HTTP 200 from `http://orders.orders/`.

**Rules:** don't read `break.sh`. Use the [method from the lesson](index.md#the-method): scope, what changed, then the layers in order. Fix the live objects with `kubectl` (`set`, `patch`, `edit`, `create`). Each scenario has a **hint** (where to look) and a **solution**; try the hint first.

## Part 1: Your toolkit

**Task:** deploy scenario 1, and run the two commands you'd start any investigation with. What do they tell you, before you look at anything else?

```bash
./labs/05-k8s-troubleshooting/break.sh 1
kubectl get pods -A -o wide | grep -v -E 'Running|Completed'
kubectl get events -n orders --sort-by=.lastTimestamp | tail -10
```

??? success "Solution"
    The first command shows that **only** the orders pods are unhealthy: the rest of the cluster is fine, so it's this service, not the cluster. Both pods have the same status (`ErrImagePull` or `ImagePullBackOff`), on different nodes, so it isn't a node problem.

    The events say exactly what's wrong. Keep going with scenario 1 in Part 2.

## Part 2: Scenario 1

**Task:** make `check.sh` pass.

??? tip "Hint"
    The status is `ImagePullBackOff`. Read the **Failed** event in `kubectl -n orders describe pod <pod>`.

??? success "Solution"
    ```text
    Failed to pull image "ghcr.io/stefanprodan/podinfo:6.17.9": rpc error: code = NotFound desc = failed to pull and unpack image ...: not found
    ```

    The tag `6.17.9` doesn't exist. The version the rest of the shop runs is `6.17.0`:

    ```bash
    kubectl -n orders set image deploy/orders orders=ghcr.io/stefanprodan/podinfo:6.17.0
    ./labs/05-k8s-troubleshooting/check.sh
    ```

    In real life, also check **registry credentials** (`imagePullSecrets`) and **rate limits** (Docker Hub's anonymous limit is a common cause of `ImagePullBackOff` on new nodes). The `NotFound` in the message rules both out here.

## Part 3: Scenario 2

```bash
./labs/05-k8s-troubleshooting/break.sh 2
```

**Task:** make `check.sh` pass.

??? tip "Hint"
    `CrashLoopBackOff` means the process starts and exits. Read the output of the container that **crashed**, not the one that's starting.

??? success "Solution"
    ```bash
    kubectl -n orders logs deploy/orders --previous | head -3
    ```

    ```text
    Error: unknown flag: --ui-colour
    ```

    Someone added a command-line flag that this version of podinfo doesn't have. (The events also show `Readiness probe failed: connection refused`, which is a side effect: nothing is listening because the process exited.) Remove the flag:

    ```bash
    kubectl -n orders patch deploy orders --type=json \
      -p '[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["./podinfo","--port=9898","--level=info"]}]'
    ```

    Without `--previous`, `kubectl logs` can show an empty log (the new container hasn't written anything yet) or only the usage text. The first lines of the **previous** container are where the error is.

## Part 4: Scenario 3

```bash
./labs/05-k8s-troubleshooting/break.sh 3
```

**Task:** make `check.sh` pass.

??? tip "Hint"
    The status alternates between `OOMKilled` and `CrashLoopBackOff`. Look at **Last State** in `describe pod`, and at the container's resources.

??? success "Solution"
    ```bash
    kubectl -n orders describe pod -l app=orders | grep -A3 "Last State"
    kubectl -n orders get deploy orders -o jsonpath='{.spec.template.spec.containers[0].resources}'; echo
    ```

    ```text
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    {"limits":{"memory":"8Mi"},"requests":{"cpu":"10m","memory":"8Mi"}}
    ```

    The memory limit is 8 MiB; podinfo needs more than that just to start. The kernel kills it (exit code 137 = killed by signal 9). Give it the shop's usual settings:

    ```bash
    kubectl -n orders set resources deploy/orders --requests=memory=32Mi --limits=memory=128Mi
    ```

    In production, `OOMKilled` is more often a **leak** or a traffic spike than a typo. Look at memory usage against the limit over time (Module 2's dashboard) before simply raising the limit.

## Part 5: Scenario 4

```bash
./labs/05-k8s-troubleshooting/break.sh 4
```

**Task:** make `check.sh` pass.

??? tip "Hint"
    `Pending` means the scheduler can't place the pod. The `FailedScheduling` event says why, node by node.

??? success "Solution"
    ```text
    0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient cpu.
    ```

    - `1 node(s) had untolerated taint(s)`: the control-plane node, which doesn't run normal workloads. Expected.
    - `2 Insufficient cpu`: the two workers don't have enough **unrequested** CPU.

    The pod **requests** 40 CPUs:

    ```bash
    kubectl -n orders get deploy orders -o jsonpath='{.spec.template.spec.containers[0].resources.requests}'; echo
    kubectl -n orders set resources deploy/orders --requests=cpu=10m
    ```

    Scheduling uses **requests**, not actual usage: a node at 5% CPU can still be "full" if pods have requested all of it. In production, `Insufficient cpu` usually means the cluster needs more nodes, or requests are much higher than real usage (Module 8).

## Part 6: Scenario 5

```bash
./labs/05-k8s-troubleshooting/break.sh 5
```

**Task:** make `check.sh` pass. Assume the application really needs a database password from a Secret called `orders-db`, key `password`.

??? tip "Hint"
    `CreateContainerConfigError` happens before the container starts. The events name the missing object.

??? success "Solution"
    ```text
    Error: secret "orders-db" not found
    ```

    The deployment references a Secret that was never created in this namespace (a common miss when promoting from one environment to another). Create it:

    ```bash
    kubectl -n orders create secret generic orders-db --from-literal=password=lab-only-password
    ```

    The kubelet retries on its own, and the pods start within a few seconds. In production, the Secret would come from your secrets manager (for example External Secrets Operator), and the real fix is making sure that is set up in every environment.

## Part 7: Scenario 6

```bash
./labs/05-k8s-troubleshooting/break.sh 6
```

**Task:** make `check.sh` pass.

??? tip "Hint"
    The pods are `Running` but `0/1` Ready. Kubernetes doesn't send traffic to pods that aren't Ready. Why aren't they?

??? success "Solution"
    ```text
    Readiness probe failed: HTTP probe failed with statuscode: 404
    ```

    The readiness probe calls `/ready`, which podinfo doesn't have. Its readiness endpoint is `/readyz`:

    ```bash
    kubectl -n orders patch deploy orders --type=json \
      -p '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/readyz"}]'
    ```

    The process was fine all along; Kubernetes just never considered it ready. A **liveness** probe with the same mistake would be worse: Kubernetes would restart healthy containers forever.

## Part 8: Scenario 7

```bash
./labs/05-k8s-troubleshooting/break.sh 7
```

**Task:** make `check.sh` pass. Notice what the first check says this time.

??? tip "Hint"
    The pods are Running and Ready, so the problem is between the client and the pods. Follow the [network path](index.md#the-network-path): which step is broken?

??? success "Solution"
    ```bash
    kubectl -n orders get endpointslices
    ```

    ```text
    NAME           ADDRESSTYPE   PORTS     ENDPOINTS   AGE
    orders-xxxxx   IPv4          <unset>   <unset>     1m
    ```

    The Service has **no endpoints**. Compare its selector with the pod labels:

    ```bash
    kubectl -n orders get svc orders -o jsonpath='{.spec.selector}'; echo
    kubectl -n orders get pods --show-labels
    ```

    The Service selects `app=order`; the pods are labelled `app=orders`. Fix the selector:

    ```bash
    kubectl -n orders patch svc orders -p '{"spec":{"selector":{"app":"orders"}}}'
    ```

    The client got **connection refused** (`000` in `check.sh`) rather than a timeout, which is the hint: the Service IP exists, but there's nothing behind it.

## Part 9: Scenario 8

```bash
./labs/05-k8s-troubleshooting/break.sh 8
```

**Task:** make `check.sh` pass. Assume the security team requires a default-deny policy in every namespace, so don't delete it.

??? tip "Hint"
    Pods Ready, endpoints present. Try the request from **inside** the orders namespace, then from the client. What's different?

??? success "Solution"
    ```bash
    kubectl -n orders get networkpolicy
    ```

    ```text
    NAME                   POD-SELECTOR   AGE
    allow-same-namespace   <none>         1m
    default-deny-ingress   <none>         1m
    ```

    Ingress is denied except from pods **in the same namespace**. Callers in other namespaces time out (the packets are dropped, so the client waits until it gives up). Allow the caller's namespace explicitly, on the application port only:

    ```bash
    kubectl apply -f - <<'EOF'
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata: { name: allow-from-ts-client, namespace: orders }
    spec:
      podSelector: { matchLabels: { app: orders } }
      ingress:
        - from:
            - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ts-client } }
          ports: [{ port: 9898 }]
    EOF
    ```

    Note `port: 9898`: NetworkPolicy works on the **pod's** port, not the Service's port 80.

When you're done, remove the scenarios:

```bash
./labs/05-k8s-troubleshooting/break.sh reset
```

## Part 10: A DNS outage

This part breaks the whole cluster's DNS for 3 minutes. Open the **Checkout service** dashboard (time range: last 30 minutes).

**Task:** before you start, predict: what will checkout's dashboard and SLO alerts show while DNS is down? Remember that loadgen calls `http://checkout-podinfo.shop:9898`.

```bash
kubectl -n kube-system scale deploy coredns --replicas=0
```

Wait 3 minutes and look at the dashboard. Check a request from loadgen's point of view:

```bash
kubectl -n shop exec deploy/loadgen -- curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://checkout-podinfo.shop:9898/
```

Then restore DNS:

```bash
kubectl -n kube-system scale deploy coredns --replicas=2
```

??? success "What you see"
    | Signal | During the outage |
    |---|---|
    | Request rate | From about 19 per second to **0** |
    | Error ratio | **0** |
    | Burn rates | **0** |
    | SLO alerts | **None** |
    | loadgen's request | `000`: it gives up after 3 seconds (curl exit code 28, timeout) |

    Every user is failing, and checkout's SLO says everything is perfect. The requests never reach checkout, so checkout never counts them, good or bad.

    What would have caught it:

    - A **traffic drop** alert: request rate far below normal for this time of day.
    - **Synthetic probes** from outside (blackbox exporter) that resolve and call checkout like a user.
    - **Client-side** or **ingress** metrics, which count the failed attempts.
    - Platform alerts on CoreDNS itself. In a real outage, CoreDNS pods crash or get overloaded, and alerts such as `KubeDeploymentReplicasMismatch` fire after about 15 minutes. Scaling to 0 on purpose doesn't trigger them, because 0 is what was asked for.

    One more thing to notice: **Alertmanager also needs DNS** to reach `pager.monitoring`. During a DNS outage, even the alerts that do fire may not be delivered. That's what the dead man's switch from Module 3 is for.

## Check your work

- [ ] You fixed all eight scenarios, each confirmed with `check.sh`.
- [ ] For each, you can name the **first** command that showed the cause.
- [ ] You used `logs --previous` for the crash loop, and `endpointslices` for the Service problem.
- [ ] You can explain why scenario 7 gave "connection refused" and scenario 8 a timeout.
- [ ] You saw a DNS outage that checkout's SLO couldn't see, and can name three ways to detect it.

## Reset

```bash
./labs/05-k8s-troubleshooting/break.sh reset
kubectl -n kube-system get deploy coredns     # READY 2/2
```

**Next:** [Test yourself](test-yourself.md).
