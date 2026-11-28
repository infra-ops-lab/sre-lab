# Test yourself: Troubleshooting Kubernetes

Answer each question in your own words first, then open the answer.

??? question "1. A developer says 'my service is broken on Kubernetes'. What are your first three steps, before looking at any YAML?"
    1. **Scope**: is it one pod, all pods of the service, one node, or many services? `kubectl get pods -A -o wide | grep -v Running` and the service's dashboard.
    2. **What changed**: recent deploys (`kubectl rollout history`, `helm history`), config changes, node or cluster upgrades. If something changed at the right time, it's the first suspect.
    3. **Events**: `kubectl get events -n <ns> --sort-by=.lastTimestamp` and `kubectl describe pod`. Most failure states explain themselves there.

??? question "2. A pod is in CrashLoopBackOff and `kubectl logs` shows nothing useful. What do you do?"
    Use `kubectl logs <pod> --previous`: it shows the output of the container that **crashed**, which is where the error is. The current container may have just started and written nothing yet.

    If that's empty too: check `describe pod` for the **exit code** and **reason** (137 = killed, often `OOMKilled`; 1 = the application exited with an error), check whether the command or arguments are wrong, and check that config files, Secrets and environment variables it needs are present. `kubectl debug` can start a copy of the pod with a different command, so you can look around inside.

??? question "3. A pod is Pending with: '0/12 nodes are available: 3 node(s) had untolerated taint(s), 9 Insufficient memory.' The nodes' memory usage is about 40%. Explain."
    The scheduler places pods by **requests**, not actual usage. The 9 workers have had most of their memory **requested** by other pods, even though those pods use far less. The 3 tainted nodes are probably control-plane or dedicated nodes that this pod doesn't tolerate.

    Options: lower over-sized requests on other workloads (right-sizing, Module 8), add nodes (or let the cluster autoscaler do it), or reduce this pod's request if it's too high.

??? question "4. What does exit code 137 mean, and how do you tell an OOM kill from other causes?"
    137 = 128 + 9: the process was killed by **SIGKILL**. In Kubernetes that's usually the kernel's OOM killer (the container exceeded its **memory limit**), but it can also be a liveness probe failure followed by a kill after the grace period, or a node eviction.

    `kubectl describe pod` → **Last State** → `Reason: OOMKilled` confirms OOM. For liveness, the events show `Liveness probe failed` before the restart.

??? question "5. Pods are Running and Ready, but callers get 'connection refused'. What's most likely, and how do you check?"
    The Service has **no endpoints** (or the wrong `targetPort`), so the Service IP exists but there's nothing behind it, and kube-proxy rejects the connection.

    ```bash
    kubectl get endpointslices -n <ns>
    kubectl get svc <name> -n <ns> -o jsonpath='{.spec.selector}'
    kubectl get pods -n <ns> --show-labels
    ```

    Compare the Service's selector with the pod labels, and the Service's `targetPort` with the port the container listens on.

??? question "6. Callers in other namespaces time out, but a pod in the same namespace can call the service fine. What's your first suspect?"
    A **NetworkPolicy**: a default-deny ingress policy with an allow rule only for the same namespace. Dropped packets cause **timeouts**, unlike the immediate "connection refused" of a missing endpoint.

    `kubectl get networkpolicy -n <ns>`, then add a policy that allows the caller's namespace (by `namespaceSelector`) on the **pod's** port.

??? question "7. What's the difference between a readiness probe and a liveness probe, and what goes wrong if you get each one wrong?"
    - **Readiness**: "can this pod take traffic right now?" If it fails, the pod is removed from the Service's endpoints, but not restarted. A wrong readiness probe means the pod **never receives traffic**, even though it's healthy.
    - **Liveness**: "is this process stuck beyond recovery?" If it fails, the container is **restarted**. A wrong liveness probe (or one that checks a dependency like the database) causes **restart loops**, and can turn a dependency's brief outage into an outage of every service that depends on it.

    Keep liveness probes simple (does the process respond at all?), and put dependency checks, if anywhere, in readiness.

??? question "8. In the lab, a DNS outage made checkout's SLO show 100% success while every user failed. Why, and how would you detect it?"
    checkout's SLI is measured **by checkout itself**. During the DNS outage, callers couldn't find checkout, so no requests arrived, and checkout counted zero bad requests (and zero good ones).

    Detect it with:

    - A **traffic drop** alert (request rate far below normal).
    - **Synthetic probes** from outside the service (blackbox exporter).
    - **Client-side or ingress** metrics that count failed attempts.
    - Platform alerts on **CoreDNS** health and error rates.

??? question "9. A pod has been in ImagePullBackOff for 10 minutes on a newly added node, while the same image runs fine on older nodes. What could it be?"
    The older nodes already have the image **cached**; the new node has to pull it. Likely causes:

    - **Registry rate limits** (Docker Hub limits anonymous pulls per IP).
    - The new node can't reach the registry (firewall, proxy, private endpoint not configured for its subnet).
    - **Missing registry credentials** on the new node, or an `imagePullSecret` that only works because the image was cached elsewhere.

    The event message tells you which: `429 Too Many Requests`, a timeout, or `unauthorized`.

??? question "10. Why should you change one thing at a time while troubleshooting?"
    If you change three things and it starts working, you don't know which one fixed it, you can't write an accurate postmortem, and you may have left two unnecessary (possibly harmful) changes in place. If it gets worse, you don't know which change caused that either. One change, check, then the next.

??? question "11. Kubernetes events are your best clue, but they're kept for only about an hour. What does that mean for incident response?"
    - **Collect events early** in an incident: `kubectl get events -A --sort-by=.lastTimestamp > events.txt`.
    - For postmortems, don't rely on events still being there the next day.
    - In production, **ship events to your logging system** (for example with an event exporter), so they're searchable for weeks.

??? question "12. How can a platform team reduce how often application teams hit the problems from this lab?"
    - **Policy checks in CI and at admission** (Kyverno, OPA Gatekeeper, kubeconform): image tags must exist and not be `latest`, resource requests and limits set within sensible ranges, probes present, Service selectors matching a Deployment.
    - **Templates or golden Helm charts** with correct probes, resources and NetworkPolicies already set up.
    - **Clear error messages and docs**: a "why is my pod not running?" guide linked from the `KubePodCrashLooping` and `KubePodNotReady` alerts.
    - **Self-service debugging**: give teams read access to events and logs in their namespaces, and teach `describe`, `logs --previous` and `endpointslices`.
