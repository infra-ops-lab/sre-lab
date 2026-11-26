#!/usr/bin/env python3
"""Build the static website (GitHub Pages) into ./site.

Public content only: app/content/qa-*.txt and app/static. Nothing from ./private
is read. Progress is stored in the visitor's browser (localStorage).
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "app"))
import server  # reuse the Q&A parser

OUT = os.path.join(ROOT, "site")
server.PRIVATE = os.path.join(ROOT, "__no_private__")      # never include personal content

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(os.path.join(ROOT, "app", "static"), OUT)

qa = server.parse_qa()
for s in qa:
    for q in s["items"]:
        q["m"] = ""
with open(os.path.join(OUT, "qa.json"), "w") as f:
    json.dump(qa, f)

p = os.path.join(OUT, "index.html")
html = open(p, encoding="utf-8").read()
html = re.sub(r'\s*<script src="/private/[^"]+"></script>', "", html)
html = html.replace('<script>window.LAB_TOKEN = "{{TOKEN}}";</script>', "<script>window.STATIC_MODE = true;</script>")
html = re.sub(r'(src|href)="/', r'\1="', html)            # relative paths: the site lives under /sre-lab/
open(p, "w", encoding="utf-8").write(html)
open(os.path.join(OUT, ".nojekyll"), "w").close()
print("built %s: %d questions in %d sections" % (OUT, sum(len(s["items"]) for s in qa), len(qa)))
