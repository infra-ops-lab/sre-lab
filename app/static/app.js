"use strict";
// ---------------------------------------------------------------- basics
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const view = $("#view");

// Static mode (GitHub Pages): no server. State lives in this browser's localStorage; Q&A comes from qa.json.
const STATIC_MODE = !!window.STATIC_MODE;
const LS_KEY = "sre-lab-state";
async function staticApi(path, body) {
  if (path === "/api/state") {
    if (body === undefined) { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (_) { return {}; } }
    try { localStorage.setItem(LS_KEY, JSON.stringify(body)); } catch (_) {}
    return { ok: true };
  }
  if (path === "/api/qa") return (await fetch("qa.json")).json();
  if (path === "/api/status") return { clusters: [], services: [], jobs: [], today: new Date().toISOString().slice(0, 10), tools: {} };
  return { ok: true, results: [], files: [] };
}
async function api(path, body) {
  if (STATIC_MODE) return staticApi(path, body);
  const opt = { headers: { "X-Lab-Token": window.LAB_TOKEN } };
  if (body !== undefined) { opt.method = "POST"; opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

let S = {};            // persisted state (~/sre-lab/practice/practice-state.json)
let STATUS = null;     // live fleet status
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => api("/api/state", S).catch(e => console.error(e)), 400); }
function ensure(k, v) { if (S[k] == null) S[k] = v; return S[k]; }

// Tiny markdown for Q&A answers: **bold**, `code`, "- " bullets, ``` fenced diagram/code blocks.
function md(t) {
  const lines = esc(t).split("\n");
  let out = "", inList = false, fence = null;
  for (let l of lines) {
    if (/^\s*```/.test(l)) {
      if (fence === null) { if (inList) { out += "</ul>"; inList = false; } fence = []; }
      else { out += '<pre class="diagram">' + fence.join("\n") + "</pre>"; fence = null; }
      continue;
    }
    if (fence !== null) { fence.push(l); continue; }
    l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
    if (/^\s*-\s+/.test(l)) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + l.replace(/^\s*-\s+/, "") + "</li>"; }
    else { if (inList) { out += "</ul>"; inList = false; } if (l.trim()) out += "<p>" + l + "</p>"; }
  }
  if (fence !== null) out += '<pre class="diagram">' + fence.join("\n") + "</pre>";
  return out + (inList ? "</ul>" : "");
}

// ---------------------------------------------------------------- top bar
function countdown() {
  const d = Math.floor((new Date() - new Date(window.PLAN_START + "T00:00:00")) / 86400000) + 1;
  $("#countdown").textContent = d < 1 ? "Plan starts " + window.PLAN_START : d <= PLAN.length ? `Day ${d} of ${PLAN.length} · interview knowledge first` : "Plan complete · keep drilling weak questions";
}

function renderFleet() {
  const el = $("#fleet");
  if (!STATUS) { el.innerHTML = '<span class="pill"><span class="dot warn"></span>checking…</span>'; return; }
  const c = STATUS.clusters.map(x => `<span class="pill" title="${esc(x.role)} · ${esc(x.status)}"><span class="dot ${x.ready ? "ok" : x.state === "running" ? "warn" : "bad"}"></span>${esc(x.name)}</span>`).join("");
  const s = STATUS.services.filter(x => x.ok !== null).map(x => `<a class="pill" href="${x.url}" target="_blank" rel="noopener"><span class="dot ${x.ok ? "ok" : "bad"}"></span>${esc(x.name)}</a>`).join("");
  const j = STATUS.jobs.length ? `<span class="pill"><span class="dot warn"></span>running: ${esc(STATUS.jobs.map(x => x.action).join(", "))}</span>` : "";
  el.innerHTML = c + s + j;
}

async function pollStatus() {
  try { STATUS = await api("/api/status"); } catch (e) { STATUS = null; }
  renderFleet();
}

// Jobs (whitelisted scripts) with a streaming log.
let jobPoll = null;
async function runAction(id) {
  const log = $("#log"); log.hidden = false;
  $("#logTitle").textContent = id; $("#logBody").textContent = "starting…\n";
  try {
    const { job } = await api("/api/action", { id });
    let offset = 0; $("#logBody").textContent = "";
    clearInterval(jobPoll);
    jobPoll = setInterval(async () => {
      const r = await api(`/api/job?id=${job}&offset=${offset}`);
      offset = r.offset;
      if (r.lines.length) { const b = $("#logBody"); b.textContent += r.lines.join("\n") + "\n"; b.scrollTop = b.scrollHeight; }
      if (r.done) { clearInterval(jobPoll); $("#logBody").textContent += `\n[${r.action} finished, exit ${r.rc}]\n`; pollStatus(); }
    }, 1000);
  } catch (e) { $("#logBody").textContent += "error: " + e.message; }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-action]");
  if (b && !b.dataset.confirm) runAction(b.dataset.action);
});
$("#toggleLog").onclick = () => { $("#log").hidden = !$("#log").hidden; };
$("#closeLog").onclick = () => { $("#log").hidden = true; };

// ---------------------------------------------------------------- routing
function go(hash) { location.hash = hash; }
function parseRoute() {
  const [tab, arg] = (location.hash.slice(1) || "plan").split("/");
  return { tab, arg: arg ? decodeURIComponent(arg) : null };
}
function linkFor(l) {
  if (!l) return null;
  const [k, v] = l.split(":");
  return { lab: `#lab/${v}`, round: `#mock/${v}`, qa: `#qa/${v}`, mock: "#mock", interview: "#interview", stories: "#stories", progress: "#progress", ask: "#plan", jd: "#jd" }[k];
}
function render() {
  const r = parseRoute();
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === r.tab));
  ({ plan: renderPlan, jd: renderJD, lab: renderLab, mock: renderMock, interview: renderInterview, qa: renderQA, stories: renderStories, progress: renderProgress, setup: renderSetup }[r.tab] || renderPlan)(r.arg);
  window.scrollTo(0, 0);
}
$$("#tabs button").forEach(b => b.onclick = () => b.dataset.href ? (location.href = b.dataset.href) : go(b.dataset.tab));
window.addEventListener("hashchange", render);

// ---------------------------------------------------------------- plan
function renderPlan() {
  const plan = ensure("plan", {});
  const today = STATUS ? STATUS.today : new Date().toISOString().slice(0, 10);
  const all = PLAN.flatMap(d => d.tasks), done = all.filter(t => plan[t.id]).length;
  view.innerHTML = `
    <h1>14 days to interview-ready</h1>
    <p class="muted">Weekdays about 1.5 h: one Q&amp;A topic (answer out loud <b>before</b> opening), then 🎤 Interview me, then a story or coding. Hands-on labs come in phase 2. Tick tasks as you go. ${done}/${all.length} done.</p>
    <div class="bar" style="margin:6px 0 18px"><div style="width:${Math.round(100 * done / all.length)}%"></div></div>
    ${PLAN.map(d => `
      <div class="card day ${d.date === today ? "today" : ""}">
        <div class="when">${d.day} <span class="muted">${d.date.slice(5)}</span><div class="muted">${esc(d.theme)}</div>${d.date === today ? '<span class="badge warn">today</span>' : ""}</div>
        <div>${d.tasks.map(t => `<label class="task ${plan[t.id] ? "done" : ""}"><input type="checkbox" data-task="${t.id}" ${plan[t.id] ? "checked" : ""}>
          <span>${t.text}${linkFor(t.link) ? ` <a href="${linkFor(t.link)}">open →</a>` : ""}</span></label>`).join("")}</div>
      </div>`).join("")}
    <h2>What Senior SRE interviewers look for</h2>
    <div class="card"><table class="level"><tr><th></th><th>Mid-level</th><th>Senior: what they look for</th></tr>
      ${LEVEL_BAR.map(r => `<tr><td>${r[0]}</td><td class="muted">${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table></div>
    <h2 id="ask">Questions to ask them</h2>
    <div class="card"><ol>${ASK_THEM.map(q => `<li>${esc(q)}</li>`).join("")}</ol></div>`;
  $$("[data-task]").forEach(cb => cb.onchange = () => { plan[cb.dataset.task] = cb.checked; save(); renderPlan(); });
}


// ---------------------------------------------------------------- JD match
function prepLinks(list) {
  return list.map(l => { const h = linkFor(l); const [k, v] = l.split(":");
    const label = k === "lab" ? "Lab " + v : k === "qa" ? "Q&A " + v : k === "round" ? "Mock " + ((ROUNDS.find(r => r.id === v) || {}).title || v).split(":")[0] : k[0].toUpperCase() + k.slice(1);
    return `<a class="badge" href="${h}">${esc(label)}</a>`; }).join(" ");
}
function renderJD() {
  if (!window.JD_MAP) { view.innerHTML = "<p class='muted'>No target-role map loaded.</p>"; return; }
  const notes = ensure("jdNotes", {});
  const counts = { gap: 0, partial: 0, strong: 0 }; JD_MAP.forEach(a => counts[a.status]++);
  view.innerHTML = `<h1>Target roles ↔ your profile</h1>
    <p class="muted">What the Senior SRE roles you target ask for, what your experience already proves, and how to bridge each gap <b>honestly</b>. Interviewers probe until they hit the edge of your knowledge; owning a gap clearly beats bluffing.</p>
    <div class="row"><span class="badge bad">${counts.gap} gaps</span><span class="badge warn">${counts.partial} partial</span><span class="badge ok">${counts.strong} strong</span></div>
    <h2>Your differentiators: say these early</h2>
    <div class="grid g2">${DIFFERENTIATORS.map(d => `<div class="card"><b>${esc(d[0])}</b><div class="muted">${esc(d[1])}</div></div>`).join("")}</div>
    <h2>Area by area</h2>
    ${JD_MAP.map((a, i) => `<div class="card"><div class="row"><h3 style="margin:0">${esc(a.area)}</h3><span class="spacer"></span>
        <span class="badge ${a.status === "gap" ? "bad" : a.status === "partial" ? "warn" : "ok"}">${a.status}</span></div>
      <p class="muted" style="margin:6px 0">${esc(a.jd)}</p>
      <div class="grid g2"><div><h3>Evidence on your resume</h3>${a.evidence.length ? `<ul>${a.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : '<p class="muted">Nothing direct. Treat it as a learning area and say so.</p>'}</div>
        <div><h3>How to bridge it</h3><p>${a.bridge}</p></div></div>
      <div class="row"><span class="muted">Prepare with:</span> ${prepLinks(a.prep)}</div>
      <textarea data-jd="${i}" placeholder="Your own words: the 30-second answer for this area, with one number.">${esc(notes[i] || "")}</textarea></div>`).join("")}
    <h2>Resume grill: they will ask these</h2>
    <div class="row"><a class="btn primary" href="#qa/Resume">📄 Open all resume questions with answers</a></div>
    <p class="muted">Practise them timed in <a href="#mock/resume">Mock → Round 0</a>. Fill in the numbers below now; nothing here is made up for you.</p>
    ${RESUME_GRILL.map((g, i) => `<div class="card"><div class="q">${esc(g.q)}</div>
      <div class="grid g2"><div><b>What they're testing</b><p class="muted">${esc(g.testing)}</p></div><div><b>Shape of a strong answer</b><p class="muted">${esc(g.shape)}</p></div></div>
      ${g.numbers ? `<div class="hint"><b>Numbers to have ready:</b> ${esc(g.numbers)}</div>` : ""}
      <textarea data-grill="${i}" placeholder="Your facts and numbers for this one">${esc((S.grill || {})[i] || "")}</textarea></div>`).join("")}`;
  $$("[data-jd]").forEach(t => t.oninput = () => { notes[t.dataset.jd] = t.value; save(); });
  $$("[data-grill]").forEach(t => t.oninput = () => { ensure("grill", {})[t.dataset.grill] = t.value; save(); });
}

// ---------------------------------------------------------------- labs
function labState(id) { const c = (S.checks || {})[id]; return !c ? "" : c.pass === c.total ? "done" : "part"; }
function renderLab(arg) {
  const id = arg || S.lastLab || "0";
  S.lastLab = id; save();
  const L = LABS.find(l => l.id === id) || LABS[0];
  const hints = ensure("hints", {}), notes = ensure("notes", {}), checks = ensure("checks", {});
  const shown = hints[id] || 0, chk = checks[id];
  const canSolve = chk && shown >= L.hints.length;
  view.innerHTML = `
    <div class="split">
      <div class="side card">
        ${LABS.map(l => `${l.id === "0" ? '<div class="meta" style="padding:4px 10px">CORE: IDP, fleet, delivery</div>' : ""}${l.id === "9" ? '<div class="meta" style="padding:12px 10px 4px">JD BREADTH</div>' : ""}<button class="${l.id === id ? "on" : ""}" data-lab="${l.id}"><span class="num ${labState(l.id)}">${l.id}</span>
          <span><div>${esc(l.title)}</div><div class="meta">${l.day} · ${l.time}${checks[l.id] ? ` · ${checks[l.id].pass}/${checks[l.id].total}` : ""}</div></span></button>`).join("")}
      </div>
      <div>
        <div class="row"><h1>Lab ${L.id} · ${esc(L.title)}</h1></div>
        <div class="muted">${L.day} · ${L.time}</div>
        <div class="tiein" style="margin-top:12px"><b>Why this matters in an SRE interview:</b> ${L.why}</div>
        <div class="card"><h3 style="margin-top:0">Requirements (acceptance criteria)</h3><ul class="reqs">${L.reqs.map(r => `<li>${r}</li>`).join("")}</ul>
          ${labExtras(L)}
          <div class="row" style="margin-top:12px"><button class="btn primary" id="check">Check my work</button>
          <span class="muted" id="checkMeta">${chk ? `Last check: ${chk.pass}/${chk.total} passed · ${new Date(chk.at).toLocaleString()}` : "The checker inspects the live clusters, Gitea and Backstage."}</span></div>
          <ul class="results" id="results">${chk && chk.results ? resultsHtml(chk.results) : ""}</ul>
        </div>
        ${L.id === "8" ? '<div class="card" id="rfc"></div>' : ""}
        <div class="card"><h3 style="margin-top:0">Hints <span class="muted">(${shown}/${L.hints.length} revealed: try first)</span></h3>
          ${L.hints.slice(0, shown).map((h, i) => `<div class="hint"><b>Hint ${i + 1}.</b> ${h}</div>`).join("")}
          ${shown < L.hints.length ? `<button class="btn" id="hint">Show hint ${shown + 1}</button>` : ""}
        </div>
        <div class="card"><h3 style="margin-top:0">Reference solution</h3>
          ${L.id === "8" ? '<p class="muted">No reference: use the checklist and the Defend-it questions. Score it yourself against the Round 3 signals.</p>' :
            canSolve ? `<button class="btn" id="sol">Show solution</button> <span class="muted">${(S.solSeen || {})[id] ? "(you've opened it before)" : ""}</span><div id="solBody"></div>` :
            `<p class="muted">Unlocks after you've run <b>Check</b> at least once and revealed all hints. Struggling for 10 minutes is where the learning is.</p>`}
        </div>
        <div class="card"><h3 style="margin-top:0">Defend it like a senior SRE</h3><p class="muted">Answer these out loud, then jot the key points. Interviewers ask exactly these follow-ups.</p>
          <ol>${L.defend.map(d => `<li>${d}</li>`).join("")}</ol>
          ${L.tiein ? `<div class="tiein">${L.tiein}</div>` : ""}
          <textarea id="labNotes" placeholder="Your notes, numbers (e.g. time-to-first-deploy), gotchas hit…">${esc(notes[id] || "")}</textarea>
        </div>
      </div>
    </div>`;
  $$("[data-lab]").forEach(b => b.onclick = () => go("lab/" + b.dataset.lab));
  $("#labNotes").oninput = e => { notes[id] = e.target.value; save(); };
  const h = $("#hint"); if (h) h.onclick = () => { hints[id] = shown + 1; save(); renderLab(id); };
  $("#check").onclick = async () => {
    const b = $("#check"); b.disabled = true; b.textContent = "Checking…";
    try {
      const r = await api("/api/check", { lab: id });
      const pass = r.results.filter(x => x.ok).length;
      checks[id] = { pass, total: r.results.length, at: Date.now(), results: r.results }; save();
      renderLab(id);
    } catch (e) { $("#results").innerHTML = `<li class="bad">✗<span>${esc(e.message)}</span></li>`; b.disabled = false; b.textContent = "Check my work"; }
  };
  const sb = $("#sol"); if (sb) sb.onclick = () => showSolution(L);
  if (L.id === "8") renderRFC();
}
function labExtras(L) {
  const x = [];
  if (L.id === "2") x.push('<button class="btn small" data-action="backstage-restart">Restart Backstage</button>');
  if (L.id === "7" && STATUS && !STATUS.tools.go) x.push('<button class="btn small" data-action="install-go">Install Go</button>');
  if (L.id === "0") x.push('<button class="btn small" data-action="fleet-register">Re-register cells in Argo CD</button>');
  if (L.id === "10") { x.push(`<button class="btn small" data-action="install-tools">${STATUS && STATUS.tools.sc ? "Reinstall" : "Install"} supply-chain tools</button>`); x.push('<button class="btn small" data-action="setup-registry">Re-run registry setup</button>'); }
  return x.length ? `<div class="row" style="margin-top:10px">${x.join("")}</div>` : "";
}
function resultsHtml(rs) {
  return rs.map(r => `<li class="${r.ok ? "ok" : "bad"}"><span>${r.ok ? "✓" : "✗"}</span><span>${esc(r.name)}</span>${r.detail ? `<span class="d">${esc(r.detail)}</span>` : ""}</li>`).join("");
}
async function showSolution(L) {
  ensure("solSeen", {})[L.id] = true; save();
  const el = $("#solBody");
  let html = L.solution ? `<pre>${esc(L.solution)}</pre>` : "";
  try {
    const { files } = await api("/api/solution?lab=" + L.id);
    html += files.map(f => `<h3>${esc(f.path)}</h3><pre>${esc(f.content)}</pre>`).join("");
    if (!html) html = '<p class="muted">No reference solution has been written for this lab yet. Use the hints and the checker.</p>';
  } catch (e) { html += `<p class="muted">${esc(e.message)}</p>`; }
  if (L.solutionNote) html = `<div class="hint">${L.solutionNote}</div>` + html;
  el.innerHTML = html;
}
const RFC_SKELETON = `# RFC: Cell-based tenant placement and ring rollout

Author: · Status: Draft · Reviewers: Platform, Central SRE, Security, a product team

## Context
## Goals
## Non-goals
## Options considered
### Option A: shared regional clusters (namespace per tenant)
### Option B: cells (N tenants per cell) + dedicated cells
### Option C: cluster per tenant
## Decision
## Architecture
\`\`\`
\`\`\`
## Risks and mitigations
## Migration plan
## Success metrics
## Cost
## Open questions
`;
async function renderRFC() {
  const el = $("#rfc");
  const r = await api("/api/rfc").catch(() => ({ text: "" }));
  el.innerHTML = `<div class="row"><h3 style="margin:0">RFC editor</h3><span class="spacer"></span><span class="muted" id="wc"></span>
    <button class="btn small" id="rfcSkel">Insert skeleton</button><button class="btn small primary" id="rfcSave">Save</button></div>
    <p class="muted">Saved to <code>${esc(r.path || "~/interview-practice/notes/rfc-cell-placement.md")}</code>. You can also edit that file in your own editor.</p>
    <textarea class="big mono" id="rfcText">${esc(r.text)}</textarea>`;
  const ta = $("#rfcText");
  const wc = () => { const n = (ta.value.match(/\w+/g) || []).length; $("#wc").textContent = `${n} words · ~${Math.max(1, Math.round(n / 250))} page(s)`; };
  wc(); ta.oninput = wc;
  $("#rfcSkel").onclick = () => { if (!ta.value.trim()) { ta.value = RFC_SKELETON; wc(); } };
  $("#rfcSave").onclick = async () => { await api("/api/rfc", { text: ta.value }); $("#rfcSave").textContent = "Saved ✓"; setTimeout(() => $("#rfcSave").textContent = "Save", 1500); };
}

// ---------------------------------------------------------------- mock interview
let timerInt = null;
function fmt(sec) { const s = Math.abs(sec); return (sec < 0 ? "+" : "") + String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function lastScore(rid) {
  const e = (S.mock || []).filter(m => m.roundId === rid).slice(-1)[0];
  if (!e) return "";
  const v = SCORE_DIMS.map(d => e.scores[d.id] || 0), avg = v.reduce((a, b) => a + b, 0) / v.length;
  return `<span class="badge ${avg >= 4 ? "ok" : avg >= 3 ? "warn" : "bad"}">last ${avg.toFixed(1)}/5</span>`;
}
function renderMock(arg) {
  clearInterval(timerInt);
  const d = S.mockDraft;
  if (arg && d && arg === d.roundId) return renderSession();
  if (arg) { const R = ROUNDS.find(r => r.id === arg); if (R) return renderRoundIntro(R); }
  view.innerHTML = `
    <h1>Mock rounds: Senior SRE loop</h1>
    <p class="muted">Seven rounds, modelled on Senior SRE loops (HM, SLO, K8s, Linux, design, incident, coding). <b>Practice</b>: probes and the "what a senior answer shows" key are visible as you go. <b>Real</b>: timed, probes come one at a time, the key is hidden until you finish, and then you self-score. Answer <b>out loud</b> (record yourself if you can), and keep notes short.</p>
    <div class="card hint row"><span><b>🎤 Interview me:</b> random questions from the whole Q&amp;A bank, timed, answer then compare with the model answer.</span><span class="spacer"></span><button class="btn primary" id="ivOpen">Start</button></div>
    <div class="row"><button class="btn primary" id="fullLoop">Start full loop (Real mode, Rounds 2-7)</button><span class="muted">About 5 hours. Plan day 13.</span></div>
    <div class="grid g2" style="margin-top:14px">${ROUNDS.map(R => `
      <div class="card"><div class="row"><b>${esc(R.title)}</b><span class="spacer"></span>${lastScore(R.id)}</div>
        <div class="muted">${R.minutes} min · ${R.questions.length} questions</div><p>${esc(R.focus)}</p>
        <div class="row"><button class="btn" data-round="${R.id}">Open</button></div></div>`).join("")}</div>
    <h2>How you'll be scored</h2>
    <div class="card"><table>${SCORE_DIMS.map(d => `<tr><td><b>${d.label}</b></td><td class="muted">${d.hint}</td></tr>`).join("")}</table></div>`;
  $$("[data-round]").forEach(b => b.onclick = () => go("mock/" + b.dataset.round));
  $("#ivOpen").onclick = () => go("interview");
  $("#fullLoop").onclick = () => startSession(ROUNDS[0].id, "real", ROUNDS.filter(r => !r.extra).map(r => r.id).slice(1));
  addDraftBanner();
}
function renderRoundIntro(R) {
  view.innerHTML = `<a href="#mock">← all rounds</a><h1>${esc(R.title)}</h1><div class="muted">${R.minutes} min</div>
    <div class="card"><b>What they're testing:</b> ${esc(R.focus)}</div>
    <div class="tiein"><b>Answer framework:</b> ${R.framework}</div>
    <div class="row"><button class="btn primary" id="real">Start in Real mode</button><button class="btn" id="prac">Start in Practice mode</button></div>
    <h2>Questions in this round</h2><div class="card"><ol>${R.questions.map(q => `<li>${esc(q.q)}</li>`).join("")}</ol>
    <p class="muted">Reading them in advance is fine for Practice mode. For Real mode, try not to.</p></div>`;
  $("#real").onclick = () => startSession(R.id, "real", []);
  $("#prac").onclick = () => startSession(R.id, "practice", []);
}
function startSession(roundId, mode, queue) {
  S.mockDraft = { roundId, mode, queue, qi: 0, start: Date.now(), notes: {}, probes: {}, revealed: {}, finished: false };
  save();
  if (location.hash === "#mock/" + roundId) renderSession(); else go("mock/" + roundId);
}
function renderSession() {
  clearInterval(timerInt);
  if (!QA && S.mockDraft && S.mockDraft.roundId === "deep11") { api("/api/qa").then(x => { QA = x; renderSession(); }); return; }
  const d = S.mockDraft, R = ROUNDS.find(r => r.id === d.roundId);
  if (d.finished) return renderScoring(R, d);
  const Q = R.questions[d.qi], real = d.mode === "real";
  const probes = d.probes[d.qi] || 0;
  view.innerHTML = `
    <div class="row"><a href="#mock">← leave (draft is kept)</a><span class="spacer"></span><span class="badge ${real ? "bad" : "ok"}">${real ? "Real mode" : "Practice mode"}</span></div>
    <div class="row"><h1>${esc(R.title)}</h1><span class="spacer"></span><div class="timer" id="timer"></div></div>
    <div class="muted">Question ${d.qi + 1} of ${R.questions.length}${d.queue.length ? ` · ${d.queue.length} more round(s) in this loop` : ""}</div>
    <div class="card"><div class="q">${esc(Q.q)}</div>
      ${real ? `<p class="muted">Answer out loud first. When you've finished your main answer, press <b>Next probe</b> to hear the interviewer's follow-up.</p>` : ""}
      <h3>Interviewer probes</h3>
      <ol>${(real ? Q.follow.slice(0, probes) : Q.follow).map(f => `<li>${esc(f)}</li>`).join("")}</ol>
      ${real && probes < Q.follow.length ? `<button class="btn" id="probe">Next probe (${probes}/${Q.follow.length})</button>` : ""}
      <h3>Your notes</h3><textarea id="notes" placeholder="Key points you made, numbers you used, what you forgot…">${esc(d.notes[d.qi] || "")}</textarea>
      ${!real ? `<details ${d.revealed[d.qi] ? "open" : ""} id="key"><summary>What a senior-level answer shows</summary>${keyHtml(Q)}${modelFor(R, d.qi)}</details>` : ""}
    </div>
    <div class="tiein"><b>Framework:</b> ${R.framework}</div>
    <div class="row"><button class="btn" id="prev" ${d.qi === 0 ? "disabled" : ""}>← Previous</button><span class="spacer"></span>
      ${d.qi < R.questions.length - 1 ? '<button class="btn primary" id="next">Next question →</button>' : '<button class="btn primary" id="finish">Finish round and score</button>'}</div>`;
  const tick = () => { const left = Math.round(R.minutes * 60 - (Date.now() - d.start) / 1000); const t = $("#timer"); if (!t) return clearInterval(timerInt); t.textContent = fmt(left); t.classList.toggle("over", left < 0); };
  tick(); timerInt = setInterval(tick, 1000);
  $("#notes").oninput = e => { d.notes[d.qi] = e.target.value; save(); };
  const p = $("#probe"); if (p) p.onclick = () => { d.probes[d.qi] = probes + 1; save(); renderSession(); };
  const k = $("#key"); if (k) k.ontoggle = () => { d.revealed[d.qi] = k.open; save(); };
  $("#prev").onclick = () => { d.qi--; save(); renderSession(); };
  const n = $("#next"); if (n) n.onclick = () => { d.qi++; save(); renderSession(); };
  const f = $("#finish"); if (f) f.onclick = () => { d.finished = true; d.elapsed = Math.round((Date.now() - d.start) / 1000); save(); renderSession(); };
}
function addDraftBanner() {
  const d = S.mockDraft; if (!d) return;
  const R = ROUNDS.find(r => r.id === d.roundId);
  view.insertAdjacentHTML("afterbegin", `<div class="card hint row"><span>Unfinished: <b>${esc(R.title)}</b> (${d.mode}).</span><span class="spacer"></span>
    <button class="btn small primary" id="resume">Resume</button><button class="btn small danger" id="discard">Discard</button></div>`);
  $("#resume").onclick = () => go("mock/" + d.roundId);
  $("#discard").onclick = () => { S.mockDraft = null; save(); renderMock(null); };
}
function modelFor(R, i) {
  if (!QA || !R || R.id !== "deep11") return "";
  const sec = QA.find(s => s.tag === "Deep11"), q = sec && sec.items[i];
  return q ? `<details class="qrow"><summary><span class="qt"><b>Model answer</b> (from Q&amp;A → Deep11)</span></summary><div class="qbody">${md(q.a)}</div></details>` : "";
}
function keyHtml(Q) {
  return `<h3>Strong signals</h3><ul class="signals">${Q.signals.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
    <h3>Red flags</h3><ul class="flags">${Q.flags.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`;
}
function renderScoring(R, d) {
  const sc = d.scores || (d.scores = Object.fromEntries(SCORE_DIMS.map(x => [x.id, 3])));
  view.innerHTML = `<h1>Score: ${esc(R.title)}</h1>
    <p class="muted">Time used: ${fmt(d.elapsed || 0)} of ${R.minutes}:00. Compare your notes against the key, question by question. Be strict: a 3 is "mid-level pass", a 4 is "Senior SRE", a 5 is "the interviewer learned something".</p>
    ${R.questions.map((Q, i) => `<div class="card"><div class="q">${i + 1}. ${esc(Q.q)}</div>
      <div class="grid g2"><div><h3>Your notes</h3><div class="answer">${esc(d.notes[i] || "(none)")}</div></div><div>${keyHtml(Q)}${modelFor(R, i)}</div></div></div>`).join("")}
    <div class="card"><h3 style="margin-top:0">Self-score</h3><div class="scorebox">
      ${SCORE_DIMS.map(x => `<label title="${esc(x.hint)}">${x.label}</label><input type="range" min="1" max="5" step="1" value="${sc[x.id]}" data-dim="${x.id}"><b id="v-${x.id}">${sc[x.id]}</b>`).join("")}</div>
      <h3>Weak areas / what to fix</h3><textarea id="weak" placeholder="e.g. forgot cost; didn't clarify scale; no numbers in the adoption story">${esc(d.weak || "")}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="saveScore">Save to progress${d.queue.length ? " and start the next round" : ""}</button>
      <span class="muted">Also appended to ~/sre-lab/practice/progress.md</span></div></div>`;
  $$("[data-dim]").forEach(r => r.oninput = () => { sc[r.dataset.dim] = +r.value; $("#v-" + r.dataset.dim).textContent = r.value; save(); });
  $("#weak").oninput = e => { d.weak = e.target.value; save(); };
  $("#saveScore").onclick = async () => {
    const entry = { date: new Date().toISOString().slice(0, 10), at: Date.now(), roundId: R.id, round: R.title, mode: d.mode === "real" ? "Real" : "Practice",
      scores: sc, weak: d.weak || "", elapsed: d.elapsed, notes: d.notes };
    ensure("mock", []).push(entry);
    await api("/api/mocklog", entry).catch(() => {});
    const q = d.queue; S.mockDraft = null; save();
    if (q.length) startSession(q[0], "real", q.slice(1)); else go("progress");
  };
}

// ---------------------------------------------------------------- Q&A drill
let QA = null;
async function renderQA(arg) {
  if (!QA) { view.innerHTML = "<p class='muted'>Loading…</p>"; QA = await api("/api/qa"); }
  const ratings = ensure("qa", {});
  const tag = arg ? decodeURIComponent(arg) : "all";
  const isResume = tag === "Resume";
  const secs = QA.filter(s => isResume ? s.source === "resume"
    : tag === "all" ? s.source !== "resume"
    : s.tag === tag);
  const items = secs.flatMap(s => s.items.map((q, i) => ({ ...q, key: s.tag + ":" + i, sec: s.title.replace(/^Resume: /, "") })));
  const resumeCount = QA.filter(s => s.source === "resume").reduce((n, s) => n + s.items.length, 0);
  const tags = [...new Set(QA.filter(s => s.source !== "resume").map(s => s.tag))];
  const cnt = k => items.filter(q => ratings[q.key] === k).length;
  view.innerHTML = `<h1>${isResume ? "Questions from your resume" : "Q&amp;A drill"}</h1>
    <p class="muted">${isResume
      ? "What an SRE panel is likely to ask about <b>your</b> resume. The answers are frameworks built from your resume. Anything marked <b>[fill: …]</b> is a fact or number only you know: write your version in the box under each answer, then say it out loud."
      : "Click a question to open its answer. Say your answer out loud <b>before</b> you open it, then rate yourself. <b>Random weak</b> serves \"again\" and unrated questions first."}</p>
    <div class="row"><button class="btn primary" id="ivGo">🎤 Interview me: random questions</button>${resumeCount ? `<button class="btn ${isResume ? "primary" : ""}" data-tag="Resume">📄 From my resume (${resumeCount})</button>` : ""}</div>
    <div class="row qtags">${["all", ...tags].map(t => `<button class="btn small ${t === tag ? "primary" : ""}" data-tag="${esc(t)}">${esc(t === "all" ? "All" : t)}</button>`).join("")}</div>
    <div class="row" style="margin:12px 0">
      <input id="qsearch" placeholder="Filter questions…" style="flex:1;min-width:180px">
      <button class="btn small" id="qopen">Expand all</button><button class="btn small" id="qclose">Collapse all</button>
      <button class="btn small primary" id="rand">Random weak</button></div>
    <div class="muted" style="margin-bottom:8px">${items.length} questions · <span class="badge ok">${cnt("solid")} solid</span> <span class="badge warn">${cnt("shaky")} shaky</span> <span class="badge bad">${cnt("again")} again</span></div>
    <div id="qlist">${items.map((q, n) => qaRow(q, n + 1, ratings, isResume)).join("")}</div>`;
  $$("[data-tag]").forEach(b => b.onclick = () => go("qa/" + encodeURIComponent(b.dataset.tag)));
  $("#ivGo").onclick = () => { S.ivPrefs = Object.assign(S.ivPrefs || { n: 8, mins: 5, weak: true }, { pool: isResume ? "resume" : tag === "all" ? "mix" : "tag:" + tag }); S.iv = null; save(); go("interview"); };
  bindQA(ratings);
  $("#qopen").onclick = () => $$("#qlist details.qrow").forEach(d => { if (d.style.display !== "none") d.open = true; });
  $("#qclose").onclick = () => $$("#qlist details.qrow").forEach(d => d.open = false);
  $("#qsearch").oninput = e => { const v = e.target.value.toLowerCase();
    $$("#qlist details.qrow").forEach(d => d.style.display = d.textContent.toLowerCase().includes(v) ? "" : "none"); };
  $("#rand").onclick = () => {
    const pool = items.filter(q => !ratings[q.key] || ratings[q.key] === "again");
    const src = pool.length ? pool : items, pick = src[Math.floor(Math.random() * src.length)];
    $("#qlist").innerHTML = qaRow(pick, items.indexOf(pick) + 1, ratings, isResume) +
      `<div class="row"><button class="btn small" id="qback">Back to full list</button></div>`;
    $("#qlist details.qrow").open = true;
    $("#qback").onclick = () => renderQA(arg);
    bindQA(ratings);
  };
}
function qaRow(q, n, ratings, notes) {
  const r = ratings[q.key];
  const mine = (S.qaNotes || {})[q.key] || "";
  return `<details class="qrow" data-key="${esc(q.key)}"><summary>
      <span class="qn">${n}</span><span class="qt">${esc(q.q)}</span>
      <span class="qmeta"><span class="badge">${esc(q.sec)}</span>${r ? `<span class="badge ${r === "solid" ? "ok" : r === "shaky" ? "warn" : "bad"}">${r}</span>` : ""}</span></summary>
    <div class="qbody"><h3>Answer</h3><div>${md(q.a)}</div>
      ${q.f ? `<h3>Likely follow-ups</h3><div>${md(q.f)}</div>` : ""}${q.m ? `<div class="tiein"><b>Your angle:</b> ${md(q.m)}</div>` : ""}
      ${notes || mine ? `<label class="muted">Your version (facts, numbers, wording)</label><textarea data-qnote="${esc(q.key)}">${esc(mine)}</textarea>` : ""}
      <div class="row"><span class="muted">How did you do?</span>${["again", "shaky", "solid"].map(k => `<button class="btn small ${r === k ? "primary" : ""}" data-rate="${k}">${k}</button>`).join("")}</div></div></details>`;
}
function bindQA(ratings) {
  $$("[data-rate]").forEach(b => b.onclick = () => {
    const row = b.closest("[data-key]"); ratings[row.dataset.key] = b.dataset.rate; save();
    b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("primary", x === b));
  });
  $$("[data-qnote]").forEach(t => t.oninput = () => { ensure("qaNotes", {})[t.dataset.qnote] = t.value; save(); });
}


// ---------------------------------------------------------------- Interview me (random questions from the Q&A bank)
let ivTimer = null, ivRec = null;
function ivPools() {
  const P = [
    { id: "mix", label: "Everything (no resume questions)", f: s => s.source !== "resume" },
    { id: "trouble", label: "🔧 Troubleshooting (K8s + Linux + Net)", f: s => ["K8s", "Linux", "Net"].includes(s.tag) },
    { id: "slo", label: "📈 SLOs + observability + incidents", f: s => ["SLO", "Obs", "Incident", "SRE"].includes(s.tag) },
    { id: "designp", label: "🏗 Design + release + capacity + resilience", f: s => ["Design", "Release", "Capacity", "Resilience"].includes(s.tag) },
    { id: "resume", label: "📄 From my resume + behavioural", f: s => s.source === "resume" || s.tag === "Behavioral" },
    { id: "all", label: "Absolutely everything", f: () => true }
  ];
  [...new Set(QA.map(s => s.tag))].forEach(t => P.push({ id: "tag:" + t, label: "Topic: " + t, f: s => s.tag === t }));
  return P;
}
function ivItems(poolId) {
  const pool = ivPools().find(p => p.id === poolId) || ivPools()[0];
  return QA.filter(pool.f).flatMap(s => s.items.map((q, i) => ({ ...q, key: s.tag + ":" + i, sec: s.title.replace(/^Resume: /, "") })));
}
function ivPick(items, n, weakOnly) {
  const R = S.qa || {}, w = k => !R[k] ? 3 : R[k] === "again" ? 4 : R[k] === "shaky" ? 2 : 0.5;
  let pool = weakOnly ? items.filter(q => R[q.key] !== "solid") : items.slice();
  const out = [];
  while (pool.length && out.length < n) {           // weighted random: "again" and unrated come up most
    const tot = pool.reduce((a, q) => a + w(q.key), 0); let r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= w(pool[i].key); if (r <= 0) break; }
    out.push(pool[i].key); pool.splice(i, 1);
  }
  return out;
}
function ivFind(key) {
  const [tag, i] = [key.slice(0, key.lastIndexOf(":")), +key.slice(key.lastIndexOf(":") + 1)];
  const sec = QA.find(s => s.tag === tag); const q = sec && sec.items[i];
  return q ? { ...q, key, sec: sec.title.replace(/^Resume: /, "") } : null;
}
async function renderInterview() {
  clearInterval(ivTimer);
  if (!QA) { view.innerHTML = "<p class='muted'>Loading…</p>"; QA = await api("/api/qa"); }
  const d = S.iv;
  if (d && !d.done) return ivQuestion();
  if (d && d.done) return ivSummary();
  const prefs = S.ivPrefs || { pool: "mix", n: 8, mins: 5, weak: true };
  const hist = (S.ivHistory || []).slice(-5).reverse();
  view.innerHTML = `<h1>🎤 Interview me</h1>
    <p class="muted">You get one random question at a time with a timer. <b>Answer out loud first</b>, then type (or dictate) the key points you said. Press <b>Submit</b> to see your answer next to the model answer, then rate yourself. Weak and unrated questions come up most often.</p>
    <div class="card"><div class="grid g2">
      <div><label class="muted">Question pool</label><br><select id="ivPool" style="width:100%;padding:6px">${ivPools().map(p => `<option value="${esc(p.id)}" ${p.id === prefs.pool ? "selected" : ""}>${esc(p.label)} (${ivItems(p.id).length})</option>`).join("")}</select></div>
      <div><label class="muted">Questions</label><br><select id="ivN" style="padding:6px">${[3, 5, 8, 10, 15].map(n => `<option ${n === prefs.n ? "selected" : ""}>${n}</option>`).join("")}</select>
        <label class="muted" style="margin-left:14px">Minutes per question</label> <select id="ivM" style="padding:6px">${[2, 3, 5, 7, 10].map(n => `<option ${n === prefs.mins ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    </div>
    <label style="display:block;margin-top:10px"><input type="checkbox" id="ivWeak" ${prefs.weak ? "checked" : ""}> Skip questions I've already rated <b>solid</b></label>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="ivStart">Start interview</button></div></div>
    ${hist.length ? `<h2>Recent interviews</h2>${hist.map(h => `<div class="card row"><span>${esc(h.date)} · ${esc(h.poolLabel)}</span><span class="spacer"></span>
      <span class="badge ok">${h.solid} solid</span><span class="badge warn">${h.shaky} shaky</span><span class="badge bad">${h.again} again</span></div>`).join("")}` : ""}`;
  $("#ivStart").onclick = () => {
    const pool = $("#ivPool").value, n = +$("#ivN").value, mins = +$("#ivM").value, weak = $("#ivWeak").checked;
    S.ivPrefs = { pool, n, mins, weak };
    let order = ivPick(ivItems(pool), n, weak);
    if (!order.length) order = ivPick(ivItems(pool), n, false);
    S.iv = { pool, poolLabel: (ivPools().find(p => p.id === pool) || {}).label, mins, order, i: 0, answers: {}, submitted: {}, rated: {}, started: {}, used: {}, done: false };
    save(); ivQuestion();
  };
}
function ivQuestion() {
  clearInterval(ivTimer); ivStopDictation();
  const d = S.iv, key = d.order[d.i], Q = ivFind(key);
  if (!Q) { d.i++; if (d.i >= d.order.length) d.done = true; save(); return renderInterview(); }
  if (!d.started[key]) { d.started[key] = Date.now(); save(); }
  const sub = !!d.submitted[key], r = d.rated[key];
  const canDictate = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  view.innerHTML = `<div class="row"><a href="#" id="ivQuit">← stop (progress kept)</a><span class="spacer"></span>
      <span class="muted">Question ${d.i + 1} of ${d.order.length} · ${esc(d.poolLabel || "")}</span></div>
    <div class="row"><span class="badge">${esc(Q.sec)}</span><span class="spacer"></span><div class="timer" id="ivT"></div></div>
    <div class="card"><div class="q" style="font-size:20px">${esc(Q.q)}</div>
      ${sub ? "" : `<p class="muted">Think for 20-30 seconds, then answer <b>out loud</b> as if they're listening. Then capture your key points below.</p>`}
      <div class="row"><label class="muted">Your answer (key points, numbers you used)</label><span class="spacer"></span>
        ${canDictate && !sub ? `<button class="btn small" id="ivMic">🎙 Dictate</button>` : ""}</div>
      <textarea id="ivA" style="min-height:${sub ? 120 : 220}px" ${sub ? "readonly" : ""} placeholder="e.g. clarified scale first; cells = full stack per account; size by DB IOPS + blast radius; tenant move: CDC, short write freeze, flip routing map…">${esc(d.answers[key] || "")}</textarea>
      ${sub ? "" : `<div class="row" style="margin-top:10px"><button class="btn primary" id="ivSubmit">Submit and show model answer</button><button class="btn" id="ivSkip">Skip</button></div>`}
    </div>
    ${sub ? `<div class="grid g2">
        <div class="card"><h3 style="margin-top:0">Model answer</h3>${md(Q.a)}${Q.m ? `<div class="tiein"><b>Your angle:</b> ${md(Q.m)}</div>` : ""}</div>
        <div class="card"><h3 style="margin-top:0">Follow-ups they'd ask next</h3>${Q.f ? md(Q.f) : '<p class="muted">None listed.</p>'}
          <p class="muted">Answer one follow-up out loud now. That's where senior interviews are won or lost.</p>
          <h3>How did you do?</h3><div class="row">${["again", "shaky", "solid"].map(k => `<button class="btn ${r === k ? "primary" : ""}" data-ivr="${k}">${k}</button>`).join("")}</div>
          <p class="muted">Time used: ${fmt(d.used[key] || 0)}</p>
          <div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn primary" id="ivNext" ${r ? "" : "disabled"}>${d.i < d.order.length - 1 ? "Next random question →" : "Finish and see summary"}</button></div></div>
      </div>` : ""}`;
  const limit = d.mins * 60;
  const tick = () => { const t = $("#ivT"); if (!t) return clearInterval(ivTimer);
    const el = sub ? (d.used[key] || 0) : Math.round((Date.now() - d.started[key]) / 1000);
    t.textContent = sub ? fmt(el) : fmt(limit - el); t.classList.toggle("over", !sub && el > limit); };
  tick(); if (!sub) ivTimer = setInterval(tick, 1000);
  $("#ivQuit").onclick = e => { e.preventDefault(); ivStopDictation(); clearInterval(ivTimer); go("mock"); };
  const ta = $("#ivA"); if (!sub) ta.oninput = () => { d.answers[key] = ta.value; save(); };
  const mic = $("#ivMic"); if (mic) mic.onclick = () => ivToggleDictation(mic, ta, key);
  const sb = $("#ivSubmit"); if (sb) sb.onclick = () => { d.answers[key] = ta.value; d.submitted[key] = true; d.used[key] = Math.round((Date.now() - d.started[key]) / 1000); save(); ivQuestion(); };
  const sk = $("#ivSkip"); if (sk) sk.onclick = () => { d.order.splice(d.i, 1); if (d.i >= d.order.length) d.done = true; save(); renderInterview(); };
  $$("[data-ivr]").forEach(b => b.onclick = () => { d.rated[key] = b.dataset.ivr; ensure("qa", {})[key] = b.dataset.ivr; save(); ivQuestion(); });
  const nx = $("#ivNext"); if (nx) nx.onclick = () => { if (d.i < d.order.length - 1) d.i++; else d.done = true; save(); renderInterview(); };
}
function ivToggleDictation(btn, ta, key) {
  if (ivRec) { ivStopDictation(); btn.textContent = "🎙 Dictate"; return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  ivRec = new SR(); ivRec.continuous = true; ivRec.interimResults = false; ivRec.lang = "en-IN";
  ivRec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
      ta.value = (ta.value ? ta.value.replace(/\s*$/, " ") : "") + e.results[i][0].transcript.trim(); S.iv.answers[key] = ta.value; save(); } };
  ivRec.onend = () => { if (ivRec) { try { ivRec.start(); } catch (_) {} } };
  ivRec.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { ivRec = null; btn.textContent = "🎙 Mic blocked"; } };
  ivRec.start(); btn.textContent = "⏹ Stop dictation";
}
function ivStopDictation() { if (ivRec) { const r = ivRec; ivRec = null; try { r.stop(); } catch (_) {} } }
function ivSummary() {
  const d = S.iv, keys = d.order.filter(k => d.submitted[k]);
  const c = k => keys.filter(x => d.rated[x] === k).length;
  if (!d.logged) { ensure("ivHistory", []).push({ date: new Date().toISOString().slice(0, 10), poolLabel: d.poolLabel, solid: c("solid"), shaky: c("shaky"), again: c("again") }); d.logged = true; save(); }
  view.innerHTML = `<h1>Interview summary</h1>
    <div class="row"><span class="badge ok">${c("solid")} solid</span><span class="badge warn">${c("shaky")} shaky</span><span class="badge bad">${c("again")} again</span>
      <span class="muted">· ${keys.length} answered · ${esc(d.poolLabel || "")}</span></div>
    ${keys.map(k => { const Q = ivFind(k); if (!Q) return ""; const r = d.rated[k];
      return `<details class="qrow"><summary><span class="qt">${esc(Q.q)}</span><span class="qmeta"><span class="badge">${fmt(d.used[k] || 0)}</span>
        <span class="badge ${r === "solid" ? "ok" : r === "shaky" ? "warn" : "bad"}">${r || "-"}</span></span></summary>
        <div class="qbody grid g2"><div><h3>Your answer</h3><div class="answer">${esc(d.answers[k] || "(nothing written)")}</div></div><div><h3>Model answer</h3>${md(Q.a)}</div></div></details>`; }).join("")}
    <div class="row" style="margin-top:14px"><button class="btn primary" id="ivAgain">New interview (same settings)</button>
      <button class="btn" id="ivRetry" ${c("again") + c("shaky") ? "" : "disabled"}>Redo my shaky + again ones</button><button class="btn" id="ivHome">Back</button></div>`;
  $("#ivAgain").onclick = () => { const p = S.ivPrefs; S.iv = null; save();
    const order = ivPick(ivItems(p.pool), p.n, p.weak); S.iv = { pool: p.pool, poolLabel: d.poolLabel, mins: p.mins, order: order.length ? order : ivPick(ivItems(p.pool), p.n, false), i: 0, answers: {}, submitted: {}, rated: {}, started: {}, used: {}, done: false }; save(); ivQuestion(); };
  $("#ivRetry").onclick = () => { const order = keys.filter(k => d.rated[k] !== "solid");
    S.iv = { pool: d.pool, poolLabel: "Redo: " + (d.poolLabel || ""), mins: d.mins, order, i: 0, answers: {}, submitted: {}, rated: {}, started: {}, used: {}, done: false }; save(); ivQuestion(); };
  $("#ivHome").onclick = () => { S.iv = null; save(); renderInterview(); };
}

// ---------------------------------------------------------------- stories
function renderStories() {
  const st = ensure("stories", {});
  const F = [["s", "Situation (2 lines)"], ["t", "Task: your responsibility"], ["a", "Actions: what YOU did (3 bullets)"], ["r", "Result: numbers"], ["l", "Learning: what you do differently now"]];
  view.innerHTML = `<h1>Story bank (STAR-L)</h1>
    <p class="muted">Eight stories cover nearly every behavioural question in an SRE loop. Each should take 2-3 minutes out loud (about 300-450 words) and contain at least two numbers. Saved automatically.</p>
    ${STORIES.map(s => { const v = st[s.id] || {}; const words = F.reduce((n, [k]) => n + ((v[k] || "").match(/\w+/g) || []).length, 0);
      const nums = F.reduce((n, [k]) => n + ((v[k] || "").match(/\d+/g) || []).length, 0);
      return `<div class="card"><div class="row"><h3 style="margin:0">${esc(s.title)}</h3><span class="spacer"></span>
        <span class="badge ${words >= 250 ? "ok" : words ? "warn" : ""}">${words} words · ~${Math.max(0, Math.round(words / 150 * 10) / 10)} min</span>
        <span class="badge ${nums >= 2 ? "ok" : "bad"}">${nums} numbers</span></div>
        <p class="muted">${esc(s.prompt)}</p>
        <div class="grid g2">${F.map(([k, label]) => `<div><label class="muted">${label}</label><textarea data-story="${s.id}" data-f="${k}">${esc(v[k] || "")}</textarea></div>`).join("")}</div></div>`; }).join("")}`;
  $$("[data-story]").forEach(t => t.oninput = () => { const o = st[t.dataset.story] = st[t.dataset.story] || {}; o[t.dataset.f] = t.value; save(); });
}

// ---------------------------------------------------------------- progress
function renderProgress() {
  const mock = S.mock || [], checks = S.checks || {}, qa = S.qa || {};
  const avg = id => { const v = mock.map(m => m.scores[id]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const labsDone = LABS.filter(l => labState(l.id) === "done").length;
  const qv = Object.values(qa);
  view.innerHTML = `<h1>Progress</h1>
    <div class="grid g3">
      <div class="card"><div class="muted">Plan tasks done</div><div class="timer">${PLAN.flatMap(d => d.tasks).filter(t => (S.plan || {})[t.id]).length}/${PLAN.flatMap(d => d.tasks).length}</div></div>
      <div class="card"><div class="muted">Mock rounds scored</div><div class="timer">${mock.length}</div></div>
      <div class="card"><div class="muted">Q&amp;A rated solid</div><div class="timer">${qv.filter(x => x === "solid").length}</div><div class="muted">${qv.filter(x => x !== "solid").length} still shaky or again</div></div>
    </div>
    <h2>Average by dimension</h2><div class="card">${SCORE_DIMS.map(d => `<div class="row" style="margin:6px 0"><span style="width:180px">${d.label}</span>
      <div class="bar" style="flex:1"><div style="width:${avg(d.id) * 20}%"></div></div><b style="width:40px;text-align:right">${avg(d.id) ? avg(d.id).toFixed(1) : "–"}</b></div>`).join("")}
      <p class="muted">Aim for 4+ everywhere by day 13. Spend extra time on your lowest bar.</p></div>
    <h2>Mock rounds</h2><div class="card">${mock.length ? `<table><tr><th>Date</th><th>Round</th><th>Mode</th>${SCORE_DIMS.map(d => `<th>${d.label.split(" ")[0]}</th>`).join("")}<th>Weak areas</th></tr>
      ${mock.slice().reverse().map(m => `<tr><td>${m.date}</td><td>${esc(m.round)}</td><td>${m.mode}</td>${SCORE_DIMS.map(d => `<td>${m.scores[d.id] || ""}</td>`).join("")}<td>${esc(m.weak)}</td></tr>`).join("")}</table>` : '<p class="muted">No rounds yet. Start one from the Mock rounds tab.</p>'}</div>`;
}

// ---------------------------------------------------------------- setup & help
function renderSetup() {
  view.innerHTML = `<h1>How to use this lab</h1>
    <div class="card"><ol>
      <li><b>Plan</b>: one day at a time. Tick tasks as you finish them. Progress is saved ${STATIC_MODE ? "in this browser" : "in <code>~/sre-lab/practice/practice-state.json</code>"}.</li>
      <li><b>Q&amp;A drill</b>: read the question, <b>answer out loud first</b>, then open the model answer and rate yourself: again / shaky / solid. Be strict.</li>
      <li><b>🎤 Interview me</b>: random questions with a timer; weak and unrated ones come up most. Dictation works in Chrome.</li>
      <li><b>Mock rounds</b>: Practice mode to learn (key visible), Real mode to rehearse (timed, probes one by one, self-score).${STATIC_MODE ? "" : " Scores also go to <code>~/sre-lab/practice/progress.md</code>."}</li>
      <li><b>Stories</b>: 8 STAR-L stories, 2-3 minutes each, at least 2 numbers. These answer most behavioural questions.</li>
      ${window.JD_MAP ? "<li><b>Target roles</b>: what Senior SRE JDs ask for vs your resume, and how to bridge gaps honestly.</li>" : ""}</ol></div>
    <div class="card"><h3 style="margin-top:0">The 6-step answer method</h3>
<pre>1 Clarify       what, who, since when, what changed?
2 Mitigate      impact first: roll back / fail over / scale / shed load
3 Narrow down   follow the request path; metrics → traces → logs
4 Hypothesis    say it, test it with one command, eliminate
5 Fix           smallest safe change; verify with the same signal
6 Prevent       postmortem, better alert, automation, guardrail</pre></div>
    ${STATIC_MODE ? `<div class="card"><h3 style="margin-top:0">Your progress</h3><p>Ticks, ratings, notes and scores are saved in <b>this browser only</b> (localStorage). Use the same browser each time; clearing site data resets it.</p>
      <div class="row"><button class="btn" id="exp">Export progress</button><label class="btn">Import progress<input type="file" id="imp" accept=".json" hidden></label></div></div>`
    : `<div class="card"><h3 style="margin-top:0">Start / stop</h3>
<pre>~/sre-lab/start-app.sh      # opens http://localhost:4300
~/sre-lab/stop-app.sh</pre></div>`}`;
  const ex = $("#exp"); if (ex) ex.onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "sre-lab-progress.json"; a.click(); };
  const im = $("#imp"); if (im) im.onchange = async () => { try { S = JSON.parse(await im.files[0].text()); save(); render(); } catch (e) { alert("Not a valid progress file"); } };
}

// ---------------------------------------------------------------- boot
(async function boot() {
  countdown(); setInterval(countdown, 60000);
  try { S = await api("/api/state"); } catch (e) { view.innerHTML = `<div class="card hint">Can't reach the app API: ${esc(e.message)}. Reload the page.</div>`; return; }
  if (!window.JD_MAP) { const b = document.querySelector('#tabs [data-tab="jd"]'); if (b) b.remove(); }
  render();                       // draw immediately; fleet status fills in when the first poll returns
  if (!STATIC_MODE) { pollStatus(); setInterval(pollStatus, 5000); }
})();
