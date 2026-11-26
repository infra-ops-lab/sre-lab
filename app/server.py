#!/usr/bin/env python3
"""SRE interview practice app: http://localhost:4300 (local only).

Serves the Q&A bank, mock rounds, stories and progress. State is saved to
~/sre-lab/practice/practice-state.json; mock scores are also appended to
~/sre-lab/practice/progress.md.
"""
import glob, json, os, re, secrets, shutil, subprocess
from datetime import date
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get("SRE_APP_PORT", "4300"))
APP = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(APP)
PRACTICE = os.path.join(LAB, "practice")
STATE_FILE = os.path.join(PRACTICE, "practice-state.json")
PROGRESS_MD = os.path.join(PRACTICE, "progress.md")
STATIC = os.path.join(APP, "static")
PRIVATE = os.path.join(LAB, "private")   # personal content: local only, never committed
TOKEN = secrets.token_hex(16)          # page gets it embedded; API calls must send it back
ALLOWED_HOSTS = {"localhost:%d" % PORT, "127.0.0.1:%d" % PORT}


def parse_qa():
    sections = []
    files = sorted(glob.glob(os.path.join(APP, "content", "qa-*.txt"))) + sorted(glob.glob(os.path.join(PRIVATE, "qa-*.txt")))
    for path in files:
        sec = q = field = None
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            if line.startswith("## "):
                title, _, tag = line[3:].partition("|")
                tag = tag.strip() or title.strip()
                sec = {"title": title.strip(), "tag": tag, "items": [],
                       "source": "resume" if tag.startswith("Resume") else "core"}
                sections.append(sec)
                q = None
                continue
            m = re.match(r"^([QAFM]):\s?(.*)$", line)
            if m and sec is not None:
                k, v = m.group(1), m.group(2)
                if k == "Q":
                    q = {"q": v, "a": "", "f": "", "m": ""}
                    sec["items"].append(q)
                    field = None
                    continue
                field = k.lower()
                if q is not None:
                    q[field] = (q[field] + "\n" + v).strip()
                continue
            if q is not None and field:
                q[field] = q[field] + "\n" + line
    angles = load_angles()
    for s in sections:
        for q in s["items"]:
            for k in ("a", "f", "m"):
                q[k] = q[k].strip()
            if not q["m"] and q["q"] in angles:
                q["m"] = angles[q["q"]]
    return sections


def load_angles():
    """private/angles.txt: 'Q: <exact question>' then 'M: <your angle>' lines."""
    out, q, buf = {}, None, []
    path = os.path.join(PRIVATE, "angles.txt")
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("Q: "):
            if q and buf:
                out[q] = "\n".join(buf).strip()
            q, buf = line[3:], []
        elif line.startswith("M: "):
            buf.append(line[3:])
        elif q and buf and line.strip():
            buf.append(line)
    if q and buf:
        out[q] = "\n".join(buf).strip()
    return out


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(d):
    os.makedirs(PRACTICE, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, indent=1)
    os.replace(tmp, STATE_FILE)


def append_progress(entry):
    s = entry.get("scores", {})
    new = not os.path.exists(PROGRESS_MD)
    with open(PROGRESS_MD, "a") as f:
        if new:
            f.write("| Date | Mode | Round | " + " | ".join(s.keys()) + " | Weak areas |\n|" + "---|" * (len(s) + 4) + "\n")
        f.write("| %s | %s | %s | %s | %s |\n" % (
            entry.get("date", date.today().isoformat()), entry.get("mode", ""), entry.get("round", "").replace("|", "/"),
            " | ".join(str(v) for v in s.values()), (entry.get("weak", "") or "").replace("|", "/").replace("\n", " ")[:200]))


def status():
    clusters = []
    if shutil.which("kind"):
        try:
            out = subprocess.run(["kind", "get", "clusters"], capture_output=True, text=True, timeout=10).stdout
            clusters = [{"name": c, "role": "lab", "status": "present", "ready": True, "state": "running"}
                        for c in out.split() if c.startswith("sre")]
        except Exception:
            pass
    return {"clusters": clusters, "services": [], "jobs": [], "today": date.today().isoformat(),
            "tools": {t: bool(shutil.which(t)) for t in ("kind", "kubectl", "helm", "docker")}}


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def ok_host(self):
        return self.headers.get("Host", "") in ALLOWED_HOSTS

    def api_ok(self):
        return self.ok_host() and secrets.compare_digest(self.headers.get("X-Lab-Token", ""), TOKEN)

    def body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n > 8 * 1024 * 1024:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if not self.ok_host():
            return self.send(403, {"error": "forbidden host"})
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if not self.api_ok():
                return self.send(403, {"error": "bad token"})
            if path == "/api/state":
                return self.send(200, load_state())
            if path == "/api/qa":
                return self.send(200, parse_qa())
            if path == "/api/status":
                return self.send(200, status())
            if path == "/api/solution":
                return self.send(200, {"files": []})
            return self.send(404, {"error": "not found"})
        return self.static(path)

    def do_POST(self):
        if not self.api_ok():
            return self.send(403, {"error": "forbidden"})
        path = urlparse(self.path).path
        try:
            b = self.body()
        except Exception as e:
            return self.send(400, {"error": str(e)})
        if path == "/api/state":
            save_state(b)
            return self.send(200, {"ok": True})
        if path == "/api/mocklog":
            append_progress(b)
            return self.send(200, {"ok": True})
        if path == "/api/check":
            return self.send(200, {"results": [{"name": "Lab checkers arrive in phase 2", "ok": False, "detail": ""}]})
        return self.send(404, {"error": "not found"})

    def static(self, path):
        if path in ("", "/"):
            html = open(os.path.join(STATIC, "index.html"), encoding="utf-8").read().replace("{{TOKEN}}", TOKEN)
            return self.send(200, html, "text/html; charset=utf-8")
        root = PRIVATE if path.startswith("/private/") else STATIC
        rel = path[len("/private/"):] if root == PRIVATE else path.lstrip("/")
        full = os.path.realpath(os.path.join(root, rel))
        if not full.startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(full):
            return self.send(404, "not found", "text/plain")
        types = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8"}
        with open(full, "rb") as f:
            return self.send(200, f.read(), types.get(os.path.splitext(full)[1], "application/octet-stream"))


if __name__ == "__main__":
    print("SRE practice app: http://localhost:%d" % PORT, flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
