# Agent SLA Workbench

Browser application for reviewing synthetic website-delivery evidence against a fixed SLA rubric. It validates JSON, previews deterministic C1/C2 checks, verifies deployed source, runs an Intelligent Contract through GenLayer consensus, tracks finality and reads the C1–C4 findings.

**Revision 0.1.7.** Assessment views now bind to exact evidence fingerprints and page revisions. Editing evidence or a contract target clears outdated findings; late asynchronous reads cannot overwrite an edited draft. Exported records distinguish current provenance from historical fingerprints. See [the evidence-binding verification guide](docs/EVIDENCE-BINDING.md). The contract, SDK dependencies and signing safeguards are preserved. The original Projects submission was accepted on 2026-10-30; the historical live evidence below records v0.1.5, not a new v0.1.7 write run.

## Run and reproduce

Use Node.js 24+ and pnpm. Dependencies remain pinned: genlayer-js 1.1.8, TypeScript 7.0.2, Vite 8.3.5.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run test:studio-session
pnpm run build
pnpm run build:pages
pnpm run dev --port 5173 --strictPort
```

Open http://127.0.0.1:5173 in Chrome. The Pages build retains the /genlayer-agent-sla-demo/ base path. The test commands above use mocks and do not generate real keys or send real transactions. Separately authorized browser writes are recorded below.

## Account modes

- **External browser wallet:** requires the wallet's confirmation. A zero Studio dispatcher is rejected before requesting a signature. The app never automatically changes to another account after a refusal.
- **Temporary Studionet test account:** explicitly created in the page with the official SDK. The key is kept only in page memory. No private-key import/export, storage, logging, URL parameter or connection to the user's existing wallet is provided. It is distinct from the Portal wallet and the official Studio site's built-in account.
- Refreshing, closing or ending the temporary account loses its signing capability. Finish deployment and assess in the same page session. Existing contracts stay readable. Do not send assets to this disposable account.

The temporary route is restricted to stable Studionet **61999**, https://studio.genlayer.com/api, zero transaction value and zero gas price. Before preparing and signing, the app verifies network identity, runtime dispatcher and the supported five-argument addTransaction ABI. It rejects stale reviews, drift, unsupported ABIs and repeat signatures. This is an opt-in developer test route, not a production wallet.

## Browser workflow

1. Load the labelled synthetic case or import public evidence JSON; click **Validate evidence**.
2. Open **On-chain Assessment**, read the temporary-account notice, opt in and click **Create test account**.
3. Prepare deployment, review account/network/source/snapshot/fees, then separately confirm that operation.
4. Use **Transaction History → Check status** for the same ID until FINALIZED and execution SUCCESS. Finality alone is not success.
5. Keep the same page and account. Prepare and confirm assess for the contract deployed by this session. Source and frozen snapshot are rechecked; contracts owned by other accounts and already-assessed contracts are rejected.
6. Read the actual findings and export public transaction metadata. Unknown broadcast state blocks further signing in the session; investigate instead of redeploying.

The UI is English throughout, including validation and wallet feedback. Imported evidence and original on-chain findings retain their supplied text. See [the reviewer verification guide](docs/STUDIO-SESSION.md) for safeguards and exact testing limits.

## Tests and evidence boundaries

`tests/studio-session.test.mjs` executes the real pinned SDK against a fake account and intercepted RPC. Fake signature bytes are intentionally invalid outside that test. It decodes the resulting deployment and assess payloads to verify source, snapshot, function, sender, dispatcher and zero value. It also covers account lifetime, ABI/network drift, gas price, missing consensus events, pending/wrong/failed receipts and duplicate/expired approvals. No private key is generated and no call reaches the live network.

The other source tests cover evidence validation, receipt handling and evidence-bound views. The v0.1.7 source suite has 44 tests, including ten new provenance tests. All 44 source tests and the Pages production build passed locally. The fake-account tests and the historical live browser verification below are separate evidence.

## Verified in-app browser writes — 2026-10-30 (UTC+8)

The local v0.1.5 browser application completed one deployment and one assess through its temporary-account route in the user's Chrome. Both official Studio RPC receipts are **FINALIZED / SUCCESS**, with the same sender, zero value, deployment type 1 and assess type 2. The page verified deployed source and snapshot and displayed the actual result.

- Temporary sender: `0x43Cf9D33Dbb9a3206f2eCe92Dd2460790a0da9F2`.
- Contract: [0xc71F…4460](https://explorer-studio.genlayer.com/address/0xc71FfDb03c187Cce264EB39832CFd0A6cF384460).
- Deployment: [0x659708…d2d860](https://explorer-studio.genlayer.com/tx/0x6597080c33e4d9adff38ada38a5196bad22da22c233cf0e5a7faf85840d2d860).
- assess: [0xe5d1e3…40a5de](https://explorer-studio.genlayer.com/tx/0xe5d1e39c40c74ec81b4ed107c3b4e61a273e02c6a850f00b2d936e646940a5de).
- Result: C1 met; C2/C3/C4 not_met, with input/evidence references. The case and measurements are synthetic.
- The explicit zero-value/zero-gasPrice guards remained enabled. The temporary account was ended after verification; its key was not read, exported or persisted.

See [the verification record](docs/studio-session-live-2026-10-30.json) and [browser result screenshot](docs/studio-session-live-2026-10-30.png). These writes verified the local source revision before publication. Check the repository's Pages workflow for the deployment status of a particular commit.

**Historical live evidence, 2026-10-28:** the user deployed and assessed the unchanged contract in the separate official Studio UI, using its built-in test account. These are not new in-app v0.1.5 writes:
- Contract: [0x12de…faE9](https://explorer-studio.genlayer.com/address/0x12de9d0F0CEFC3697e76656A3b520c302e17faE9)
- Deployment: [FINALIZED/SUCCESS](https://explorer-studio.genlayer.com/tx/0x6cd7a290558ab19549cbebd5d794c85e59cf72309d196ebd76cca8adf679280b)
- assess: [FINALIZED/SUCCESS](https://explorer-studio.genlayer.com/tx/0x4af53904b20f6581db81e7669c44f67a974e35595d3064b4e089dd9cb2b05106)
- Results: C1 met; C2/C3/C4 not_met. Inputs and reported measurements are synthetic.

## Limitations

Studionet can reset. The temporary account is not recoverable after page loss and is not a persistent ownership solution. The contract assesses supplied evidence; it does not verify evidence authenticity, rerun website tests, settle payments, escrow assets or provide legal adjudication. Source matching and output validation do not guarantee model accuracy or resistance to prompt injection.

The live run verifies the local browser application, not an additional run from the hosted Pages site. Studionet/account eligibility and acceptance remain subject to Steward review. This revision addresses the existing Projects request; it is not a Milestones submission.

Official implementation references: [GenLayerJS](https://docs.genlayer.com/api-references/genlayer-js), [Studio account selection](https://github.com/genlayerlabs/genlayer-studio/blob/c94072951e483510329670aa427fba3fa6944f45/frontend/src/hooks/useGenlayer.ts). AI-assisted development; no new open-source licence added.
