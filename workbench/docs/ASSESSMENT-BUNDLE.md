# Verifiable assessment bundles, canonical contract parity & baseline diffing — v0.1.9

This revision (`v0.1.9`) builds on the default-English and bilingual (`v0.1.8`) workbench and the evidence-bound provenance controller (`v0.1.7`). It solves four concrete verification and collaboration limitations in `v0.1.8` without altering the Intelligent Contract (`public/contracts/agent_sla.py`), SDK dependencies, or wallet signing safeguards:

1. **Indentation vs. on-chain canonical SHA-256 mismatch:** In `v0.1.8`, validating an indented local JSON draft (`public/fixtures/case.json`) produced text SHA-256 `e8e8746ec6383a112c369ac57ea8409c1298b39a0a8a950f50adceb6cfd47e71`, whereas deploying that exact same draft to `agent_sla.py` stored `canonical(parse_case(snapshot))` (`json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=True)`) on Studionet with SHA-256 `5e7433a01618bfbc7ab213c1b9bc5ac12eb186e20d1fd957ddd92e83ebe3624a`. Furthermore, non-ASCII drafts under 16,000 UTF-8 bytes could expand past 16,000 bytes after `ensure_ascii=True` `\uXXXX` escaping and revert on-chain.
2. **No portable, cryptographically verifiable review artifact:** In `v0.1.8`, `Download evidence` exported only the raw input JSON and `Export work record` omitted the evidence snapshot to avoid storing user payloads in `localStorage`. A counterparty, auditor, or Steward could not import a single self-contained file to verify the exact snapshot, canonical contract digest, rubric findings, and Studionet contract provenance.
3. **Opaque criterion-to-evidence traceability:** Finding cards listed evidence IDs (`E1`, `E2`) as plain labels without inline timestamp deltas (`submitted_at - due_at`), commit/pass-count breakdowns, or the cited evidence text snippets.
4. **No baseline diffing when remediating delivery defects:** Editing a draft in `v0.1.8` cleared prior findings (to prevent stale-read spoofing) but gave the user no structured comparison between the pinned baseline snapshot and the edited candidate draft.

---

## 1. Comparison: Accepted Baseline vs. `v0.1.7`, `v0.1.8`, and `v0.1.9`

| Stage | Software Version & Commit | Submission Type & Status | Scope Delivered |
| :--- | :--- | :--- | :--- |
| **Accepted Baseline** | `v0.1.5` (`e2a02e2625232039e80673b65a32033e2dbbccd2`) | Explorer Project (`2130`) — **Accepted** (2026-10-30) | Initial browser workbench, Studionet `61999` read/write integration, temporary session account safeguards. |
| **Milestone v1** | `v0.1.7` (`22fad4ca834dc064a724f086123ffeb6a2213e5b`) | Portal Milestone v1 — **Pending review** (2026-10-31) | Page-memory evidence-binding controller (`src/evidence-review.ts`), stale-read protection, bounded provenance metadata export. |
| **Explorer Revision 2** | `v0.1.8` (`58aaf25a6195b67439d88f04fb8b8610a5ea281c`) | Explorer Project Revision 2 — **Pending review** (2026-11-09) | Default English (`en`) regardless of browser locale, explicit **English / Chinese** switcher (`src/i18n.ts`), faithful raw evidence/on-chain text preservation. |
| **Current Increment** | `v0.1.9` (`src/assessment-bundle.ts` + UI/test integration) | Prepared for next Milestone (`v2`) & public release | Byte-exact Python contract canonicalization (`canonicalizeJson`), dual SHA-256 fingerprints, portable `agent-sla-assessment-bundle/v1` export & zero-trust import, read-only live Studionet (`61999`) cross-check, inline C1–C4 evidence traceability, and pinned baseline vs. candidate diffing. |

---

## 2. Architecture and Trust Boundaries

All `v0.1.9` core logic resides in [`src/assessment-bundle.ts`](../src/assessment-bundle.ts) and is wired into [`src/main.ts`](../src/main.ts) and [`src/i18n.ts`](../src/i18n.ts). The 9 core contract, domain, session, network, and provenance files remain byte-for-byte unchanged.

### 2.1 Byte-Exact Python Contract Canonicalization (`canonicalizeJson` & `validateContractCompatibleCase`)
- Replicates Python's `json.dumps(parse_case(snapshot), sort_keys=True, separators=(",", ":"), ensure_ascii=True)` byte-for-byte:
  - Sorts object keys by Unicode code-point order.
  - Escapes ASCII control characters (`\b`, `\t`, `\n`, `\f`, `\r`, `\u0000`–`\u001f`), `0x7f` (`\u007f`), and all non-ASCII UTF-16 code units (including surrogate pairs for supplementary planes) as lowercase `\uXXXX`.
  - Rejects unpaired UTF-16 surrogates (`hasLoneSurrogate`), float or exponent numeric tokens (`1.0`, `1e3`) that JS `Number.isSafeInteger` accepts but Python `type(v) is int` rejects (`hasFloatOrExponentNumberToken`), and Python-specific blank strings (`\x1c`–`\x1f`, `\x85`) while preserving `\ufeff` parity (`isPythonBlankString`).
  - Enforces the 16,000-byte UTF-8 limit on the **post-escaping canonical string** before any contract deployment quote is prepared.
- For `public/fixtures/case.json`, `canonicalizeCase` produces `5e7433a01618bfbc7ab213c1b9bc5ac12eb186e20d1fd957ddd92e83ebe3624a`, matching the live `get_snapshot()` digest on Studionet contract `0x12de9d0F0CEFC3697e76656A3b520c302e17faE9`.

### 2.2 Portable Verifiable Assessment Bundles (`agent-sla-assessment-bundle/v1`) & Zero-Trust Import
- **Export (`buildAssessmentBundle`):** Exports a self-contained JSON bundle (`<= 64,000` bytes in formatted output) only when an active, non-expired `local_preview`, `chain_snapshot`, or `chain_result` review is bound (`synthetic_example` is explicitly rejected).
- **Zero-Trust Import (`verifyAssessmentBundle`):** Recomputes `snapshotSha256`, validates contract-compatible schema and canonicalization, verifies `canonicalSnapshot` and `canonicalSha256`, recomputes deterministic `C1`/`C2` findings, and (for `chain_result`) validates canonical `resultRaw`, `resultSha256`, `C1`–`C4` order, and citation integrity.
- **Strict Trust-State Isolation:** Importing a bundle offline **never** calls `evidenceReview.accept()` with a live chain origin and never populates `evidence` (`chainRead` in exported work records remains `null`). Imported chain bundles are isolated in `imported_bundle` mode with trust status `unverified_on_chain` (`Imported bundle · Unverified on-chain`) until verified against live Studionet RPC.

### 2.3 Read-Only Live Studionet (`61999`) Cross-Check (`compareBundleWithLiveChain`)
- Clicking **Verify bundle against Studionet** queries live Studionet (`chainId === 61999`) read-only (no wallet required):
  1. Verifies deployed contract code SHA-256 equals `REVIEWED_SOURCE_SHA256` (`99cab7fc5bef8eb92dae0fad4ebfc2cf7cdeac5fbcf1ef3afdb1aeefcd7f9f5d`).
  2. Verifies on-chain `get_snapshot()` matches `bundle.canonicalSnapshot` and `bundle.canonicalSha256`.
  3. Verifies on-chain `get_result()` matches `bundle.assessment.resultRaw` and `bundle.assessment.resultSha256` (or upgrades an unassessed `chain_snapshot` bundle if `assess()` has since finalized on-chain).
- Only when all checks return `live_match` does the UI upgrade the view to `Bundle verified on Studionet (61999)` and record the live verification proof.

### 2.4 Inline Criterion Traceability & Pinned Baseline Diffing
- **`buildCriterionTraceability`:** Renders deterministic math (`submitted_at - due_at`, `report.commit` vs. `delivery_commit`, and `passed / total`) for `C1`/`C2` and inline cited evidence excerpts (`E1`, `E2`) for `C3`/`C4` inside `.finding-trace` blocks while keeping original `f.reason` paragraphs untouched.
- **`diffSnapshots`:** Compares a pinned baseline against the current draft across `case_id`, timestamps, `delivery_commit`, `report`, party statements, and `evidence` items, reporting immediate `C1`/`C2` status transitions and whether `C3`/`C4` semantic reassessment on GenLayer is required.

---

## 3. Reproduce Step-by-Step

From `workbench/` (`project-app/` locally) with Node.js 24+:

```sh
pnpm test
pnpm run build
pnpm run build:pages
node tests/bundle-browser.mjs
```

### Interactive Browser Verification
1. Open the workbench (`http://127.0.0.1:5173` locally or `https://glieser2.github.io/genlayer-agent-sla-demo/`). Confirm the UI defaults to **English** (`lang="en"`).
2. Click **Load synthetic case**, then **Validate evidence →**. Inspect both `Snapshot SHA-256` (`e8e8746e…`) and `Canonical Contract SHA-256` (`5e7433a0…`), plus inline `C1`/`C2` traceability summaries.
3. Click **Pin as baseline**, then edit `"passed": 11` to `"passed": 12` in the JSON editor. Observe:
   - Previous findings clear immediately (`Outdated · Review again`).
   - The **Baseline vs. current draft** panel shows `Test report (modified): pass count 11/12 → 12/12` and `Deterministic status impact: C1 (met → met), C2 (not_met → met)`.
4. Open **02 On-chain Assessment** and click **Read verified example contract** (`0x12de9d0F0CEFC3697e76656A3b520c302e17faE9`). Confirm `Snapshot SHA-256` and `Canonical Contract SHA-256` both equal `5e7433a0…` and `C3`/`C4` display inline `E1`/`E2` excerpts.
5. Click **Export assessment bundle ↓** to download `agent-sla-assessment-bundle.json`.
6. Use **Import bundle for review** to load `agent-sla-assessment-bundle.json`. Observe the warning badge `Imported bundle · Unverified on-chain`.
7. Click **Verify bundle against Studionet**. Observe `Studionet (61999) live cross-check passed` and the upgraded badge `Bundle verified on Studionet (61999)`.
8. Switch between **English** and **Chinese** at any step and confirm zero Chinese characters appear in English UI chrome while raw evidence and on-chain findings remain unmodified.

---

## 4. Independent Claude Security & Logic Audit Report

- **Implementation & Design Analysis Model:** `claude-sonnet-5-5-high` via `run_role.py --role claude` (clean CLI context).
- **Independent Audit Model:** `claude-sonnet-5-5-high` via `run_role.py --role claude` in a separate, clean zero-history review invocation (Note: `claude-opus-5-5-high` via `--role review` was invoked first on a `<32 KiB` self-contained prompt, but hit the CLI's fixed 120-second `--print-timeout`; per routing rules, no blind retry was performed and the audit was completed in a fresh `claude-sonnet-5-5-high` review session).

### Audit Findings & Resolutions

| ID | Location | Severity | Finding & Reproduction | Fix Applied & Re-verification |
| :--- | :--- | :--- | :--- | :--- |
| **A-1** | `src/main.ts` (`pin-baseline`, `import-bundle`) | Medium | Pinning a baseline checked `!proof && !importedBundleState` without verifying that `currentResultView` was in an active validated state or that `canonicalSha === currentCanonicalSha256` after async hashing, and allowed pinning when `liveVerifyState.status === 'live_mismatch'`. | Restricted `pin-baseline` to active validated views (`currentResultView.mode === 'findings'` or `imported_bundle` without `live_mismatch`) and verified `canonicalSha === expectedCanonical` after `await digest(canonicalSnapshot)`. |
| **A-2** | `src/main.ts` (`read`) vs. `src/assessment-bundle.ts` (`validateCanonicalAssessmentResult`) | Medium | `read()` validated on-chain `get_result()` with `parseResult` only, whereas `buildAssessmentBundle` enforced `validateCanonicalAssessmentResult` (exact top-level keys, `C1`–`C4` order, sorted `evidence_ids`, non-blank `reason`). | Updated `read()` in `src/main.ts` to validate non-empty on-chain `get_result()` strings through `validateCanonicalAssessmentResult` so chain reads and bundle exports share identical rubric invariants. |
| **A-3** | `src/assessment-bundle.ts` (`buildAssessmentBundle`, `validateCanonicalAssessmentResult`) | Low–Medium | `buildAssessmentBundle` checked `MAX_BUNDLE_BYTES` (`64,000`) against compact `JSON.stringify(bundle)` while `download()` wrote 2-space indented JSON (`json(bundle)`); `validateCanonicalAssessmentResult` checked `rawResult.length <= 16000` (UTF-16 code units) instead of UTF-8 byte length. | Updated `buildAssessmentBundle` to measure UTF-8 bytes of `JSON.stringify(bundle, null, 2)` and updated `validateCanonicalAssessmentResult` to enforce `new TextEncoder().encode(rawResult).length <= MAX_SNAPSHOT_BYTES`. Added unit test coverage. |
| **A-4** | `src/assessment-bundle.ts` (`isPythonBlankString`) | Low | `PYTHON_ONLY_WHITESPACE_RE` used JS `\s`, which matches `\ufeff` (BOM), whereas Python `'\\ufeff'.isspace()` is `False`. | Replaced `\s` with an explicit Python `str.isspace()` Unicode character class (`PYTHON_WHITESPACE_RE`) excluding `\ufeff`. Added regression assertions in `tests/assessment-bundle.test.mjs`. |
| **A-5** | `src/main.ts` (`import`, `import-bundle`) | Low | Calling `evidenceReview.begin()` before checking `if (!f) return;` invalidated in-flight reads even when the user cancelled the file dialog. | Moved `const request = evidenceReview.begin();` after `if (!f) return;` in both file input handlers. |

### Residual & Inherent Limitations
- **RPC Trust Root & Non-Atomic Multi-Call Reads:** `compareBundleWithLiveChain` performs read-only JSON-RPC calls (`getContractCode`, `get_snapshot`, `get_result`) against the configured Studionet RPC (`https://studio.genlayer.com/api`). Because the Intelligent Contract freezes `self.snapshot` at deployment and allows `assess()` at most once, finalized state does not mutate; however, the workbench trusts the configured Studionet RPC endpoint to return authentic chain state.
- **No Content Authentication or Escrow:** Cryptographic SHA-256 and canonical contract digests prove byte-for-byte integrity and on-chain snapshot parity; they do not authenticate whether the underlying real-world delivery claims are truthful, nor do they perform payment settlement or legal adjudication.
- **Historical Write Receipts Preserved:** All browser and Studionet checks in `v0.1.9` are read-only against existing deployed contract `0x12de9d0F0CEFC3697e76656A3b520c302e17faE9`. No new contract deployment or `assess()` write transaction is claimed for `v0.1.9`.
