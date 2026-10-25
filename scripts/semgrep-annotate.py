"""Turns Semgrep JSON output into GitHub annotations so findings show inline on pull requests.

Usage: python3 scripts/semgrep-annotate.py semgrep.json   (exits 1 if there are findings)
"""
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    report = json.load(f)

results = report.get("results", [])
for r in results:
    msg = r["extra"]["message"].replace("\n", " ").replace("%", "%25")
    print(f"::error file={r['path']},line={r['start']['line']},title={r['check_id']}::{msg}")
for e in report.get("errors", []):
    print(f"::warning title=semgrep error::{str(e.get('message', e))[:300]}")
print(f"{len(results)} finding(s)")
sys.exit(1 if results else 0)
