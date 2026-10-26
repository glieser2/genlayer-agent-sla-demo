"""Capture real command output with UTC timestamps; preserve every run."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
logdir = ROOT / "logs" / stamp
logdir.mkdir(parents=True, exist_ok=True)
commands = {
    "policy-tests": [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "tests/test_policy.py", "-v", "--tb=short"],
    "direct-tests": [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "tests/test_direct.py", "-v", "--tb=short"],
    "ast-lint": [str(Path(sys.executable).parent / "genvm-lint.exe"), "lint", "contracts/agent_sla.py", "--json"],
}
summary = {"started_utc": stamp, "python": sys.version, "scope": "local_only_mocked_llm", "checks": {}}
for name, command in commands.items():
    env = dict(os.environ, PYTEST_DISABLE_PLUGIN_AUTOLOAD="1", PYTHONUTF8="1")
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env,
                               encoding="utf-8", errors="replace")
    output = completed.stdout + completed.stderr
    (logdir / f"{name}.log").write_text(
        f"UTC: {stamp}\nCOMMAND: {json.dumps(command)}\nEXIT: {completed.returncode}\n{output}",
        encoding="utf-8")
    summary["checks"][name] = {"exit_code": completed.returncode, "log": str(logdir / f"{name}.log")}
    print(f"{name}: exit={completed.returncode}\n{output}")
(logdir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"Logs: {logdir}")
sys.exit(any(c["exit_code"] for c in summary["checks"].values()))
