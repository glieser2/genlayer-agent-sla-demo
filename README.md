# GenLayer Agent SLA Demo

An educational Intelligent Contract for assessing a supplied website-delivery evidence snapshot. It separates deadline and test-report checks from semantic findings, requires evidence references, and allows `insufficient_evidence`.

Original AI-assisted work. All fixtures are synthetic and model responses are canned. No network deployment, escrow, payment, evidence-authentication guarantee or legal authority is claimed.

## Behavior

`AgentSLAAdjudicator` freezes a validated snapshot at construction. Only its owner may call `assess()`, once. Read methods expose the snapshot and result.

- C1 compares supplied delivery/due timestamps.
- C2 checks supplied report revision and pass counts.
- C3 assesses supplied responsive-layout evidence.
- C4 assesses supplied documentation evidence.

An independent validator compares C3/C4 decisions and evidence references. Schema validation alone is not treated as agreement. Forged but internally consistent evidence can still mislead every participant. There is no evidence-update or payout method.

## Recorded validation

The unchanged source passed 23 policy tests, 6 official SDK direct-mode tests and 3 AST-lint checks on 25 October 2026 UTC (26 October Beijing time). See `verification.json` and `demo-result.json`. The summary preserves original run provenance while omitting local absolute paths.

Direct mode uses the actual SDK with in-memory storage and mocked nondeterminism. Tests explicitly invoke the captured validator. These results do not establish WASM compatibility, Studio deployment, live consensus, real-model accuracy, prompt-injection resistance or transaction costs.

## Reproduce on Windows

Recorded environment: Python 3.13.5, Windows AMD64. From this repository root:

```powershell
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe prepare_sdk.py
& .\.venv\Scripts\python.exe run_checks.py
& .\.venv\Scripts\python.exe demo.py
```

Setup downloads public packages and SDK artifacts. Prepared tests/demo need no wallet keys, paid models or transactions. The check runner is Windows-specific; Linux reproduction has not been verified.

Pinned tools: `genlayer-test==0.29.2`, `genvm-linter==0.11.0`, GenVM SDK artifact `v0.3.0-rc7`. These identify the recorded environment, not the latest releases. `prepare_sdk.py` adapts an obsolete loader archive name using the actual official release asset and unmodified extractor. Size is checked and a SHA-256 recorded; that local hash is not an independent signature. `windows_compat.py` narrowly handles the loader's Windows temporary-file deletion issue without replacing contract behavior or decision validation.

## Contents and limitations

`contracts/` contains the self-contained contract; `fixtures/` contains the fictional case and canned response; `tests/` contains policy and SDK checks. Setup, compatibility, check and demo scripts are included. `sdk-artifact.json` records artifact provenance. `PUBLICATION-MANIFEST.json` lists every reviewed file and hash, excluding the manifest itself.

The fixture's 11/12 website tests, revision ID and overflow values are invented inputs, not real website measurements. Authenticated evidence capture, bilateral consent, real-model evaluation and live execution remain future work. Public visibility and a faucet check do not establish Builder contribution acceptance or reward entitlement.

## References

- [GenLayer documentation](https://docs.genlayer.com/)
- [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [Direct-mode testing](https://docs.genlayer.com/api-references/genlayer-test/direct)
- [Official SDK release used](https://github.com/genlayerlabs/genvm/releases/tag/v0.3.0-rc7)
