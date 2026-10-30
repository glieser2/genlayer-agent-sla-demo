# Studio browser write route — v0.1.6 guide

The v0.1.6 update translates UI copy into English without changing the contract or signing flow. Historical verification snapshot: v0.1.5 implementation, 34 passing source tests, both passing builds, and one real local-browser deployment plus one assess verified on 2026-10-30 (UTC+8), before publication. Repository Actions records subsequent Pages deployment status; Portal acceptance is separate.

## Why this revision exists

The 2026-10-29 Steward request on Projects submission `071f7fee-a798-4d43-9734-59bd0cf32c62` requires an in-repository browser route that completes deployment and assess on the stated Studio configuration, with dispatcher/ABI checks and reproducible tests. Previously all workbench writes went through an external wallet, where the zero dispatcher is correctly blocked. The successful historical transactions were performed in the separate official Studio UI.

The pinned SDK, `genlayer-js@1.1.8`, supports local accounts as well as EIP-1193 providers. Official Studio selects those paths separately: [useGenlayer.ts](https://github.com/genlayerlabs/genlayer-studio/blob/c94072951e483510329670aa427fba3fa6944f45/frontend/src/hooks/useGenlayer.ts). The new workbench mode uses the SDK's local account path for a deliberately temporary developer account. It never takes the user's existing wallet key or silently retries a denied wallet action through another signer.

## Source map

| File | Responsibility |
|---|---|
| `src/studio-session.ts` | Explicit account lifetime, single-use reviews, runtime checks, guarded SDK writes and session deployment ownership |
| `src/studio.ts` | Public RPC, dispatcher/ABI validation, external-wallet zero-target guard, receipt normalization |
| `src/main.ts` | Explicit mode selection, separate operation review/consent, actual SDK call, journal, finality and result display |
| `tests/studio-session.test.mjs` | Real SDK serialization with fake account and RPC; zero real signing or network writes |

## Browser controls

| English label | Action |
|---|---|
| Load synthetic case / Validate evidence | Load the synthetic fixture / validate its schema |
| 02 On-chain Assessment | Open the contract interaction panel |
| Create test account | Opt in first, then create a new temporary account |
| Prepare deployment | Create an unsigned, five-minute deployment review |
| Confirm and send test deployment | Confirm exactly this deployment from the selected temporary account |
| 03 Transaction History / Check status | Inspect the same transaction ID until final execution is known |
| Prepare assessment | Prepare the single assess call for this session's confirmed deployment |
| Confirm and send test assessment | Confirm that separate call |
| End test account | Drop access to the account; the private key cannot be recovered |

Use the same page through deployment and assess. Keep the separate transaction confirmation checkbox unchecked until reviewing the operation. The test-account mode does not show a MetaMask popup: clicking its explicit confirm button authorizes SDK signing in the page. The external-wallet mode still requires its wallet confirmation and still rejects a zero dispatcher.

## Safeguards

- Pinned official RPC `https://studio.genlayer.com/api`, chain 61999; no endpoint, key or chain supplied through URL/form/storage.
- Account is created only by explicit `start(true)`, not at module load, page load, wallet error or preparation. It stays in memory; the app has no import/export/persistence facility for it.
- Chain identity, runtime dispatcher and exact five-input `addTransaction` ABI are checked at creation, preparation, submission and immediately before signing. Overloaded/ambiguous or six-input ABIs fail closed.
- Value must be zero and gas price zero. The unchanged contract source is hash-pinned. Evidence must pass schema validation.
- Reviews bind the source, evidence, action, dispatcher and account session, expire after five minutes, and are consumed before asynchronous submission. Ending/recreating a session invalidates previous reviews even if a test factory reuses an address.
- A guarded signer refuses a second signature for the same review, including SDK ABI fallback. An ambiguous post-signing error blocks further signing in the session. This is not a claim that an HTTP transport can never retransmit the same signed bytes.
- assess requires this session's finalized successful deployment receipt with matching sender/type/value/address. Source and frozen snapshot must match and get_result must be empty. Historical contracts belonging to the Studio UI account remain read-only.
- Pending, execution-unknown, wrong-type and failed transactions are never presented as successful deployment. Public transaction metadata can be journalled; the key and evidence body are not persisted.

## Reproducible offline checks

Run from the workbench directory with Node 24+:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run test:studio-session
pnpm run build
pnpm run build:pages
```

The 16 session tests replace all network calls and inject a fake local account. Its signTransaction callback returns deliberately invalid bytes, so it cannot broadcast a valid transaction. Tests do not invoke createAccount or generatePrivateKey. They execute real SDK deployContract/writeContract, decode the ABI and application payload, confirm full-consensus mode, and require both expected transactions to traverse the mock receipt path. Mock finality is labelled as a mock, not live chain evidence.

Negative cases include explicit opt-in, chain/dispatcher/ABI drift, late drift during SDK gas estimation, nonzero gas price, source/input changes, stale/forged/duplicate approvals, account replacement, ownership, incomplete/failed deployment, existing assess results, missing consensus events and SDK fallback after ambiguous send. Existing input/result and wallet-guard tests remain in the suite.

## Live browser verification

The user separately authorized one temporary account, one deployment and one assess. The local browser workbench, using its existing source and guards, completed both operations. The official RPC reports:

| Operation | Transaction | Type | Final status | Leader execution |
|---|---|---|---|---|
| Deployment | [0x659708…d2d860](https://explorer-studio.genlayer.com/tx/0x6597080c33e4d9adff38ada38a5196bad22da22c233cf0e5a7faf85840d2d860) | 1 | FINALIZED | SUCCESS |
| assess | [0xe5d1e3…40a5de](https://explorer-studio.genlayer.com/tx/0xe5d1e39c40c74ec81b4ed107c3b4e61a273e02c6a850f00b2d936e646940a5de) | 2 | FINALIZED | SUCCESS |

Sender for both: `0x43Cf9D33Dbb9a3206f2eCe92Dd2460790a0da9F2`. Contract: `0xc71FfDb03c187Cce264EB39832CFd0A6cF384460`. Both receipt values are zero; the application required gasPrice zero before signing. The live Studio dispatcher remained the official zero address; the exact supported ABI was validated. The external-wallet zero-target guard remains unchanged.

The browser read back the unchanged contract source, the reviewed synthetic snapshot and the final findings: C1 met; C2/C3/C4 not_met, citing INPUT:timestamps, INPUT:report, E1 and E2. The account was then explicitly ended, without reading, exporting or persisting its key. One pre-account network fetch failed before key generation; subsequent checks succeeded. No transaction was resent.

See [machine-readable live evidence](studio-session-live-2026-10-30.json), [browser result](studio-session-live-2026-10-30.png) and [offline test/build metadata](studio-session-verification.json). This is one verified synthetic run on a resettable development network, not a reliability or production-readiness claim. The evidence records the local run before publication, not a second hosted-site write test.

## Accepted project baseline

The corrected v0.1.5 Projects submission was accepted on 2026-10-30. This English UI update does not create a new Portal submission or claim another live write verification. Milestones requires a subsequent substantive upgrade beyond the accepted baseline.
