# Evidence-bound assessment views — v0.1.7

This revision adds a page-memory assessment-provenance controller to the accepted Agent SLA Workbench project. It addresses a reproduced v0.1.6 failure: after reading an on-chain assessment, editing its evidence left all four old findings visible with an "On-chain result" badge. An in-flight read could also replace an edited draft when its RPC calls completed.

## Behavior and architecture

- Every evidence edit/replacement or contract-target edit advances the draft revision, invalidates pending read tickets, clears displayed findings and clears the current chain-read export. The UI labels a previous view "Outdated · Review again".
- Each asynchronous read, example load, import and preview captures a one-use ticket. Only the newest ticket for the current revision may apply results. An edit-away/edit-back sequence still invalidates an earlier ticket.
- Chain reads validate network identity, deployed source, the snapshot schema and the result before committing any field replacement. A late reply is discarded; the user's draft remains intact. This gate does not cancel an already-issued read-only network request.
- Accepted views show the case ID, origin, observation time and SHA-256 of the exact reviewed snapshot text. On-chain views also show the contract, chain and matched source SHA-256. Formatting changes are edits; these fingerprints bind exact text bytes, not a canonicalized JSON representation.
- Exported work records distinguish the current assessment from a bounded, last-ten metadata history. After editing, `chainRead` and `reviewProvenance.current` are null; prior fingerprints remain explicitly non-current. Only public metadata is retained, not raw evidence text, signing keys or account secrets. The history is page-memory only and is lost on reload.
- Fixed synthetic examples keep their own origin and are explicitly labelled as unrelated to the current draft. Local previews cannot carry chain-origin fields.

The controller is `src/evidence-review.ts`; integration and DOM updates are in `src/main.ts`. Existing source matching, dispatcher checks, account ownership, explicit confirmation and single-use signing guards are preserved. There is no change to the Intelligent Contract or its existing deployed addresses.

## Reproduce offline

With the pinned dependencies already installed, run from `workbench`:

```sh
pnpm test
pnpm run build:pages
pnpm run dev --port 5173 --strictPort
```

The source suite now has 44 tests, including ten new provenance tests. These cover exact snapshot binding, edit invalidation, delayed/out-of-order replies, edit-away/edit-back, one-use and forged tickets, distinct example/local origins, mandatory chain provenance, detached exports and the bounded history. Existing official-SDK mock write tests still run without live signing or broadcasting.

## Reproduce in the browser

1. Load the synthetic case and validate. Expect C1 Met, C2 Not met, plus a snapshot fingerprint.
2. Change the JSON to `{`. Expect zero findings, no active fingerprint and the Outdated label. Invalid JSON must not restore the previous findings.
3. Restore the case and validate. A new current revision and fingerprint appear.
4. Open On-chain Assessment, enter an existing source-matching Studionet contract and read it. Inspect both snapshot and source fingerprints. This is a read-only operation and requires no wallet.
5. Start another contract read, immediately switch to Prepare Evidence and edit the JSON while network work is pending. Expect "Read discarded" when that read completes, no restored findings and the edited draft unchanged. If the network is fast, repeat under ordinary network latency; the deterministic delayed-promise source test reproduces this case offline.
6. Change the contract address while a read is pending, including changing it back. The old request must still be discarded.
7. Export after editing. Expect `chainRead: null`, `reviewProvenance.current: null` and historical entries with `current: false`. After a fresh read, only the matching current proof and chain observation are active.

## Evidence boundaries

This is a browser-state integrity improvement. A fingerprint is not proof that supplied evidence is authentic, nor an independent verification of website measurements, payments or legal rights. It does not resolve prompt injection or model accuracy. Browser checks in this revision use existing deployed contracts; the v0.1.5 deployment/assess receipts remain historical, not new v0.1.7 write evidence.

The accepted baseline is v0.1.5, commit `e2a02e2625232039e80673b65a32033e2dbbccd2`. v0.1.6 added English copy. The new milestone work claimed here is evidence-state binding, delayed-read protection and provenance export, not that language update or a repeat of the original project submission. Milestone acceptance and any points are determined by the Portal reviewer.
