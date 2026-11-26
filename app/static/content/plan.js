// 14-day SRE interview plan, starting Fri 27 Nov 2026. Interview knowledge first; labs (phase 2) slot in on week 2-3.
// Daily rhythm (weekdays ~1.5 h): 45 min Q&A topic (say answers OUT LOUD before opening), 30 min "Interview me", 15 min story or coding.
window.PLAN_START = "2026-11-27";
window.PLAN = [
  { date: "2026-11-27", day: "Fri", theme: "How seniors answer + SRE basics", tasks: [
    { id: "d1-1", text: "Q&amp;A <b>Framework</b>: read all 4. These shape every answer you give.", link: "qa:Framework" },
    { id: "d1-2", text: "Q&amp;A <b>SRE</b> fundamentals: say each answer out loud first, then open and rate.", link: "qa:SRE" },
    { id: "d1-3", text: "Write your <b>Tell me about yourself</b> (Behavioral, Q1) in your own words; record it once.", link: "qa:Behavioral" } ] },
  { date: "2026-11-28", day: "Sat", theme: "SLOs and error budgets (the #1 SRE filter)", tasks: [
    { id: "d2-1", text: "Q&amp;A <b>SLO</b>: all questions. Memorise the downtime table (99.9% = 43 min/month).", link: "qa:SLO" },
    { id: "d2-2", text: "On paper: define SLIs + SLOs for one service you know (one you run or know well). Fleet SLIs count.", link: "qa:SLO" },
    { id: "d2-3", text: "Mock <b>Round 2: SLO design</b> in Practice mode.", link: "round:slo" } ] },
  { date: "2026-11-29", day: "Sun", theme: "Observability + incident management", tasks: [
    { id: "d3-1", text: "Q&amp;A <b>Obs</b>: golden signals, RED/USE, alert design, cardinality.", link: "qa:Obs" },
    { id: "d3-2", text: "Q&amp;A <b>Incident</b>: incident commander, mitigation first, postmortems.", link: "qa:Incident" },
    { id: "d3-3", text: "Stories: write <b>Biggest escalation</b> and <b>Fleet at scale</b> with numbers.", link: "stories" } ] },
  { date: "2026-11-30", day: "Mon", theme: "Kubernetes troubleshooting (1/2)", tasks: [
    { id: "d4-1", text: "Q&amp;A <b>K8s</b>: first 8 questions (CrashLoop → Terminating). Use the 6-step method out loud.", link: "qa:K8s" },
    { id: "d4-2", text: "Interview me: 5 questions, pool <b>Troubleshooting</b>, 5 min each.", link: "interview" } ] },
  { date: "2026-12-01", day: "Tue", theme: "Kubernetes troubleshooting (2/2)", tasks: [
    { id: "d5-1", text: "Q&amp;A <b>K8s</b>: remaining questions (rollout → debug containers).", link: "qa:K8s" },
    { id: "d5-2", text: "Mock <b>Round 3: Kubernetes troubleshooting</b>, Practice mode.", link: "round:k8s" } ] },
  { date: "2026-12-02", day: "Wed", theme: "Linux + networking", tasks: [
    { id: "d6-1", text: "Q&amp;A <b>Linux</b>: the slow-server checklist until you can say it without notes.", link: "qa:Linux" },
    { id: "d6-2", text: "Q&amp;A <b>Net</b>: TLS debugging, MTU, conntrack, DNS TTL.", link: "qa:Net" },
    { id: "d6-3", text: "Coding: write the log parser yourself (no peeking), then compare.", link: "qa:Coding" } ] },
  { date: "2026-12-03", day: "Thu", theme: "Linux deep dive + coding", tasks: [
    { id: "d7-1", text: "Mock <b>Round 4: Linux &amp; networking troubleshooting</b>, Practice mode.", link: "round:linux" },
    { id: "d7-2", text: "Coding: reverse string, two-sum, LRU cache from a blank file in 20 min.", link: "qa:Coding" } ] },
  { date: "2026-12-04", day: "Fri", theme: "Safe releases + capacity", tasks: [
    { id: "d8-1", text: "Q&amp;A <b>Release</b>: canary vs blue-green, fleet rollouts, expand-contract.", link: "qa:Release" },
    { id: "d8-2", text: "Q&amp;A <b>Capacity</b>: planning, HPA/VPA/CA/Karpenter, load testing, cost.", link: "qa:Capacity" } ] },
  { date: "2026-12-05", day: "Sat", theme: "Resilience + design", tasks: [
    { id: "d9-1", text: "Q&amp;A <b>Resilience</b>: retries, backoff, circuit breakers, cascading failure, chaos.", link: "qa:Resilience" },
    { id: "d9-2", text: "Q&amp;A <b>Design</b>: HA control plane, etcd, multi-region, app→data clusters, multi-tenancy.", link: "qa:Design" },
    { id: "d9-3", text: "Mock <b>Round 5: Reliability design</b>, Practice mode. Draw on paper.", link: "round:design" } ] },
  { date: "2026-12-06", day: "Sun", theme: "Your experience, SRE angle + stories", tasks: [
    { id: "d10-1", text: "Q&amp;A <b>Behavioral</b>: fill every <b>[fill]</b> with your own real numbers.", link: "qa:Behavioral" },
    { id: "d10-2", text: "Finish all 8 stories (each 2-3 min, 2+ numbers).", link: "stories" },
    { id: "d10-3", text: "Mock <b>Round 1: Hiring manager</b>, Practice mode.", link: "round:hm" } ] },
  { date: "2026-12-07", day: "Mon", theme: "Incident leadership + coding", tasks: [
    { id: "d11-1", text: "Mock <b>Round 6: Live incident</b>, Real mode (timed).", link: "round:incident" },
    { id: "d11-2", text: "Mock <b>Round 7: Coding</b>, Real mode.", link: "round:coding" } ] },
  { date: "2026-12-08", day: "Tue", theme: "Real-mode rounds", tasks: [
    { id: "d12-1", text: "Mock <b>Round 2 (SLO)</b> and <b>Round 3 (K8s)</b> in Real mode. Score yourself strictly.", link: "mock" },
    { id: "d12-2", text: "Interview me: 10 questions, pool <b>Everything</b>, weak first.", link: "interview" } ] },
  { date: "2026-12-09", day: "Wed", theme: "Full loop", tasks: [
    { id: "d13-1", text: "Full loop in Real mode (all rounds). Note weak areas.", link: "mock" } ] },
  { date: "2026-12-10", day: "Thu", theme: "Fix weak areas", tasks: [
    { id: "d14-1", text: "Progress tab: redo every question rated <b>again</b> or <b>shaky</b>.", link: "progress" },
    { id: "d14-2", text: "Re-run your lowest-scoring mock round in Real mode.", link: "mock" } ] }
];
window.ASK_THEM = [
  "How do you use SLOs and error budgets today, and who decides when a budget is exhausted?",
  "What's the on-call load like: pages per week, how many at night, how big is the rotation?",
  "What was the last major incident, and what changed after the postmortem?",
  "How is reliability ownership split between SRE and the development teams?",
  "What would success look like for this role after 6 months?"
];
