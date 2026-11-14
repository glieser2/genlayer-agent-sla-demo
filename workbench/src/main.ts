import './style.css';
import './action-feedback.css';
import {parseCase, parseResult, objectiveFindings, address, hash, receiptOutcome, parseJournal, type CaseInput, type Finding, type TxRecord} from './domain.ts';
import {CHAIN, readClient, makeWriter, checkNetwork, switchNetwork, contractUrl, transactionUrl, type Provider} from './network.ts';
import {studioRpc, normalizeStudioTransaction} from './studio.ts';
import {createStudioSession, type SessionReview} from './studio-session.ts';
import {createEvidenceReview, type ReviewOrigin} from './evidence-review.ts';
import {
  validateContractCompatibleCase,
  validateCanonicalAssessmentResult,
  canonicalizeCase,
  buildAssessmentBundle,
  verifyAssessmentBundle,
  compareBundleWithLiveChain,
  diffSnapshots,
  buildCriterionTraceability,
  type VerifiedBundleRecord,
  type LiveVerificationOutcome,
  type SnapshotDiff,
} from './assessment-bundle.ts';
import {
  COPY,
  loadLocale,
  saveLocale,
  formatByteCount,
  formatTimestamp,
  localizeAppReason,
  translateError,
  formatQuoteSummary,
  formatSubmitButton,
  containsHan,
  type Locale,
  type CopyDictionary,
} from './i18n.ts';

declare global { interface Window { ethereum?: Provider; } }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const appBase = import.meta.env.BASE_URL;
const asset = (path: string) => `${appBase}${path}`;
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);

// 初始化语言：忽略 navigator.language，仅当用户曾主动保存 zh-CN 时恢复中文，否则默认英文
let locale: Locale = loadLocale();
document.documentElement.lang = locale;
document.documentElement.setAttribute('translate', 'no');

const short = (v: string) => v ? `${v.slice(0, 8)}…${v.slice(-6)}` : COPY[locale].notConnected;

document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="${appBase}" aria-label="Agent SLA home"><span class="brandmark">↗</span><span><b id="brand-title">AGENT SLA</b><small id="brand-sub">Delivery Evidence Workbench</small></span></a><div class="header-right"><span class="network"><i></i><span id="network-badge">Studionet · 61999</span></span><div id="lang-switch" class="lang-switch" role="group" aria-label="Interface language"><button id="lang-en" type="button" class="lang-btn" aria-pressed="true">English</button><button id="lang-zh" type="button" class="lang-btn" aria-pressed="false">Chinese</button></div><button id="connect" class="dark">Connect wallet</button></div></header>
<main><section class="intro"><div><p id="intro-eyebrow" class="eyebrow">EVIDENCE BEFORE CONCLUSIONS</p><h1><span id="intro-title-1">Does the delivery meet the brief?</span><br><em id="intro-title-em">Let the evidence speak.</em></h1><p class="lede"><span id="intro-lede-1">Review delivery records against a fixed SLA rubric.</span><br><span id="intro-lede-2">Use GenLayer to assess layout and documentation evidence, with reasons you can review.</span></p></div><aside class="intro-card"><span id="workflow-label" class="micro">Workflow</span><ol><li><b>01</b><span id="step1-title">Prepare evidence</span><span id="step1-sub" class="step-sub">Time · Revision · Report · Statements</span></li><li><b>02</b><span id="step2-title">Run assessment</span><span id="step2-sub" class="step-sub">Freeze the evidence; verify findings and references</span></li><li><b>03</b><span id="step3-title">Review findings</span><span id="step3-sub" class="step-sub">See what is met, not met, or needs more evidence</span></li></ol></aside></section>
<div class="notice"><strong id="notice-badge">Development preview</strong><span id="notice-text">Synthetic examples and on-chain results are labelled separately. Assessments cover supplied evidence only, without authentication or payment settlement. Studionet may reset.</span></div>
<nav id="workspace-nav" class="steps" aria-label="Workspace"><button id="tab-prepare" class="tab active" data-panel="prepare">01　Prepare Evidence</button><button id="tab-chain" class="tab" data-panel="chain">02　On-chain Assessment</button><button id="tab-history" class="tab" data-panel="history">03　Transaction History</button></nav>
<section id="prepare" class="panel"><div class="workspace"><article class="card"><div class="card-title"><div><p id="case-eyebrow" class="eyebrow">CASE SNAPSHOT</p><h2 id="case-title">Your delivery evidence</h2></div><span id="case-status" class="pill">Not validated</span></div><p id="case-guide" class="muted">Import or edit JSON. Deployment freezes this evidence snapshot. Use public material only; never include passwords, private keys, or private personal data.</p><div class="toolbar"><button id="sample">Load synthetic case</button><label class="file-button" for="import"><span id="import-label">Import JSON</span><input type="file" id="import" accept=".json,application/json"></label><button id="save-input">Download evidence</button></div><label id="snapshot-sr-label" for="snapshot" class="sr-only">Delivery evidence JSON</label><textarea id="snapshot" spellcheck="false" placeholder="Load the synthetic case or paste your evidence JSON…"></textarea><div class="editor-footer"><span id="byte-count">0 / 16,000 bytes</span><button id="validate" class="dark">Validate evidence →</button></div></article><aside class="card criteria"><p id="rubric-eyebrow" class="eyebrow">SLA-DEMO-v1</p><h2 id="rubric-title">Four criteria. One evidence snapshot.</h2><div class="criterion"><b>C1</b><div><h3 id="c1-title">On-time delivery</h3><p id="c1-desc">Submitted on or before the agreed deadline.</p><small id="c1-tag">Deterministic check</small></div></div><div class="criterion"><b>C2</b><div><h3 id="c2-title">Tests and revision</h3><p id="c2-desc">The report matches the delivered revision and all tests pass.</p><small id="c2-tag">Deterministic check</small></div></div><div class="criterion"><b>C3</b><div><h3 id="c3-title">Responsive layout</h3><p id="c3-desc">No horizontal overflow at 360, 768, and 1440px.</p><small id="c3-tag">GenLayer semantic assessment</small></div></div><div class="criterion"><b>C4</b><div><h3 id="c4-title">Handover documentation</h3><p id="c4-desc">Install, run, and test instructions match the delivered revision.</p><small id="c4-tag">GenLayer semantic assessment</small></div></div><button id="show-example" class="full">View synthetic example ↗</button><p id="rubric-footnote" class="footnote">Insufficient evidence is a valid outcome, not an automatic delivery failure.</p></aside></div></section>
<section id="chain" class="panel hidden"><div class="workspace"><article class="card"><p id="chain-eyebrow" class="eyebrow">GENLAYER CONNECTION</p><h2 id="chain-title">Read a contract or deploy evidence</h2><p id="chain-network-notice" class="muted">Network: Studionet development network. This development network may reset. A Studionet deployment does not establish Bradbury deployment or Portal network eligibility.</p><div class="toolbar"><button id="check-network">Check network</button><a id="link-open-studio" href="https://studio.genlayer.com" target="_blank" rel="noreferrer">Open official Studio ↗</a><a id="link-download-contract" href="${asset('contracts/agent_sla.py')}" download>Download contract source ↓</a></div><p id="network-state" class="footnote">RPC not checked</p><label id="contract-label" for="contract">Contract address</label><div class="input-row"><input id="contract" placeholder="0x…" autocomplete="off"><button id="read" class="dark">Read results</button></div><p id="read-footnote" class="footnote">The deployed source must match the version bundled with this app. No wallet connection is needed to read results.</p><hr><h3 id="prepare-heading">Prepare a transaction</h3><p id="prepare-desc" class="muted">This app uses stable Studionet (61999) and SDK 1.1.8. The external-wallet route blocks the zero dispatcher. To test in-app writes, explicitly choose a temporary test account below. Accounts never switch automatically.</p><div class="toolbar"><button id="quote-deploy">Prepare deployment</button><button id="quote-assess">Prepare assessment</button></div><p id="prepare-footnote" class="footnote">Deployment freezes the current evidence. Only the deployer may call assess, once. Adding funds will not resolve the current wallet compatibility issue.</p></article><aside class="card"><p id="review-eyebrow" class="eyebrow">TRANSACTION REVIEW</p><h2 id="review-title">Review before signing</h2><p id="quote-empty" class="muted">Choose an account and prepare a transaction. Confirm temporary-account operations here; confirm external-wallet operations in your wallet.</p><pre id="quote-summary" class="hidden"></pre><label class="check"><input id="consent" type="checkbox"><span id="consent-label">I have reviewed the network, account, evidence, and fees and approve this operation. Confirming a temporary-account operation signs and sends it from this page. An external wallet requires its own confirmation.</span></label><button id="submit" class="dark full" disabled>Prepare a transaction first</button><p id="review-footnote" class="footnote">Never enter a private key or recovery phrase. After submission, keep querying the original transaction ID; a timeout does not trigger resubmission.</p></aside></div></section>
<section id="history" class="panel hidden"><article class="card"><div class="card-title"><div><p id="history-eyebrow" class="eyebrow">TRANSACTION JOURNAL</p><h2 id="history-title">Track progress without resubmitting</h2></div><button id="export">Export work record ↓</button></div><p id="history-desc" class="muted">Only transaction IDs, addresses, and statuses are saved locally, not the evidence body. Exported RPC observations are not Portal receipts.</p><label id="txid-label" for="txid">Existing transaction ID</label><div class="input-row"><input id="txid" placeholder="0x…"><button id="track">Check transaction</button></div><div id="journal"></div></article></section>
<section class="results card"><div class="card-title"><div><p id="results-eyebrow" class="eyebrow">ASSESSMENT</p><h2 id="results-title">Findings by criterion</h2></div><span id="result-source" class="pill">No results yet</span></div><p id="result-context" class="muted">Validate evidence to preview C1/C2. C3/C4 require an on-chain assessment. A separately labelled synthetic example is also available.</p><div id="findings" class="findings"></div></section><p id="message" role="status" aria-live="polite">Start by loading or importing an evidence snapshot.</p><footer><span id="footer-left">Agent SLA Workbench · v0.1.9</span><span id="footer-right">AI-assisted development · No escrow · No legal authority</span></footer></main>`;

const feedback = document.createElement('p');
feedback.id = 'chain-feedback';
feedback.className = 'action-feedback';
feedback.setAttribute('role', 'status');
feedback.setAttribute('aria-live', 'polite');
feedback.textContent = COPY[locale].chainFeedbackDefault;
$('quote-deploy').closest('.toolbar')!.before(feedback);

let account: `0x${string}` | undefined;
let walletReconnectNeeded = false;
const studioSession = createStudioSession(); // 仅在用户显式调用 start(true) 时生成内存测试账户
let writeRoute: 'wallet' | 'session' = 'wallet';
let sessionStateKind: 'default' | 'active' | 'ended' = 'default';
let checkedNetworkInfo: {chainId: number; rpc: string} | null = null;

const sessionControls = document.createElement('div');
sessionControls.innerHTML = `<h3 id="session-heading">Temporary Studionet Account</h3><p id="session-desc" class="muted">Deploy and assess in this page. This disposable account is separate from your Portal wallet and any existing Studio account. Its key stays only in page memory. Reloading, closing, or ending the account permanently removes signing access; deployed contracts remain readable. Complete both steps in the same session. Do not send assets to this account.</p><label class="check"><input id="session-consent" type="checkbox"><span id="session-consent-label">I agree to create an independent account in this page, restricted to zero-value, zero-gasPrice operations on Studionet.</span></label><div class="toolbar"><button id="start-session">Create test account</button><button id="end-session" disabled>End test account</button></div><p id="session-status" class="footnote">External-wallet mode is selected. The app will not switch to a test account automatically.</p>`;
$('quote-deploy').closest('.toolbar')!.before(sessionControls);

const readVerified = document.createElement('button');
readVerified.id = 'read-verified';
readVerified.textContent = COPY[locale].btnReadExample;
$('check-network').parentElement!.append(readVerified);

let busy = false;
let activeBusyButton: HTMLButtonElement | undefined;
let records: TxRecord[] = [];
try { records = parseJournal(localStorage.getItem('agent-sla:transactions:v1')); } catch { /* 存储不可用时安全降级 */ }

let evidence: Record<string, unknown> | null = null;
const evidenceReview = createEvidenceReview();

// v0.1.9 评估复核包操作栏、链上核验框与冻结基准对比面板
const bundleControls = document.createElement('div');
bundleControls.className = 'bundle-controls';
bundleControls.innerHTML = `<p id="bundle-guide" class="footnote"></p><div class="toolbar"><button id="export-bundle" type="button"></button><label class="file-button" for="import-bundle"><span id="import-bundle-label"></span><input type="file" id="import-bundle" accept=".json,application/json"></label><button id="verify-bundle-chain" type="button" class="dark hidden"></button><button id="pin-baseline" type="button"></button><button id="clear-baseline" type="button" class="hidden"></button></div>`;
$('findings').before(bundleControls);

const binding = document.createElement('div');
binding.id = 'review-binding';
binding.className = 'review-binding';
binding.hidden = true;
$('findings').before(binding);

const liveVerifyBox = document.createElement('div');
liveVerifyBox.id = 'live-verify-box';
liveVerifyBox.className = 'review-binding';
liveVerifyBox.hidden = true;
$('findings').before(liveVerifyBox);

const baselinePanel = document.createElement('div');
baselinePanel.id = 'baseline-panel';
baselinePanel.className = 'baseline-panel';
baselinePanel.innerHTML = `<h3 id="baseline-heading"></h3><div id="baseline-content"></div>`;
$('findings').after(baselinePanel);

// 当前已绑定的规范化快照哈希、案例结构、链上原始结果文本及离线导入评估包状态
let currentCanonicalSha256: string | null = null;
let currentParsedCase: CaseInput | null = null;
let currentChainResultRaw: string | null = null;
let importedBundleState: VerifiedBundleRecord | null = null;
let liveVerifyState: LiveVerificationOutcome | null = null;
let bundleVerifiedOnChain = false;

type PinnedBaseline = {
  rawSnapshot: string;
  caseId: string;
  canonicalSha256: string;
  pinnedAt: string;
};
let pinnedBaseline: PinnedBaseline | null = null;
let cachedBaselineDiff: {
  status: 'none' | 'invalid_draft' | 'ready';
  diff?: SnapshotDiff;
} = {status: 'none'};
let diffSequence = 0;

type Quote = {
  kind: 'deploy' | 'assess';
  account: `0x${string}`;
  contract: string;
  snapshot: string;
  code: string;
  balance: bigint;
  consensusTarget: string;
  at: number;
  route: 'wallet' | 'session';
  caseId: string;
  snapshotSha256: string;
  sourceSha256: string;
  sessionReview?: SessionReview;
};
let quote: Quote | null = null;

// 状态跟踪：确保切换语言时能够原样重绘当前消息、复核摘要、评估结果和校验状态，绝不清空草稿或指纹
type MessageState =
  | {kind: 'key'; key: keyof CopyDictionary; error: boolean}
  | {kind: 'error'; rawError: string}
  | {kind: 'checkingTx'; hash: string}
  | {kind: 'txSent'; id: string}
  | {kind: 'queryingTx'; id: string}
  | {kind: 'txStatus'; statusName?: string; execName?: string; failed: boolean};

let currentMessage: MessageState = {kind: 'key', key: 'msgInitial', error: false};
let chainFeedbackInitialized = false;
let caseValidated = false;

type ResultViewState =
  | {mode: 'none'}
  | {mode: 'outdated'; reasonKey: 'expireEvidenceReplaced' | 'expireTargetChanged' | 'expireEvidenceEdited' | 'expireContractEdited'}
  | {mode: 'findings'; findings: Finding[]; origin: ReviewOrigin; caseId: string; contract?: string}
  | {mode: 'imported_bundle'; record: VerifiedBundleRecord};

let currentResultView: ResultViewState = {mode: 'none'};

const snapshot = () => $<HTMLTextAreaElement>('snapshot').value;
const source = async () => {
  const r = await fetch(asset('contracts/agent_sla.py'));
  if (!r.ok) throw new Error('Could not load the contract source.');
  return r.text();
};
const digest = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');

function renderMessageState() {
  const c = COPY[locale];
  let text = '';
  let isError = false;
  switch (currentMessage.kind) {
    case 'key':
      text = c[currentMessage.key];
      isError = currentMessage.error;
      break;
    case 'error':
      text = translateError(currentMessage.rawError, locale);
      isError = true;
      break;
    case 'checkingTx':
      text = locale === 'zh-CN'
        ? `正在只读核对既有交易 ${short(currentMessage.hash)}，不会重发…`
        : `Checking an existing transaction (read-only): ${short(currentMessage.hash)} — no resubmission…`;
      break;
    case 'txSent':
      text = locale === 'zh-CN'
        ? `交易已发送：${currentMessage.id}。尚未确认执行成功。`
        : `Transaction sent: ${currentMessage.id}. Execution success is not yet confirmed.`;
      break;
    case 'queryingTx':
      text = locale === 'zh-CN'
        ? `正在查询 ${short(currentMessage.id)}，不会重发交易…`
        : `Querying ${short(currentMessage.id)} — no resubmission…`;
      break;
    case 'txStatus': {
      const sName = currentMessage.statusName ?? (locale === 'zh-CN' ? '未知' : 'Unknown');
      const eName = currentMessage.execName ?? (locale === 'zh-CN' ? '尚无执行结果' : 'No execution result yet');
      const tail = currentMessage.failed
        ? (locale === 'zh-CN' ? '执行未成功。' : 'Execution did not succeed.')
        : (locale === 'zh-CN' ? '稍后继续查询同一 ID。' : 'Query this same ID again later.');
      text = locale === 'zh-CN'
        ? `交易状态：${sName} / ${eName}。${tail}`
        : `Transaction status: ${sName} / ${eName}. ${tail}`;
      isError = currentMessage.failed;
      break;
    }
  }
  $('message').textContent = text;
  $('message').classList.toggle('error', isError);
  if (!chainFeedbackInitialized) {
    feedback.textContent = c.chainFeedbackDefault;
    feedback.classList.remove('error');
  } else {
    feedback.textContent = text;
    feedback.classList.toggle('error', isError);
  }
}

function setMessageKey(key: keyof CopyDictionary, error = false, syncChainFeedback = true) {
  currentMessage = {kind: 'key', key, error};
  if (syncChainFeedback) chainFeedbackInitialized = true;
  renderMessageState();
}

function setErrorMessage(rawError: string) {
  currentMessage = {kind: 'error', rawError};
  chainFeedbackInitialized = true;
  renderMessageState();
}

function renderHeaderAndAccount() {
  const c = COPY[locale];
  if (activeBusyButton === $('connect')) {
    $('connect').textContent = c.working;
  } else if (writeRoute === 'session' && account) {
    $('connect').textContent = locale === 'zh-CN' ? `测试 ${short(account)}` : `Test ${short(account)}`;
  } else if (account) {
    $('connect').textContent = short(account);
  } else if (walletReconnectNeeded) {
    $('connect').textContent = c.reconnectWallet;
  } else {
    $('connect').textContent = c.connectWallet;
  }

  if (sessionStateKind === 'active' && account) {
    $('session-status').textContent = locale === 'zh-CN'
      ? `本页测试账户 ${account}。部署和 assess 使用同一账户，刷新后不可恢复。`
      : `Temporary test account ${account}. Use this account for both deploy and assess. Signing access is lost on reload.`;
  } else if (sessionStateKind === 'ended') {
    $('session-status').textContent = c.sessionStatusEnded;
  } else {
    $('session-status').textContent = c.sessionStatusDefault;
  }

  if (checkedNetworkInfo) {
    $('network-state').textContent = locale === 'zh-CN'
      ? `已验证 chain ${checkedNetworkInfo.chainId} · ${checkedNetworkInfo.rpc}`
      : `Verified chain ${checkedNetworkInfo.chainId} · ${checkedNetworkInfo.rpc}`;
  } else {
    $('network-state').textContent = c.rpcNotChecked;
  }
}

function renderQuoteState() {
  if (!quote) {
    $('quote-summary').classList.add('hidden');
    $('quote-empty').classList.remove('hidden');
    $<HTMLButtonElement>('submit').disabled = true;
    if (activeBusyButton !== $('submit')) {
      $('submit').textContent = COPY[locale].btnSubmitDisabled;
    }
    return;
  }
  $('quote-summary').textContent = json(formatQuoteSummary({...quote, chainId: CHAIN.id}, locale));
  $('quote-summary').classList.remove('hidden');
  $('quote-empty').classList.add('hidden');
  $<HTMLButtonElement>('submit').disabled = !$<HTMLInputElement>('consent').checked;
  if (activeBusyButton !== $('submit')) {
    $('submit').textContent = formatSubmitButton(quote, locale);
  }
}

function invalidate() {
  quote = null;
  $<HTMLInputElement>('consent').checked = false;
  renderQuoteState();
}

function renderLiveVerifyBox() {
  liveVerifyBox.replaceChildren();
  liveVerifyBox.className = 'review-binding';
  if (!liveVerifyState) {
    liveVerifyBox.hidden = true;
    return;
  }
  liveVerifyBox.hidden = false;
  const title = document.createElement('strong');
  const detail = document.createElement('p');

  if (liveVerifyState.status === 'live_match') {
    title.textContent = locale === 'zh-CN'
      ? 'Studionet (61999) 实时交叉核验通过'
      : 'Studionet (61999) live cross-check passed';
    detail.textContent = COPY[locale].bundleTrustVerified;
    const meta = document.createElement('code');
    meta.textContent = `Contract: ${liveVerifyState.contract} · Canonical SHA-256: ${liveVerifyState.canonicalSha256}`;
    liveVerifyBox.append(title, detail, meta);
  } else if (liveVerifyState.status === 'live_mismatch') {
    liveVerifyBox.classList.add('mismatch');
    title.textContent = locale === 'zh-CN'
      ? 'Studionet 链上交叉核验未通过（发现不一致）'
      : 'Studionet on-chain cross-check failed (mismatch detected)';
    detail.textContent = liveVerifyState.reasons.join(' ');
    liveVerifyBox.append(title, detail);
  } else {
    liveVerifyBox.classList.add('warn');
    title.textContent = locale === 'zh-CN'
      ? 'Studionet 实时核验暂不可用（RPC 错误）'
      : 'Studionet live cross-check unavailable (RPC error)';
    detail.textContent = translateError(liveVerifyState.error, locale);
    liveVerifyBox.append(title, detail);
  }
}

function renderBinding() {
  binding.replaceChildren();
  binding.className = 'review-binding';
  const c = COPY[locale];

  // 1. 离线导入且尚未通过链上实时核验的评估复核包视图
  if (currentResultView.mode === 'imported_bundle') {
    const {bundle, trust} = currentResultView.record;
    binding.hidden = false;
    if (trust === 'unverified_on_chain') {
      binding.classList.add('warn');
    }
    const title = document.createElement('strong');
    title.textContent = trust === 'local_only'
      ? c.resultSourceBundleLocal
      : c.resultSourceBundleUnverified;
    const origins: Record<string, string> = {
      local_preview: c.originLocal,
      chain_snapshot: c.originChainSnapshot,
      chain_result: c.originChainResult,
    };
    const detail = document.createElement('p');
    detail.textContent = `${bundle.caseId} · ${origins[bundle.origin] ?? bundle.origin} · ${formatTimestamp(bundle.observedAt, locale)} (${bundle.observedAt})`;
    const snapshotHash = document.createElement('code');
    snapshotHash.textContent = `Snapshot SHA-256: ${bundle.snapshotSha256}`;
    const canonicalHash = document.createElement('code');
    canonicalHash.textContent = `Canonical Contract SHA-256: ${bundle.canonicalSha256}`;
    binding.append(title, detail, snapshotHash, canonicalHash);

    if (bundle.provenance) {
      const claim = document.createElement('p');
      claim.textContent = locale === 'zh-CN'
        ? `评估包声明的合约（待链上核验）· chain ${bundle.provenance.chainId} · ${bundle.provenance.contract}`
        : `Claimed contract in bundle (unverified on-chain) · chain ${bundle.provenance.chainId} · ${bundle.provenance.contract}`;
      const sourceHash = document.createElement('code');
      sourceHash.textContent = `Source SHA-256: ${bundle.provenance.sourceSha256}`;
      binding.append(claim, sourceHash);
    }
    const trustNote = document.createElement('p');
    trustNote.textContent = trust === 'local_only' ? c.bundleTrustLocal : c.bundleTrustUnverified;
    binding.append(trustNote);
    renderLiveVerifyBox();
    return;
  }

  // 2. 标准已绑定评估视图（含通过实时核验升级后的评估包）
  const proof = evidenceReview.current;
  binding.hidden = !proof;
  renderLiveVerifyBox();
  if (!proof) return;

  const title = document.createElement('strong');
  title.textContent = proof.origin === 'synthetic_example'
    ? c.bindingExampleTitle
    : locale === 'zh-CN'
      ? `证据绑定 · 修订版 ${proof.revision}`
      : `Evidence binding · Revision ${proof.revision}`;
  const origins: Record<ReviewOrigin, string> = {
    local_preview: c.originLocal,
    chain_snapshot: c.originChainSnapshot,
    chain_result: c.originChainResult,
    synthetic_example: c.originExample,
  };
  const detail = document.createElement('p');
  detail.textContent = `${proof.caseId} · ${origins[proof.origin]} · ${formatTimestamp(proof.observedAt, locale)} (${proof.observedAt})`;
  const snapshotHash = document.createElement('code');
  snapshotHash.textContent = `Snapshot SHA-256: ${proof.snapshotSha256}`;
  binding.append(title, detail, snapshotHash);

  if (currentCanonicalSha256) {
    const canonicalHash = document.createElement('code');
    canonicalHash.textContent = `Canonical Contract SHA-256: ${currentCanonicalSha256}`;
    binding.append(canonicalHash);
  }

  if (proof.contract) {
    const contract = document.createElement('p');
    contract.textContent = locale === 'zh-CN'
      ? `已校验源码 · chain ${proof.chainId} · ${proof.contract}`
      : `Verified source · chain ${proof.chainId} · ${proof.contract}`;
    const sourceHash = document.createElement('code');
    sourceHash.textContent = `Source SHA-256: ${proof.sourceSha256}`;
    binding.append(contract, sourceHash);
  }
  const note = document.createElement('p');
  note.textContent = c.bindingNote;
  binding.append(note);
}

function renderBundleButtons() {
  const verifyBtn = $<HTMLButtonElement>('verify-bundle-chain');
  const isUnverifiedChainBundle =
    currentResultView.mode === 'imported_bundle' && currentResultView.record.trust === 'unverified_on_chain';
  verifyBtn.classList.toggle('hidden', !isUnverifiedChainBundle);

  const clearBaselineBtn = $<HTMLButtonElement>('clear-baseline');
  clearBaselineBtn.classList.toggle('hidden', !pinnedBaseline);
}

function renderBaselinePanel() {
  const c = COPY[locale];
  $('baseline-heading').textContent = c.baselineHeading;
  const container = $('baseline-content');
  container.replaceChildren();

  if (!pinnedBaseline) {
    const empty = document.createElement('p');
    empty.textContent = c.baselineEmpty;
    container.append(empty);
    return;
  }

  const header = document.createElement('p');
  header.textContent = `${c.baselinePinnedPrefix} ${pinnedBaseline.caseId} · ${formatTimestamp(pinnedBaseline.pinnedAt, locale)}`;
  const baseHash = document.createElement('code');
  baseHash.textContent = `Baseline Canonical SHA-256: ${pinnedBaseline.canonicalSha256}`;
  container.append(header, baseHash);

  if (cachedBaselineDiff.status === 'invalid_draft' || !cachedBaselineDiff.diff) {
    const invalidMsg = document.createElement('p');
    invalidMsg.textContent = c.baselineDraftInvalid;
    container.append(invalidMsg);
    return;
  }

  const d = cachedBaselineDiff.diff;
  if (d.identicalCanonical) {
    const sameMsg = document.createElement('p');
    sameMsg.textContent = d.rawTextIdentical
      ? c.baselineIdentical
      : locale === 'zh-CN'
        ? `${c.baselineIdentical}（仅 JSON 空白或缩进格式不同。）`
        : `${c.baselineIdentical} (Only JSON whitespace or formatting differs.)`;
    container.append(sameMsg);
    return;
  }

  const summary = document.createElement('p');
  summary.textContent = c.baselineChangedSummary;
  const candHash = document.createElement('code');
  candHash.textContent = `Candidate Canonical SHA-256: ${d.candidateCanonicalSha256}`;
  const list = document.createElement('ul');
  list.className = 'baseline-list';

  const addItem = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.append(li);
  };

  if (d.caseId.changed) {
    addItem(
      locale === 'zh-CN'
        ? `案件 ID 变更：${d.caseId.before} → ${d.caseId.after}`
        : `case_id changed: ${d.caseId.before} → ${d.caseId.after}`,
    );
  }
  if (d.dueAt.changed || d.submittedAt.changed) {
    addItem(
      locale === 'zh-CN'
        ? `时间戳变更：due_at (${d.dueAt.before} → ${d.dueAt.after})，submitted_at (${String(d.submittedAt.before)} → ${String(d.submittedAt.after)})`
        : `Timestamps changed: due_at (${d.dueAt.before} → ${d.dueAt.after}), submitted_at (${String(d.submittedAt.before)} → ${String(d.submittedAt.after)})`,
    );
  }
  if (d.deliveryCommit.changed) {
    addItem(
      locale === 'zh-CN'
        ? `交付版本变更：${short(d.deliveryCommit.before)} → ${short(d.deliveryCommit.after)}`
        : `delivery_commit changed: ${short(d.deliveryCommit.before)} → ${short(d.deliveryCommit.after)}`,
    );
  }
  if (d.report.status !== 'unchanged') {
    const beforeRep = d.report.before ? `${d.report.before.passed}/${d.report.before.total}` : 'null';
    const afterRep = d.report.after ? `${d.report.after.passed}/${d.report.after.total}` : 'null';
    addItem(
      locale === 'zh-CN'
        ? `测试报告 (${d.report.status})：通过数 ${beforeRep} → ${afterRep}`
        : `Test report (${d.report.status}): pass count ${beforeRep} → ${afterRep}`,
    );
  }
  if (d.disputeClientChanged || d.disputeAgentChanged) {
    addItem(
      locale === 'zh-CN'
        ? `争议陈述已修改（client: ${d.disputeClientChanged ? '已改' : '未改'}，agent: ${d.disputeAgentChanged ? '已改' : '未改'}）`
        : `Party statements modified (client: ${d.disputeClientChanged ? 'changed' : 'unchanged'}, agent: ${d.disputeAgentChanged ? 'changed' : 'unchanged'})`,
    );
  }
  for (const ev of d.evidenceDiffs) {
    if (ev.status === 'unchanged') continue;
    addItem(
      locale === 'zh-CN'
        ? `证据项 ${ev.id} [${ev.status}]：标准 ${ev.criteriaAfter.join('/') || ev.criteriaBefore.join('/')}，长度 ${ev.lengthBefore} → ${ev.lengthAfter} 字符`
        : `Evidence ${ev.id} [${ev.status}]: criteria ${ev.criteriaAfter.join('/') || ev.criteriaBefore.join('/')}, length ${ev.lengthBefore} → ${ev.lengthAfter} chars`,
    );
  }
  if (d.evidenceOrderChanged) {
    addItem(
      locale === 'zh-CN'
        ? '证据数组顺序已变更（影响合约规范化哈希）。'
        : 'Evidence array order changed (affects canonical contract SHA-256).',
    );
  }

  addItem(
    locale === 'zh-CN'
      ? `确定性标准状态：C1 (${d.c1Status.before} → ${d.c1Status.after})，C2 (${d.c2Status.before} → ${d.c2Status.after})`
      : `Deterministic status impact: C1 (${d.c1Status.before} → ${d.c1Status.after}), C2 (${d.c2Status.before} → ${d.c2Status.after})`,
  );

  if (d.c3ReassessmentRequired || d.c4ReassessmentRequired) {
    const affected = [d.c3ReassessmentRequired ? 'C3' : '', d.c4ReassessmentRequired ? 'C4' : ''].filter(Boolean).join(' & ');
    addItem(
      locale === 'zh-CN'
        ? `语义评估影响：${affected} 的关联证据或上下文已变更，需部署新快照并运行链上 assess() 重新评估。`
        : `Semantic reassessment impact: ${affected} evidence or context changed; requires deploying the new snapshot and running on-chain assess().`,
    );
  }

  container.append(summary, candHash, list);
}

async function refreshBaselineDiff() {
  const seq = ++diffSequence;
  if (!pinnedBaseline) {
    cachedBaselineDiff = {status: 'none'};
    renderBaselinePanel();
    return;
  }
  try {
    const diff = await diffSnapshots(pinnedBaseline.rawSnapshot, snapshot());
    if (seq !== diffSequence) return;
    cachedBaselineDiff = {status: 'ready', diff};
  } catch {
    if (seq !== diffSequence) return;
    cachedBaselineDiff = {status: 'invalid_draft'};
  }
  renderBaselinePanel();
}

function renderResultView() {
  const c = COPY[locale];
  const criterionLabels: Record<string, string> = {
    C1: c.c1Title,
    C2: c.c2Title,
    C3: c.c3Title,
    C4: c.c4Title,
  };
  const statusLabels: Record<string, string> = {
    met: c.statusMet,
    not_met: c.statusNotMet,
    insufficient_evidence: c.statusInsufficient,
  };

  renderBundleButtons();

  if (currentResultView.mode === 'none') {
    $('result-source').textContent = c.resultSourceNone;
    $('result-context').textContent = c.resultContextDefault;
    $('findings').replaceChildren();
    renderBinding();
    return;
  }

  if (currentResultView.mode === 'outdated') {
    $('result-source').textContent = c.resultSourceOutdated;
    $('result-context').textContent = c[currentResultView.reasonKey];
    $('findings').replaceChildren();
    renderBinding();
    return;
  }

  let findings: Finding[];
  let origin: ReviewOrigin;
  let caseId: string;
  let contract: string | undefined;
  let provenance = c.resultSourceLocal;
  let context = '';

  if (currentResultView.mode === 'imported_bundle') {
    const rec = currentResultView.record;
    findings = rec.findings;
    origin = rec.bundle.origin;
    caseId = rec.bundle.caseId;
    contract = rec.bundle.provenance?.contract;
    if (rec.trust === 'local_only') {
      provenance = c.resultSourceBundleLocal;
      context = `${caseId} · ${c.bundleTrustLocal}`;
    } else {
      provenance = c.resultSourceBundleUnverified;
      context = `${caseId} · ${short(contract ?? '')} · ${c.bundleTrustUnverified}`;
    }
  } else {
    findings = currentResultView.findings;
    origin = currentResultView.origin;
    caseId = currentResultView.caseId;
    contract = currentResultView.contract;
    context = `${caseId} · ${c.contextLocalPreviewSuffix}`;
    if (origin === 'synthetic_example') {
      provenance = c.resultSourceExample;
      context = c.contextExample;
    } else if (origin === 'chain_snapshot') {
      provenance = c.resultSourceChainUnassessed;
      context = `${caseId} · ${c.contextChainUnassessedSuffix}`;
    } else if (origin === 'chain_result') {
      provenance = bundleVerifiedOnChain ? c.resultSourceBundleVerified : c.resultSourceChainResult;
      context = `${caseId} · ${short(contract ?? '')} · ${c.contextChainAssessedSuffix}`;
    }
  }

  $('result-source').textContent = provenance;
  $('result-context').textContent = context;
  $('findings').replaceChildren();
  renderBinding();

  const traceMap = new Map(
    (currentParsedCase ? buildCriterionTraceability(currentParsedCase, findings) : []).map(t => [t.criterionId, t]),
  );

  for (const f of findings) {
    const card = document.createElement('article');
    card.className = `finding ${f.status}`;
    const caption = document.createElement('p');
    caption.className = 'micro';
    caption.textContent = `${f.criterion_id} · ${criterionLabels[f.criterion_id] ?? f.criterion_id}`;
    const title = document.createElement('h3');
    title.textContent = statusLabels[f.status] ?? f.status;
    const localizedReason = localizeAppReason(f.reason, origin, locale);
    const reason = document.createElement('p');
    reason.textContent = localizedReason.text;
    if (localizedReason.isRawPreserved) {
      reason.setAttribute('data-raw-content', 'true');
    }
    const refs = document.createElement('small');
    refs.textContent = f.evidence_ids.length
      ? `${c.evidencePrefix}${f.evidence_ids.join(' · ')}`
      : c.noEvidenceToCite;
    card.append(caption, title, reason, refs);

    // 证据级结构化溯源明细（使用 div 而非 p，确保既往 .finding p:not(.micro) 选择器语义不变）
    const trace = traceMap.get(f.criterion_id as 'C1' | 'C2' | 'C3' | 'C4');
    if (trace) {
      const traceDiv = document.createElement('div');
      traceDiv.className = 'finding-trace';
      traceDiv.textContent = locale === 'zh-CN' ? trace.summaryZh : trace.summaryEn;
      for (const item of trace.citedItems) {
        const snippet = document.createElement('code');
        const previewText = [...item.text].length > 110 ? [...item.text].slice(0, 110).join('') + '…' : item.text;
        snippet.textContent = `${item.id} (${item.criteria.join(',')}): ${previewText}`;
        traceDiv.append(snippet);
      }
      card.append(traceDiv);
    }

    // 若在英文界面下链上原始返回内容含中文，显式添加英文标注说明其为未翻译的原始链上内容
    if (localizedReason.isRawPreserved && locale === 'en' && containsHan(f.reason)) {
      const rawBadge = document.createElement('small');
      rawBadge.className = 'raw-note';
      rawBadge.textContent = c.rawContentBadge;
      card.append(rawBadge);
    }
    $('findings').append(card);
  }
}

function expireResults(reasonKey: 'expireEvidenceReplaced' | 'expireTargetChanged' | 'expireEvidenceEdited' | 'expireContractEdited') {
  const hadResult = !!evidenceReview.current || !!importedBundleState || $('findings').childElementCount > 0;
  evidenceReview.changed();
  evidence = null;
  currentCanonicalSha256 = null;
  currentParsedCase = null;
  currentChainResultRaw = null;
  importedBundleState = null;
  liveVerifyState = null;
  bundleVerifiedOnChain = false;
  binding.hidden = true;
  binding.replaceChildren();
  liveVerifyBox.hidden = true;
  liveVerifyBox.replaceChildren();
  if (hadResult) {
    currentResultView = {mode: 'outdated', reasonKey};
  } else {
    currentResultView = {mode: 'none'};
  }
  renderResultView();
}

function updateByteCount() {
  const bytes = new TextEncoder().encode(snapshot()).length;
  $('byte-count').textContent = formatByteCount(bytes, locale);
}

function setInput(value: string, preserveReview = false) {
  if (!preserveReview) expireResults('expireEvidenceReplaced');
  $<HTMLTextAreaElement>('snapshot').value = value;
  invalidate();
  caseValidated = false;
  $('case-status').textContent = COPY[locale].statusNotValidated;
  updateByteCount();
  void refreshBaselineDiff();
}

function show(panel: string) {
  document.querySelectorAll('.panel').forEach(e => e.classList.toggle('hidden', e.id !== panel));
  document.querySelectorAll<HTMLElement>('.tab').forEach(e => e.classList.toggle('active', e.dataset.panel === panel));
}
document.querySelectorAll<HTMLElement>('.tab').forEach(e => e.addEventListener('click', () => show(e.dataset.panel!)));

function saveRecords() {
  try {
    localStorage.setItem('agent-sla:transactions:v1', json(records.slice(-40)));
  } catch {
    setMessageKey('msgStorageUnavailable', true);
  }
  renderRecords();
}

function renderRecords() {
  const c = COPY[locale];
  $('journal').replaceChildren();
  if (!records.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = c.journalEmpty;
    $('journal').append(p);
  }
  const outcomes: Record<string, string> = locale === 'zh-CN'
    ? {
        pending: '待确认',
        unknown: '执行状态未知',
        success: '执行成功',
        failed: '执行失败',
        wrong_type: '非合约交易，未完成部署/评估',
      }
    : {
        pending: 'Pending',
        unknown: 'Execution unknown',
        success: 'Succeeded',
        failed: 'Failed',
        wrong_type: 'Wrong transaction type; no deployment or assessment',
      };
  for (const r of [...records].reverse()) {
    const row = document.createElement('div');
    row.className = 'journal-row';
    const left = document.createElement('div');
    const link = document.createElement('a');
    link.href = transactionUrl(r.hash);
    link.target = '_blank';
    link.rel = 'noreferrer';
    const kindLabel = locale === 'zh-CN'
      ? (r.kind === 'deploy' ? '部署' : '评估')
      : (r.kind === 'deploy' ? 'deployment' : 'assessment');
    link.textContent = `${kindLabel} · ${short(r.hash)} ↗`;
    const meta = document.createElement('small');
    meta.textContent = `${outcomes[r.outcome] ?? r.outcome} · chain ${r.chainId} · ${formatTimestamp(r.createdAt, locale)}`;
    left.append(link, meta);
    const resume = document.createElement('button');
    resume.textContent = c.btnCheckStatus;
    resume.addEventListener('click', () => run(() => track(r.hash)));
    row.append(left, resume);
    $('journal').append(row);
  }
}

// 统一刷新全部静态与动态界面文案（切换语言时不触碰草稿内容、证据版本或签名复核有效性）
function applyLocale(nextLocale: Locale, persist = false) {
  locale = nextLocale;
  document.documentElement.lang = locale;
  if (persist) {
    saveLocale(locale);
  }
  const c = COPY[locale];
  document.title = c.docTitle;
  document.querySelector('.brand')!.setAttribute('aria-label', c.brandAria);
  $('brand-title').textContent = c.brandTitle;
  $('brand-sub').textContent = c.brandSub;
  $('network-badge').textContent = c.networkBadge;
  $('lang-switch').setAttribute('aria-label', c.langGroupAria);
  $('lang-en').textContent = c.langEnLabel;
  $('lang-zh').textContent = c.langZhLabel;
  $('lang-en').setAttribute('aria-pressed', String(locale === 'en'));
  $('lang-zh').setAttribute('aria-pressed', String(locale === 'zh-CN'));
  $('lang-en').classList.toggle('active', locale === 'en');
  $('lang-zh').classList.toggle('active', locale === 'zh-CN');

  $('intro-eyebrow').textContent = c.introEyebrow;
  $('intro-title-1').textContent = c.introTitleLine1;
  $('intro-title-em').textContent = c.introTitleEm;
  $('intro-lede-1').textContent = c.introLedeLine1;
  $('intro-lede-2').textContent = c.introLedeLine2;
  $('workflow-label').textContent = c.workflowLabel;
  $('step1-title').textContent = c.step1Title;
  $('step1-sub').textContent = c.step1Sub;
  $('step2-title').textContent = c.step2Title;
  $('step2-sub').textContent = c.step2Sub;
  $('step3-title').textContent = c.step3Title;
  $('step3-sub').textContent = c.step3Sub;
  $('notice-badge').textContent = c.noticeBadge;
  $('notice-text').textContent = c.noticeText;
  $('workspace-nav').setAttribute('aria-label', c.workspaceAria);
  $('tab-prepare').textContent = c.tabPrepare;
  $('tab-chain').textContent = c.tabChain;
  $('tab-history').textContent = c.tabHistory;

  $('case-eyebrow').textContent = c.caseEyebrow;
  $('case-title').textContent = c.caseTitle;
  $('case-status').textContent = caseValidated ? c.statusSchemaValid : c.statusNotValidated;
  $('case-guide').textContent = c.caseGuide;
  if (activeBusyButton !== $('sample')) $('sample').textContent = c.btnLoadSample;
  $('import-label').textContent = c.btnImportJson;
  if (activeBusyButton !== $('save-input')) $('save-input').textContent = c.btnDownloadEvidence;
  $('snapshot-sr-label').textContent = c.snapshotSrLabel;
  $<HTMLTextAreaElement>('snapshot').placeholder = c.snapshotPlaceholder;
  updateByteCount();
  if (activeBusyButton !== $('validate')) $('validate').textContent = c.btnValidate;

  $('rubric-eyebrow').textContent = c.rubricEyebrow;
  $('rubric-title').textContent = c.rubricTitle;
  $('c1-title').textContent = c.c1Title;
  $('c1-desc').textContent = c.c1Desc;
  $('c1-tag').textContent = c.deterministicTag;
  $('c2-title').textContent = c.c2Title;
  $('c2-desc').textContent = c.c2Desc;
  $('c2-tag').textContent = c.deterministicTag;
  $('c3-title').textContent = c.c3Title;
  $('c3-desc').textContent = c.c3Desc;
  $('c3-tag').textContent = c.semanticTag;
  $('c4-title').textContent = c.c4Title;
  $('c4-desc').textContent = c.c4Desc;
  $('c4-tag').textContent = c.semanticTag;
  if (activeBusyButton !== $('show-example')) $('show-example').textContent = c.btnShowExample;
  $('rubric-footnote').textContent = c.rubricFootnote;

  $('chain-eyebrow').textContent = c.chainEyebrow;
  $('chain-title').textContent = c.chainTitle;
  $('chain-network-notice').textContent = c.chainNetworkNotice;
  if (activeBusyButton !== $('check-network')) $('check-network').textContent = c.btnCheckNetwork;
  $('link-open-studio').textContent = c.linkOpenStudio;
  $('link-download-contract').textContent = c.linkDownloadContract;
  if (activeBusyButton !== readVerified) readVerified.textContent = c.btnReadExample;
  $('contract-label').textContent = c.contractLabel;
  $<HTMLInputElement>('contract').placeholder = c.contractPlaceholder;
  if (activeBusyButton !== $('read')) $('read').textContent = c.btnReadResults;
  $('read-footnote').textContent = c.readFootnote;

  $('session-heading').textContent = c.sessionHeading;
  $('session-desc').textContent = c.sessionDesc;
  $('session-consent-label').textContent = c.sessionConsentLabel;
  if (activeBusyButton !== $('start-session')) $('start-session').textContent = c.btnCreateSession;
  if (activeBusyButton !== $('end-session')) $('end-session').textContent = c.btnEndSession;

  $('prepare-heading').textContent = c.prepareHeading;
  $('prepare-desc').textContent = c.prepareDesc;
  if (activeBusyButton !== $('quote-deploy')) $('quote-deploy').textContent = c.btnPrepareDeploy;
  if (activeBusyButton !== $('quote-assess')) $('quote-assess').textContent = c.btnPrepareAssess;
  $('prepare-footnote').textContent = c.prepareFootnote;

  $('review-eyebrow').textContent = c.reviewEyebrow;
  $('review-title').textContent = c.reviewTitle;
  $('quote-empty').textContent = c.quoteEmpty;
  $('consent-label').textContent = c.consentLabel;
  $('review-footnote').textContent = c.reviewFootnote;

  $('history-eyebrow').textContent = c.historyEyebrow;
  $('history-title').textContent = c.historyTitle;
  if (activeBusyButton !== $('export')) $('export').textContent = c.btnExportRecord;
  $('history-desc').textContent = c.historyDesc;
  $('txid-label').textContent = c.txidLabel;
  $<HTMLInputElement>('txid').placeholder = c.txidPlaceholder;
  if (activeBusyButton !== $('track')) $('track').textContent = c.btnTrackTx;

  $('results-eyebrow').textContent = c.resultsEyebrow;
  $('results-title').textContent = c.resultsTitle;
  $('bundle-guide').textContent = c.bundleGuide;
  if (activeBusyButton !== $('export-bundle')) $('export-bundle').textContent = c.btnExportBundle;
  $('import-bundle-label').textContent = c.btnImportBundle;
  if (activeBusyButton !== $('verify-bundle-chain')) $('verify-bundle-chain').textContent = c.btnVerifyBundleChain;
  if (activeBusyButton !== $('pin-baseline')) $('pin-baseline').textContent = c.btnPinBaseline;
  if (activeBusyButton !== $('clear-baseline')) $('clear-baseline').textContent = c.btnClearBaseline;

  $('footer-left').textContent = c.footerLeft;
  $('footer-right').textContent = c.footerRight;

  if (activeBusyButton) {
    activeBusyButton.textContent = c.working;
  }

  renderHeaderAndAccount();
  renderQuoteState();
  renderResultView();
  renderBaselinePanel();
  renderRecords();
  renderMessageState();
}

$('lang-en').addEventListener('click', () => applyLocale('en', true));
$('lang-zh').addEventListener('click', () => applyLocale('zh-CN', true));

async function run(fn: () => Promise<void> | void, button?: HTMLButtonElement) {
  if (busy) {
    setMessageKey('msgBusy', false);
    return;
  }
  busy = true;
  document.body.classList.add('working');
  activeBusyButton = button;
  if (button) {
    button.disabled = true;
    button.textContent = COPY[locale].working;
  }
  try {
    await fn();
  } catch (e) {
    setErrorMessage(e instanceof Error ? e.message : String(e));
  } finally {
    busy = false;
    activeBusyButton = undefined;
    document.body.classList.remove('working');
    if (button) {
      if (button.id !== 'submit') {
        button.disabled = button.id === 'end-session' && writeRoute !== 'session';
      }
    }
    applyLocale(locale, false);
  }
}

async function walletCheck() {
  if (writeRoute === 'session') {
    if (!account || studioSession.address !== account) throw new Error('The temporary test account is no longer available.');
    await checkNetwork();
    return;
  }
  if (!window.ethereum || !account) throw new Error('Connect an external wallet first.');
  const chainId = Number(await window.ethereum.request({method: 'eth_chainId'}));
  const accounts = await window.ethereum.request({method: 'eth_accounts'}) as string[];
  if (chainId !== CHAIN.id || !accounts.some(a => a.toLowerCase() === account!.toLowerCase())) {
    account = undefined;
    walletReconnectNeeded = true;
    invalidate();
    renderHeaderAndAccount();
    throw new Error('The wallet account or network changed. Reconnect and prepare again.');
  }
  await checkNetwork();
}

async function compatible(contract: `0x${string}`) {
  const local = await source();
  const remote = await readClient.getContractCode(contract);
  const sourceHash = await digest(local);
  if (sourceHash !== await digest(remote)) throw new Error('The deployed source does not match this workbench. Assessment stopped; check the original deployed contract.');
  return sourceHash;
}

async function read(contract: `0x${string}`) {
  const request = evidenceReview.begin();
  await checkNetwork();
  const sourceSha256 = await compatible(contract);
  const rawSnapshot = await readClient.readContract({address: contract, functionName: 'get_snapshot', args: []});
  if (typeof rawSnapshot !== 'string') throw new Error('No valid evidence snapshot was returned.');
  const {parsed: c, canonicalSnapshot} = validateContractCompatibleCase(rawSnapshot);
  const result = await readClient.readContract({address: contract, functionName: 'get_result', args: []});
  if (typeof result !== 'string') throw new Error('Invalid on-chain assessment result text.');
  const validatedResult = result === '' ? null : validateCanonicalAssessmentResult(result, c);
  const parsed = validatedResult ? parseResult(validatedResult.canonicalResult, c) : null;
  const snapshotSha256 = await digest(rawSnapshot);
  const canonicalSha256 = await digest(canonicalSnapshot);
  const proof = {
    origin: parsed ? 'chain_result' as const : 'chain_snapshot' as const,
    caseId: c.case_id,
    snapshotSha256,
    sourceSha256,
    observedAt: new Date().toISOString(),
    chainId: CHAIN.id,
    contract,
  };
  if (!evidenceReview.accept(request, proof)) {
    throw new Error('Read discarded because the evidence or contract changed while it was loading. Your current draft was kept. Read again when ready.');
  }
  setInput(rawSnapshot, true);
  caseValidated = true;
  $('case-status').textContent = COPY[locale].statusSchemaValid;
  $<HTMLInputElement>('contract').value = contract;
  currentCanonicalSha256 = canonicalSha256;
  currentParsedCase = c;
  currentChainResultRaw = validatedResult ? validatedResult.canonicalResult : null;
  importedBundleState = null;
  liveVerifyState = null;
  bundleVerifiedOnChain = false;
  evidence = {
    chainId: CHAIN.id,
    contract,
    explorer: contractUrl(contract),
    snapshotSha256: proof.snapshotSha256,
    canonicalSha256,
    sourceSha256,
    observedAt: proof.observedAt,
    assessment: parsed,
  };
  currentResultView = {
    mode: 'findings',
    findings: parsed ? parsed.findings : objectiveFindings(c),
    origin: proof.origin,
    caseId: c.case_id,
    contract,
  };
  renderResultView();
  await refreshBaselineDiff();
  setMessageKey('msgResultsLoaded', false);
}

async function prepareQuote(kind: 'deploy' | 'assess') {
  invalidate();
  setMessageKey('msgPreparingConfig', false);
  await walletCheck();
  const route = writeRoute;
  const writer = route === 'wallet' ? await makeWriter(account!, window.ethereum!) : null;
  const unresolved = records.filter(r => r.account.toLowerCase() === account!.toLowerCase() && ['pending', 'unknown'].includes(r.outcome));
  for (const record of unresolved.slice(0, 3)) {
    currentMessage = {kind: 'checkingTx', hash: record.hash};
    chainFeedbackInitialized = true;
    renderMessageState();
    const tx = normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash', [hash(record.hash)]));
    if (!tx.sender || tx.sender.toLowerCase() !== record.account.toLowerCase()) {
      throw new Error('The previous transaction sender could not be verified. Check its original ID in Transaction History.');
    }
    record.outcome = !tx.isContractTransaction || tx.transactionType !== (record.kind === 'deploy' ? 1 : 2) ? 'wrong_type' : receiptOutcome(tx);
    if (record.outcome === 'success' && tx.contract) record.contract = tx.contract;
    saveRecords();
    if (kind === 'deploy' && record.kind === 'deploy' && record.outcome === 'success' && record.contract) {
      $<HTMLInputElement>('contract').value = record.contract;
      throw new Error('An existing deployment succeeded. Read that contract and continue its assessment instead of deploying again.');
    }
  }
  if (records.some(r => r.account.toLowerCase() === account!.toLowerCase() && ['pending', 'unknown'].includes(r.outcome))) {
    throw new Error('This account has an unresolved transaction. Open Transaction History and query its original ID. No new transaction was sent.');
  }
  const code = await source();
  let raw = snapshot();
  let contract = '';
  if (kind === 'deploy') {
    if (!raw.trim()) throw new Error('The evidence snapshot is empty. Open Prepare Evidence, load the synthetic case, and validate it before preparing a deployment.');
    validateContractCompatibleCase(raw);
    setMessageKey('msgCheckingSchema', false);
    const schema = await readClient.getContractSchemaForCode(code);
    if (!schema.methods?.assess || !schema.methods?.get_result) {
      throw new Error('The network could not recognize the contract interface. Check SDK and GenVM compatibility.');
    }
  } else {
    contract = address($<HTMLInputElement>('contract').value.trim());
    await compatible(address(contract));
    const stored = await readClient.readContract({address: address(contract), functionName: 'get_snapshot', args: []});
    const result = await readClient.readContract({address: address(contract), functionName: 'get_result', args: []});
    if (result !== '') throw new Error('This contract already has an assessment. assess cannot run again.');
    if (typeof stored !== 'string') throw new Error('The on-chain evidence snapshot is invalid.');
    validateContractCompatibleCase(stored);
    raw = stored;
    setInput(raw);
  }
  setMessageKey('msgReadingBalance', false);
  const balance = await readClient.getBalance({address: account!});
  const sessionReview = route === 'session' ? await studioSession.prepare({kind, code, snapshot: raw, contract}) : undefined;
  const consensusTarget = sessionReview?.target ?? writer!.chain.consensusMainContract!.address;
  const parsedCase = parseCase(raw);
  const snapshotSha256 = await digest(raw);
  const sourceSha256 = await digest(code);
  quote = {
    kind,
    account: account!,
    contract,
    snapshot: raw,
    code,
    balance,
    consensusTarget,
    at: Date.now(),
    route,
    caseId: parsedCase.case_id,
    snapshotSha256,
    sourceSha256,
    sessionReview,
  };
  renderQuoteState();
  setMessageKey('msgQuoteReady', false);
}

async function submit() {
  const q = quote;
  if (!q || !$<HTMLInputElement>('consent').checked) throw new Error('Review the transaction and check the confirmation box first.');
  if (Date.now() - q.at > 300000) {
    invalidate();
    throw new Error('This review expired. Prepare the transaction again.');
  }
  invalidate();
  await walletCheck();
  if (writeRoute !== q.route || account !== q.account || snapshot() !== q.snapshot || (q.kind === 'assess' && $<HTMLInputElement>('contract').value.trim() !== q.contract)) {
    invalidate();
    throw new Error('The evidence, account, or contract changed. Prepare again.');
  }
  let id: `0x${string}`;
  if (q.route === 'session') {
    if (!q.sessionReview) throw new Error('The temporary-account review is missing.');
    id = await studioSession.submit(q.sessionReview, true);
  } else {
    const writer = await makeWriter(account!, window.ethereum!);
    if (writer.chain.consensusMainContract?.address.toLowerCase() !== q.consensusTarget.toLowerCase()) {
      throw new Error('The Studio consensus target changed. Prepare the transaction again.');
    }
    id = q.kind === 'deploy'
      ? await writer.deployContract({code: q.code, args: [q.snapshot]})
      : await writer.writeContract({address: address(q.contract), functionName: 'assess', args: [], value: 0n});
  }
  hash(id);
  records.push({hash: id, kind: q.kind, chainId: CHAIN.id, account: q.account, contract: q.contract, createdAt: new Date().toISOString(), outcome: 'pending'});
  saveRecords();
  show('history');
  currentMessage = {kind: 'txSent', id};
  chainFeedbackInitialized = true;
  renderMessageState();
  await track(id);
}

async function track(value: string) {
  const id = hash(value);
  await checkNetwork();
  currentMessage = {kind: 'queryingTx', id};
  chainFeedbackInitialized = true;
  renderMessageState();
  const tx = normalizeStudioTransaction(await studioRpc('gen_getStudioTransactionByHash', [id]));
  const record = records.find(r => r.hash.toLowerCase() === id.toLowerCase());
  if (!tx.isContractTransaction || (record && tx.transactionType !== (record.kind === 'deploy' ? 1 : 2))) {
    if (record) {
      record.outcome = 'wrong_type';
      saveRecords();
    }
    setErrorMessage('This ID is not the expected contract operation. FINALIZED does not make it a successful deploy or assessment. Do not use this record to call assess.');
    return;
  }
  const outcome = receiptOutcome(tx);
  if (record) {
    record.outcome = outcome;
    saveRecords();
  }
  if (outcome !== 'success') {
    currentMessage = {
      kind: 'txStatus',
      statusName: tx.statusName ? String(tx.statusName) : undefined,
      execName: tx.txExecutionResultName ? String(tx.txExecutionResultName) : undefined,
      failed: outcome === 'failed',
    };
    chainFeedbackInitialized = true;
    renderMessageState();
    return;
  }
  const candidate = tx.contract;
  if (candidate) {
    const target = address(candidate);
    if (record) {
      record.contract = target;
      saveRecords();
    }
    await read(target);
  } else {
    setMessageKey('msgParseContractFailed', false);
  }
}

function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], {type: 'application/json;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bind(id: string, fn: () => Promise<void> | void) {
  $(id).addEventListener('click', () => run(fn, $(id) instanceof HTMLButtonElement ? $(id) as HTMLButtonElement : undefined));
}

bind('sample', async () => {
  const request = evidenceReview.begin();
  const r = await fetch(asset('fixtures/case.json'));
  if (!r.ok) throw new Error('Could not load the case.');
  const raw = json(await r.json());
  validateContractCompatibleCase(raw);
  if (!evidenceReview.isCurrent(request)) throw new Error('Example loading was discarded because the draft changed. Your draft was kept.');
  setInput(raw);
  setMessageKey('msgSampleLoaded', false);
});

bind('validate', async () => {
  const request = evidenceReview.begin();
  const raw = snapshot();
  const {parsed: c, canonicalSnapshot} = validateContractCompatibleCase(raw);
  const snapshotSha256 = await digest(raw);
  const canonicalSha256 = await digest(canonicalSnapshot);
  if (!evidenceReview.accept(request, {origin: 'local_preview', caseId: c.case_id, snapshotSha256, observedAt: new Date().toISOString()})) {
    throw new Error('The draft changed during validation. Validate it again.');
  }
  evidence = null;
  currentCanonicalSha256 = canonicalSha256;
  currentParsedCase = c;
  currentChainResultRaw = null;
  importedBundleState = null;
  liveVerifyState = null;
  bundleVerifiedOnChain = false;
  caseValidated = true;
  $('case-status').textContent = COPY[locale].statusSchemaValid;
  currentResultView = {mode: 'findings', findings: objectiveFindings(c), origin: 'local_preview', caseId: c.case_id};
  renderResultView();
  await refreshBaselineDiff();
  setMessageKey('msgValidated', false);
});

bind('show-example', async () => {
  const request = evidenceReview.begin();
  const [a, b] = await Promise.all([fetch(asset('fixtures/case.json')), fetch(asset('fixtures/demo-result.json'))]);
  if (!a.ok || !b.ok) throw new Error('Could not load the synthetic example.');
  const raw = await a.text();
  const {parsed: c, canonicalSnapshot} = validateContractCompatibleCase(raw);
  const demo = await b.json();
  const result = parseResult(json(demo.assessment), c);
  const snapshotSha256 = await digest(raw);
  const canonicalSha256 = await digest(canonicalSnapshot);
  if (!evidenceReview.accept(request, {origin: 'synthetic_example', caseId: c.case_id, snapshotSha256, observedAt: new Date().toISOString()})) {
    throw new Error('Example loading was discarded because the draft changed.');
  }
  evidence = null;
  currentCanonicalSha256 = canonicalSha256;
  currentParsedCase = c;
  currentChainResultRaw = null;
  importedBundleState = null;
  liveVerifyState = null;
  bundleVerifiedOnChain = false;
  currentResultView = {mode: 'findings', findings: result.findings, origin: 'synthetic_example', caseId: c.case_id};
  renderResultView();
  setMessageKey('msgShowingExample', false);
});

bind('save-input', () => {
  const {parsed: c} = validateContractCompatibleCase(snapshot());
  download('sla-evidence.json', json(c));
});

// 导出自包含可验证评估复核包（agent-sla-assessment-bundle.json）
bind('export-bundle', async () => {
  if (currentResultView.mode === 'imported_bundle') {
    throw new Error('Verify the imported bundle on-chain or re-validate the draft before exporting a new bundle.');
  }
  const proof = evidenceReview.current;
  if (!proof) {
    throw new Error('Validate the current draft or read an on-chain contract before exporting an assessment bundle.');
  }
  const bundle = await buildAssessmentBundle({
    origin: proof.origin,
    snapshot: snapshot(),
    boundSnapshotSha256: proof.snapshotSha256,
    boundCaseId: proof.caseId,
    observedAt: proof.observedAt,
    provenance: proof.contract
      ? {chainId: proof.chainId, contract: proof.contract, sourceSha256: proof.sourceSha256}
      : null,
    resultRaw: currentChainResultRaw,
  });
  download('agent-sla-assessment-bundle.json', json(bundle));
  setMessageKey('msgBundleExported', false);
});

// 对已导入且声明为链上来源的评估复核包执行 Studionet (61999) 实时交叉核验
bind('verify-bundle-chain', async () => {
  if (currentResultView.mode !== 'imported_bundle' || !importedBundleState) {
    throw new Error('Validate the current draft or read an on-chain contract before exporting an assessment bundle.');
  }
  const targetRecord = importedBundleState;
  const request = evidenceReview.begin();
  const liveReader = {
    async getChainId() {
      const info = await checkNetwork();
      checkedNetworkInfo = info;
      return info.chainId;
    },
    async getContractCode(contract: `0x${string}`) {
      return readClient.getContractCode(contract);
    },
    async getSnapshot(contract: `0x${string}`) {
      return readClient.readContract({address: contract, functionName: 'get_snapshot', args: []});
    },
    async getResult(contract: `0x${string}`) {
      return readClient.readContract({address: contract, functionName: 'get_result', args: []});
    },
  };

  const outcome = await compareBundleWithLiveChain(
    targetRecord,
    liveReader,
    $<HTMLInputElement>('contract').value,
  );
  if (!evidenceReview.isCurrent(request)) {
    throw new Error('Bundle verification discarded because the draft or contract changed while loading.');
  }
  liveVerifyState = outcome;

  if (outcome.status !== 'live_match') {
    renderResultView();
    if (outcome.status === 'live_mismatch') {
      throw new Error(outcome.reasons[0]);
    }
    throw new Error(outcome.error);
  }

  // 实时核验通过：升级为已验证链上状态并写入 evidenceReview
  const b = targetRecord.bundle;
  const effectiveOrigin = outcome.upgradedFindings ? ('chain_result' as const) : b.origin;
  const effectiveFindings = outcome.upgradedFindings ?? targetRecord.findings;
  const effectiveResultRaw = outcome.upgradedResultRaw ?? b.assessment?.resultRaw ?? null;
  const proof = {
    origin: effectiveOrigin,
    caseId: b.caseId,
    snapshotSha256: b.snapshotSha256,
    sourceSha256: outcome.sourceSha256,
    observedAt: outcome.checkedAt,
    chainId: outcome.chainId,
    contract: outcome.contract,
  };
  if (!evidenceReview.accept(request, proof)) {
    throw new Error('Bundle verification discarded because the draft or contract changed while loading.');
  }

  $<HTMLInputElement>('contract').value = outcome.contract;
  currentCanonicalSha256 = outcome.canonicalSha256;
  currentParsedCase = targetRecord.parsedCase;
  currentChainResultRaw = effectiveResultRaw;
  importedBundleState = null;
  bundleVerifiedOnChain = true;
  evidence = {
    chainId: outcome.chainId,
    contract: outcome.contract,
    explorer: contractUrl(outcome.contract),
    snapshotSha256: b.snapshotSha256,
    canonicalSha256: outcome.canonicalSha256,
    sourceSha256: outcome.sourceSha256,
    observedAt: outcome.checkedAt,
    assessment: effectiveResultRaw ? parseResult(effectiveResultRaw, targetRecord.parsedCase) : null,
  };
  currentResultView = {
    mode: 'findings',
    findings: effectiveFindings,
    origin: effectiveOrigin,
    caseId: b.caseId,
    contract: outcome.contract,
  };
  renderResultView();
  setMessageKey('msgBundleVerifiedLive', false);
});

// 锁存当前已校验快照为对比基准（绑定证据复核序号与规范化哈希）
bind('pin-baseline', async () => {
  const proof = evidenceReview.current;
  if (proof?.origin === 'synthetic_example') {
    throw new Error('Validate evidence, read a contract, or verify an imported bundle before pinning a baseline.');
  }
  const canPinValidatedView =
    (currentResultView.mode === 'findings' && !!proof) ||
    (currentResultView.mode === 'imported_bundle' &&
      !!importedBundleState &&
      (!liveVerifyState || liveVerifyState.status !== 'live_mismatch'));
  if (!currentParsedCase || !currentCanonicalSha256 || !canPinValidatedView) {
    throw new Error('Validate evidence, read a contract, or verify an imported bundle before pinning a baseline.');
  }
  const expectedCanonical = currentCanonicalSha256;
  const raw = snapshot();
  const {parsed, canonicalSnapshot} = validateContractCompatibleCase(raw);
  const canonicalSha = await digest(canonicalSnapshot);
  if (canonicalSha !== expectedCanonical || currentCanonicalSha256 !== expectedCanonical) {
    throw new Error('The active draft fingerprint no longer matches the bound review. Validate or read again.');
  }
  pinnedBaseline = {
    rawSnapshot: raw,
    caseId: parsed.case_id,
    canonicalSha256: canonicalSha,
    pinnedAt: new Date().toISOString(),
  };
  await refreshBaselineDiff();
  renderBundleButtons();
  setMessageKey('msgBaselinePinned', false);
});

bind('clear-baseline', () => {
  pinnedBaseline = null;
  cachedBaselineDiff = {status: 'none'};
  renderBundleButtons();
  renderBaselinePanel();
  setMessageKey('msgBaselineCleared', false);
});

bind('connect', async () => {
  invalidate();
  if (writeRoute === 'session') throw new Error('A temporary test account is active. End it before connecting an external wallet.');
  if (!window.ethereum) throw new Error('No wallet extension detected. Open this app in Chrome with your wallet installed.');
  const list = await window.ethereum.request({method: 'eth_requestAccounts'}) as string[];
  if (!list.length) throw new Error('No wallet account was authorized.');
  account = address(list[0]);
  walletReconnectNeeded = false;
  await switchNetwork(window.ethereum);
  await walletCheck();
  renderHeaderAndAccount();
  setMessageKey('msgWalletConnected', false);
});

bind('start-session', async () => {
  invalidate();
  const a = await studioSession.start($<HTMLInputElement>('session-consent').checked);
  account = a;
  walletReconnectNeeded = false;
  writeRoute = 'session';
  sessionStateKind = 'active';
  $<HTMLButtonElement>('end-session').disabled = false;
  renderHeaderAndAccount();
  setMessageKey('msgSessionCreated', false);
});

bind('end-session', () => {
  invalidate();
  studioSession.end();
  writeRoute = 'wallet';
  account = undefined;
  sessionStateKind = 'ended';
  $<HTMLInputElement>('session-consent').checked = false;
  $<HTMLButtonElement>('end-session').disabled = true;
  renderHeaderAndAccount();
  setMessageKey('msgSessionEnded', false);
});

bind('check-network', async () => {
  const n = await checkNetwork();
  checkedNetworkInfo = n;
  renderHeaderAndAccount();
  setMessageKey('msgNetworkChecked', false);
});

bind('read', () => read(address($<HTMLInputElement>('contract').value.trim())));

bind('read-verified', () => {
  const contract = address('0x12de9d0F0CEFC3697e76656A3b520c302e17faE9');
  $<HTMLInputElement>('contract').value = contract;
  invalidate();
  expireResults('expireTargetChanged');
  return read(contract);
});

bind('quote-deploy', () => prepareQuote('deploy'));
bind('quote-assess', () => prepareQuote('assess'));
bind('submit', submit);
bind('track', () => track($<HTMLInputElement>('txid').value.trim()));

bind('export', () => {
  download('agent-sla-work-record.json', json({
    app: 'agent-sla-workbench',
    version: '0.1.9',
    locale,
    generatedAt: new Date().toISOString(),
    transactions: records,
    chainRead: evidence,
    reviewProvenance: evidenceReview.exportMetadata(),
    note: COPY[locale].exportNote,
  }));
  setMessageKey('msgExported', false);
});

$('snapshot').addEventListener('input', () => {
  invalidate();
  expireResults('expireEvidenceEdited');
  caseValidated = false;
  $('case-status').textContent = COPY[locale].statusNotValidated;
  updateByteCount();
  void refreshBaselineDiff();
});

for (const id of ['contract']) {
  $(id).addEventListener('input', () => {
    invalidate();
    expireResults('expireContractEdited');
  });
}

$('consent').addEventListener('change', () => {
  $<HTMLButtonElement>('submit').disabled = !quote || !$<HTMLInputElement>('consent').checked;
});

$('import').addEventListener('change', () => run(async () => {
  const inputEl = $<HTMLInputElement>('import');
  const f = inputEl.files?.[0];
  inputEl.value = '';
  if (!f) return;
  const request = evidenceReview.begin();
  if (f.size > 16000) throw new Error('The file exceeds 16,000 bytes.');
  const raw = await f.text();
  validateContractCompatibleCase(raw);
  if (!evidenceReview.isCurrent(request)) throw new Error('Import discarded because the draft changed while the file was loading.');
  setInput(raw);
  setMessageKey('msgImported', false);
}));

// 导入并零信任核验可移植评估复核包
$('import-bundle').addEventListener('change', () => run(async () => {
  const inputEl = $<HTMLInputElement>('import-bundle');
  const f = inputEl.files?.[0];
  inputEl.value = '';
  if (!f) return;
  const request = evidenceReview.begin();
  if (f.size > 64000) throw new Error('The assessment bundle file must not exceed 64,000 bytes.');
  const raw = await f.text();
  const verified = await verifyAssessmentBundle(raw);
  if (!evidenceReview.isCurrent(request)) {
    throw new Error('Bundle import discarded because the draft changed while the file was loading.');
  }

  // 离线导入绝不直接写入 evidenceReview.accept(chain_*) 冒充实时链上读取
  setInput(verified.bundle.snapshot, false);
  caseValidated = true;
  $('case-status').textContent = COPY[locale].statusSchemaValid;
  if (verified.bundle.provenance) {
    $<HTMLInputElement>('contract').value = verified.bundle.provenance.contract;
  }
  currentCanonicalSha256 = verified.bundle.canonicalSha256;
  currentParsedCase = verified.parsedCase;
  currentChainResultRaw = verified.bundle.assessment?.resultRaw ?? null;
  importedBundleState = verified;
  liveVerifyState = null;
  bundleVerifiedOnChain = false;
  evidence = null;
  currentResultView = {mode: 'imported_bundle', record: verified};
  renderResultView();
  await refreshBaselineDiff();
  setMessageKey(
    verified.trust === 'local_only' ? 'msgBundleImportedLocal' : 'msgBundleImportedUnverified',
    false,
  );
}));

const provider = window.ethereum as Provider & {on?: (event: string, fn: () => void) => void};
for (const event of ['accountsChanged', 'chainChanged']) {
  provider?.on?.(event, () => {
    if (writeRoute === 'session') return;
    account = undefined;
    walletReconnectNeeded = true;
    invalidate();
    renderHeaderAndAccount();
    setMessageKey('msgWalletChanged', false);
  });
}

applyLocale(locale, false);
