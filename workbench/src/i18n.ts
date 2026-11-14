// 语言切换、持久化回退与中英文文案管理（不影响证据哈希、合约或签名逻辑）
export type Locale = 'en' | 'zh-CN';
export const LOCALE_STORAGE_KEY = 'agent-sla:locale:v1';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

// 校验并规范化语言值，仅接受明确的 en 或 zh-CN
export function parseLocale(raw: unknown): Locale {
  if (raw === 'zh-CN' || raw === 'zh') return 'zh-CN';
  return 'en';
}

// 读取用户主动保存的语言偏好；无保存值、值非法或存储异常时一律默认英文（忽略 navigator.language）
export function loadLocale(storage?: StorageLike | null): Locale {
  try {
    const target = storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : storage;
    if (!target) return 'en';
    const raw = target.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'zh-CN') return 'zh-CN';
    return 'en';
  } catch {
    return 'en';
  }
}

// 保存用户主动选择的语言偏好；存储异常时静默降级不抛错
export function saveLocale(locale: Locale, storage?: StorageLike | null): boolean {
  try {
    const target = storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : storage;
    if (!target) return false;
    target.setItem(LOCALE_STORAGE_KEY, locale === 'zh-CN' ? 'zh-CN' : 'en');
    return true;
  } catch {
    return false;
  }
}

// 格式化数字（英文使用 en-US，中文使用 zh-CN）
export function formatNumber(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US').format(value);
  } catch {
    return String(value);
  }
}

// 格式化字节计数提示
export function formatByteCount(bytes: number, locale: Locale): string {
  const formatted = formatNumber(bytes, locale);
  const limit = formatNumber(16000, locale);
  return locale === 'zh-CN' ? `${formatted} / ${limit} 字节` : `${formatted} / ${limit} bytes`;
}

// 格式化时间戳为当前语言可读字符串，同时保留原始 ISO 字符串以供核对
export function formatTimestamp(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    const formatted = new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }).format(new Date(ms));
    return `${formatted} UTC`;
  } catch {
    return iso;
  }
}

// 检测文本是否包含汉字
export function containsHan(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

export type CopyDictionary = {
  docTitle: string;
  brandAria: string;
  brandTitle: string;
  brandSub: string;
  networkBadge: string;
  networkName: string;
  langGroupAria: string;
  langEnLabel: string;
  langZhLabel: string;
  connectWallet: string;
  reconnectWallet: string;
  notConnected: string;
  working: string;
  introEyebrow: string;
  introTitleLine1: string;
  introTitleEm: string;
  introLedeLine1: string;
  introLedeLine2: string;
  workflowLabel: string;
  step1Title: string;
  step1Sub: string;
  step2Title: string;
  step2Sub: string;
  step3Title: string;
  step3Sub: string;
  noticeBadge: string;
  noticeText: string;
  workspaceAria: string;
  tabPrepare: string;
  tabChain: string;
  tabHistory: string;
  caseEyebrow: string;
  caseTitle: string;
  statusNotValidated: string;
  statusSchemaValid: string;
  caseGuide: string;
  btnLoadSample: string;
  btnImportJson: string;
  btnDownloadEvidence: string;
  snapshotSrLabel: string;
  snapshotPlaceholder: string;
  btnValidate: string;
  rubricEyebrow: string;
  rubricTitle: string;
  c1Title: string;
  c1Desc: string;
  c2Title: string;
  c2Desc: string;
  c3Title: string;
  c3Desc: string;
  c4Title: string;
  c4Desc: string;
  deterministicTag: string;
  semanticTag: string;
  btnShowExample: string;
  rubricFootnote: string;
  chainEyebrow: string;
  chainTitle: string;
  chainNetworkNotice: string;
  btnCheckNetwork: string;
  linkOpenStudio: string;
  linkDownloadContract: string;
  btnReadExample: string;
  rpcNotChecked: string;
  contractLabel: string;
  contractPlaceholder: string;
  btnReadResults: string;
  readFootnote: string;
  sessionHeading: string;
  sessionDesc: string;
  sessionConsentLabel: string;
  btnCreateSession: string;
  btnEndSession: string;
  sessionStatusDefault: string;
  sessionStatusEnded: string;
  prepareHeading: string;
  prepareDesc: string;
  chainFeedbackDefault: string;
  btnPrepareDeploy: string;
  btnPrepareAssess: string;
  prepareFootnote: string;
  reviewEyebrow: string;
  reviewTitle: string;
  quoteEmpty: string;
  consentLabel: string;
  btnSubmitDisabled: string;
  reviewFootnote: string;
  historyEyebrow: string;
  historyTitle: string;
  btnExportRecord: string;
  historyDesc: string;
  txidLabel: string;
  txidPlaceholder: string;
  btnTrackTx: string;
  journalEmpty: string;
  btnCheckStatus: string;
  resultsEyebrow: string;
  resultsTitle: string;
  resultSourceNone: string;
  resultSourceOutdated: string;
  resultSourceLocal: string;
  resultSourceExample: string;
  resultSourceChainUnassessed: string;
  resultSourceChainResult: string;
  resultSourceBundleLocal: string;
  resultSourceBundleUnverified: string;
  resultSourceBundleVerified: string;
  resultContextDefault: string;
  btnExportBundle: string;
  btnImportBundle: string;
  btnVerifyBundleChain: string;
  btnPinBaseline: string;
  btnClearBaseline: string;
  bundleGuide: string;
  bundleTrustLocal: string;
  bundleTrustUnverified: string;
  bundleTrustVerified: string;
  baselineHeading: string;
  baselineEmpty: string;
  baselinePinnedPrefix: string;
  baselineDraftInvalid: string;
  baselineIdentical: string;
  baselineChangedSummary: string;
  statusMet: string;
  statusNotMet: string;
  statusInsufficient: string;
  evidencePrefix: string;
  noEvidenceToCite: string;
  rawContentBadge: string;
  bindingExampleTitle: string;
  bindingNote: string;
  originLocal: string;
  originChainSnapshot: string;
  originChainResult: string;
  originExample: string;
  msgInitial: string;
  msgSampleLoaded: string;
  msgValidated: string;
  msgShowingExample: string;
  msgWalletConnected: string;
  msgSessionCreated: string;
  msgSessionEnded: string;
  msgNetworkChecked: string;
  msgExported: string;
  msgImported: string;
  msgBundleExported: string;
  msgBundleImportedLocal: string;
  msgBundleImportedUnverified: string;
  msgBundleVerifiedLive: string;
  msgBaselinePinned: string;
  msgBaselineCleared: string;
  msgResultsLoaded: string;
  msgPreparingConfig: string;
  msgCheckingSchema: string;
  msgReadingBalance: string;
  msgQuoteReady: string;
  msgParseContractFailed: string;
  msgStorageUnavailable: string;
  msgBusy: string;
  msgWalletChanged: string;
  expireEvidenceReplaced: string;
  expireTargetChanged: string;
  expireEvidenceEdited: string;
  expireContractEdited: string;
  contextLocalPreviewSuffix: string;
  contextExample: string;
  contextChainUnassessedSuffix: string;
  contextChainAssessedSuffix: string;
  exportNote: string;
  footerLeft: string;
  footerRight: string;
};

export const COPY: Record<Locale, CopyDictionary> = {
  en: {
    docTitle: 'Agent SLA · Delivery Evidence Workbench',
    brandAria: 'Agent SLA home',
    brandTitle: 'AGENT SLA',
    brandSub: 'Delivery Evidence Workbench',
    networkBadge: 'Studionet · 61999',
    networkName: 'Studionet development network',
    langGroupAria: 'Interface language',
    langEnLabel: 'English',
    langZhLabel: 'Chinese',
    connectWallet: 'Connect wallet',
    reconnectWallet: 'Reconnect wallet',
    notConnected: 'Not connected',
    working: 'Working…',
    introEyebrow: 'EVIDENCE BEFORE CONCLUSIONS',
    introTitleLine1: 'Does the delivery meet the brief?',
    introTitleEm: 'Let the evidence speak.',
    introLedeLine1: 'Review delivery records against a fixed SLA rubric.',
    introLedeLine2: 'Use GenLayer to assess layout and documentation evidence, with reasons you can review.',
    workflowLabel: 'Workflow',
    step1Title: 'Prepare evidence',
    step1Sub: 'Time · Revision · Report · Statements',
    step2Title: 'Run assessment',
    step2Sub: 'Freeze the evidence; verify findings and references',
    step3Title: 'Review findings',
    step3Sub: 'See what is met, not met, or needs more evidence',
    noticeBadge: 'Development preview',
    noticeText: 'Synthetic examples and on-chain results are labelled separately. Assessments cover supplied evidence only, without authentication or payment settlement. Studionet may reset.',
    workspaceAria: 'Workspace',
    tabPrepare: '01　Prepare Evidence',
    tabChain: '02　On-chain Assessment',
    tabHistory: '03　Transaction History',
    caseEyebrow: 'CASE SNAPSHOT',
    caseTitle: 'Your delivery evidence',
    statusNotValidated: 'Not validated',
    statusSchemaValid: 'Schema valid',
    caseGuide: 'Import or edit JSON. Deployment freezes this evidence snapshot. Use public material only; never include passwords, private keys, or private personal data.',
    btnLoadSample: 'Load synthetic case',
    btnImportJson: 'Import JSON',
    btnDownloadEvidence: 'Download evidence',
    snapshotSrLabel: 'Delivery evidence JSON',
    snapshotPlaceholder: 'Load the synthetic case or paste your evidence JSON…',
    btnValidate: 'Validate evidence →',
    rubricEyebrow: 'SLA-DEMO-v1',
    rubricTitle: 'Four criteria. One evidence snapshot.',
    c1Title: 'On-time delivery',
    c1Desc: 'Submitted on or before the agreed deadline.',
    c2Title: 'Tests and revision',
    c2Desc: 'The report matches the delivered revision and all tests pass.',
    c3Title: 'Responsive layout',
    c3Desc: 'No horizontal overflow at 360, 768, and 1440px.',
    c4Title: 'Handover documentation',
    c4Desc: 'Install, run, and test instructions match the delivered revision.',
    deterministicTag: 'Deterministic check',
    semanticTag: 'GenLayer semantic assessment',
    btnShowExample: 'View synthetic example ↗',
    rubricFootnote: 'Insufficient evidence is a valid outcome, not an automatic delivery failure.',
    chainEyebrow: 'GENLAYER CONNECTION',
    chainTitle: 'Read a contract or deploy evidence',
    chainNetworkNotice: 'Network: Studionet development network. This development network may reset. A Studionet deployment does not establish Bradbury deployment or Portal network eligibility.',
    btnCheckNetwork: 'Check network',
    linkOpenStudio: 'Open official Studio ↗',
    linkDownloadContract: 'Download contract source ↓',
    btnReadExample: 'Read on-chain example ↗',
    rpcNotChecked: 'RPC not checked',
    contractLabel: 'Contract address',
    contractPlaceholder: '0x…',
    btnReadResults: 'Read results',
    readFootnote: 'The deployed source must match the version bundled with this app. No wallet connection is needed to read results.',
    sessionHeading: 'Temporary Studionet Account',
    sessionDesc: 'Deploy and assess in this page. This disposable account is separate from your Portal wallet and any existing Studio account. Its key stays only in page memory. Reloading, closing, or ending the account permanently removes signing access; deployed contracts remain readable. Complete both steps in the same session. Do not send assets to this account.',
    sessionConsentLabel: 'I agree to create an independent account in this page, restricted to zero-value, zero-gasPrice operations on Studionet.',
    btnCreateSession: 'Create test account',
    btnEndSession: 'End test account',
    sessionStatusDefault: 'External-wallet mode is selected. The app will not switch to a test account automatically.',
    sessionStatusEnded: 'Test account ended. Deployed contracts remain readable; the temporary key cannot be recovered.',
    prepareHeading: 'Prepare a transaction',
    prepareDesc: 'This app uses stable Studionet (61999) and SDK 1.1.8. The external-wallet route blocks the zero dispatcher. To test in-app writes, explicitly choose a temporary test account below. Accounts never switch automatically.',
    chainFeedbackDefault: 'Prepare a deployment to see progress or any issues here.',
    btnPrepareDeploy: 'Prepare deployment',
    btnPrepareAssess: 'Prepare assessment',
    prepareFootnote: 'Deployment freezes the current evidence. Only the deployer may call assess, once. Adding funds will not resolve the current wallet compatibility issue.',
    reviewEyebrow: 'TRANSACTION REVIEW',
    reviewTitle: 'Review before signing',
    quoteEmpty: 'Choose an account and prepare a transaction. Confirm temporary-account operations here; confirm external-wallet operations in your wallet.',
    consentLabel: 'I have reviewed the network, account, evidence, and fees and approve this operation. Confirming a temporary-account operation signs and sends it from this page. An external wallet requires its own confirmation.',
    btnSubmitDisabled: 'Prepare a transaction first',
    reviewFootnote: 'Never enter a private key or recovery phrase. After submission, keep querying the original transaction ID; a timeout does not trigger resubmission.',
    historyEyebrow: 'TRANSACTION JOURNAL',
    historyTitle: 'Track progress without resubmitting',
    btnExportRecord: 'Export work record ↓',
    historyDesc: 'Only transaction IDs, addresses, and statuses are saved locally, not the evidence body. Exported RPC observations are not Portal receipts.',
    txidLabel: 'Existing transaction ID',
    txidPlaceholder: '0x…',
    btnTrackTx: 'Check transaction',
    journalEmpty: 'No local transaction records yet.',
    btnCheckStatus: 'Check status',
    resultsEyebrow: 'ASSESSMENT',
    resultsTitle: 'Findings by criterion',
    resultSourceNone: 'No results yet',
    resultSourceOutdated: 'Outdated · Review again',
    resultSourceLocal: 'Local deterministic preview',
    resultSourceExample: 'Synthetic example · Fixed mock response',
    resultSourceChainUnassessed: 'On-chain evidence · Not assessed',
    resultSourceChainResult: 'On-chain result',
    resultSourceBundleLocal: 'Imported bundle · Local preview',
    resultSourceBundleUnverified: 'Imported bundle · Unverified on-chain',
    resultSourceBundleVerified: 'On-chain result · Bundle verified on Studionet',
    resultContextDefault: 'Validate evidence to preview C1/C2. C3/C4 require an on-chain assessment. A separately labelled synthetic example is also available.',
    btnExportBundle: 'Export verifiable bundle ↓',
    btnImportBundle: 'Import & verify bundle',
    btnVerifyBundleChain: 'Verify bundle on-chain ↗',
    btnPinBaseline: 'Pin as baseline',
    btnClearBaseline: 'Clear baseline',
    bundleGuide: 'Export a self-contained bundle (snapshot + SHA-256 digests + findings) or import one to verify hashes, rubric rules, and live Studionet contract state.',
    bundleTrustLocal: 'Cryptographically bound local preview bundle. No on-chain contract is claimed.',
    bundleTrustUnverified: 'Offline bundle hashes and rubric rules passed. On-chain provenance is unverified until checked against Studionet (61999).',
    bundleTrustVerified: 'Live Studionet (61999) cross-check passed: contract source, canonical snapshot, and on-chain findings match this bundle.',
    baselineHeading: 'Baseline comparison & reassessment impact',
    baselineEmpty: 'Pin a validated snapshot, on-chain read, or verified bundle as a baseline to compare edits and reassessment impact.',
    baselinePinnedPrefix: 'Pinned baseline:',
    baselineDraftInvalid: 'Current draft is not valid JSON or fails schema checks. Fix the draft to inspect field and criterion diffs against the pinned baseline.',
    baselineIdentical: 'The current draft has the exact same canonical contract snapshot as the pinned baseline. No criterion statuses or evidence items changed.',
    baselineChangedSummary: 'Canonical contract snapshot changed against the pinned baseline:',
    statusMet: 'Met',
    statusNotMet: 'Not met',
    statusInsufficient: 'Insufficient evidence',
    evidencePrefix: 'Evidence: ',
    noEvidenceToCite: 'Not enough evidence to cite',
    rawContentBadge: 'Original raw content preserved verbatim (not translated)',
    bindingExampleTitle: 'Example fingerprint · Not the current draft',
    bindingNote: 'Fingerprint of the exact reviewed snapshot text. It binds these findings to that snapshot; it does not authenticate the evidence.',
    originLocal: 'Local preview',
    originChainSnapshot: 'On-chain snapshot',
    originChainResult: 'On-chain result',
    originExample: 'Fixed synthetic example',
    msgInitial: 'Start by loading or importing an evidence snapshot.',
    msgSampleLoaded: 'Synthetic case loaded. Its measurements are invented examples, not real website tests.',
    msgValidated: 'Evidence schema valid. C1/C2 preview ready.',
    msgShowingExample: 'Showing the synthetic example.',
    msgWalletConnected: 'Wallet connected to Studionet. No transaction was sent.',
    msgSessionCreated: 'Temporary account created. No transaction has been signed or sent.',
    msgSessionEnded: 'Test account ended. Transaction records remain; no key was saved.',
    msgNetworkChecked: 'RPC chain ID verified. Contract deployment compatibility has not been verified.',
    msgExported: 'Work record exported.',
    msgImported: 'Evidence imported and kept only in this page memory.',
    msgBundleExported: 'Verifiable assessment bundle exported.',
    msgBundleImportedLocal: 'Assessment bundle verified (local preview).',
    msgBundleImportedUnverified: 'Assessment bundle hashes and rubric verified offline. Click "Verify bundle on-chain" to cross-check against Studionet.',
    msgBundleVerifiedLive: 'Bundle verified against live Studionet contract: source, canonical snapshot, and findings match.',
    msgBaselinePinned: 'Current snapshot pinned as comparison baseline.',
    msgBaselineCleared: 'Pinned comparison baseline cleared.',
    msgResultsLoaded: 'Results loaded. Export the work record from Transaction History.',
    msgPreparingConfig: 'Checking the account, network, and current Studio configuration…',
    msgCheckingSchema: 'Checking the contract interface; no signature requested…',
    msgReadingBalance: 'Reading the test balance and preparing a transaction review…',
    msgQuoteReady: 'Transaction review ready; valid for 5 minutes. Review and confirm each operation separately.',
    msgParseContractFailed: 'The transaction finalized successfully, but its contract address could not be parsed. Find it in Explorer and read it manually.',
    msgStorageUnavailable: 'Browser storage is unavailable. Copy the transaction ID now.',
    msgBusy: 'An operation is still running. Check its progress or your wallet request.',
    msgWalletChanged: 'The wallet network or account changed. Reconnect to continue.',
    expireEvidenceReplaced: 'The evidence was replaced. Validate the new draft or read a contract again.',
    expireTargetChanged: 'The read target changed. Read this contract to bind a new result.',
    expireEvidenceEdited: 'Evidence changed. Previous findings were cleared; validate this draft or read a contract again.',
    expireContractEdited: 'The contract target changed. Read the selected contract to bind new findings.',
    contextLocalPreviewSuffix: 'C3/C4 have not been assessed. A valid schema does not authenticate evidence.',
    contextExample: 'Historical local SDK test output; not an assessment of the current input or an on-chain result.',
    contextChainUnassessedSuffix: 'Contract loaded. C1/C2 are local checks; assess has not run.',
    contextChainAssessedSuffix: 'Assessment covers supplied evidence only.',
    exportNote: 'RPC observations and local records; not a Portal acceptance or reward receipt. Current is null after an edit; history contains fingerprints only. No input evidence text is included.',
    footerLeft: 'Agent SLA Workbench · v0.1.9',
    footerRight: 'AI-assisted development · No escrow · No legal authority',
  },
  'zh-CN': {
    docTitle: 'Agent SLA · 交付证据工作台',
    brandAria: 'Agent SLA 首页',
    brandTitle: 'AGENT SLA',
    brandSub: '交付证据工作台',
    networkBadge: 'Studionet · 61999',
    networkName: 'Studionet 开发网',
    langGroupAria: '界面语言',
    langEnLabel: '英文',
    langZhLabel: '简体中文',
    connectWallet: '连接钱包',
    reconnectWallet: '重新连接钱包',
    notConnected: '未连接',
    working: '处理中…',
    introEyebrow: '先看证据，再下结论',
    introTitleLine1: '交付是否达标，',
    introTitleEm: '让证据说话。',
    introLedeLine1: '按固定 SLA 标准检查交付记录，',
    introLedeLine2: '通过 GenLayer 评估布局与文档证据，并保留判断依据。',
    workflowLabel: '工作流',
    step1Title: '整理证据',
    step1Sub: '时间 · 版本 · 报告 · 双方陈述',
    step2Title: '提交评估',
    step2Sub: '冻结证据包，独立核对判断与引用',
    step3Title: '复核结果',
    step3Sub: '逐项展示满足、未满足与证据不足',
    noticeBadge: '开发预览版',
    noticeText: '合成示例与链上读取分别标记；评估仅针对提供的材料，不认证证据、不结算资金。Studionet 开发网可能重置。',
    workspaceAria: '工作区',
    tabPrepare: '01　准备证据',
    tabChain: '02　链上评估',
    tabHistory: '03　交易记录',
    caseEyebrow: '证据快照',
    caseTitle: '你的交付证据包',
    statusNotValidated: '待检查',
    statusSchemaValid: '结构检查通过',
    caseGuide: '上传或编辑 JSON。部署后该份证据包不可更改。不要上传密码、密钥或不宜公开的个人资料。',
    btnLoadSample: '加载合成案例',
    btnImportJson: '导入 JSON',
    btnDownloadEvidence: '下载证据包',
    snapshotSrLabel: '交付证据 JSON',
    snapshotPlaceholder: '加载合成案例，或粘贴你的证据 JSON…',
    btnValidate: '检查证据 →',
    rubricEyebrow: 'SLA-DEMO-v1',
    rubricTitle: '四项标准，同一份证据',
    c1Title: '按时交付',
    c1Desc: '提交时间不晚于约定时间。',
    c2Title: '测试与版本',
    c2Desc: '报告对应交付版本，所有测试通过。',
    c3Title: '响应式布局',
    c3Desc: '360、768、1440px 下没有横向溢出。',
    c4Title: '交接文档',
    c4Desc: '有与交付版本对应的安装、运行及测试说明。',
    deterministicTag: '确定性检查',
    semanticTag: 'GenLayer 语义评估',
    btnShowExample: '查看合成示例结果 ↗',
    rubricFootnote: '证据不足是一种有效结果，不会自动当作交付失败。',
    chainEyebrow: 'GENLAYER 连接',
    chainTitle: '连接已有合约，或部署新证据包',
    chainNetworkNotice: '目标：Studionet 开发网。此网络可重置，不代表 Bradbury 部署或 Portal 已认可该网络。',
    btnCheckNetwork: '检查网络',
    linkOpenStudio: '打开官方 Studio ↗',
    linkDownloadContract: '下载合约源码 ↓',
    btnReadExample: '读取链上合成案例 ↗',
    rpcNotChecked: '尚未连接 RPC',
    contractLabel: '合约地址',
    contractPlaceholder: '0x…',
    btnReadResults: '读取结果',
    readFootnote: '读取前会校验链上源码是否与本应用附带版本一致，不需要连接钱包。',
    sessionHeading: 'Studionet 临时测试账户',
    sessionDesc: '在本页独立完成部署和 assess。新测试账户与 Portal 钱包、官方 Studio 已有账户不同。密钥只保留在当前页面内存；刷新、关闭或结束账户后不能恢复签名，只能读取已部署合约。请在同一页完成两步，不要向该账户转入资产。',
    sessionConsentLabel: '我同意在本页生成独立测试账户，仅用于 Studionet 的零金额、零 gasPrice 操作。',
    btnCreateSession: '创建本页测试账户',
    btnEndSession: '结束测试账户',
    sessionStatusDefault: '当前使用浏览器钱包路径；不会自动改用测试账户。',
    sessionStatusEnded: '测试账户已结束，已部署合约仍可读取；该临时密钥不可恢复。',
    prepareHeading: '准备本次交易',
    prepareDesc: '当前使用稳定 Studionet（61999）和 SDK 1.1.8。浏览器钱包仍拦截零地址派发。要在本应用内测试完整写入流程，请明确选择下方临时测试账户；不会自动切换账户。',
    chainFeedbackDefault: '点击“准备新部署”后，这里会显示进度或需要处理的问题。',
    btnPrepareDeploy: '准备新部署',
    btnPrepareAssess: '准备 assess 评估',
    prepareFootnote: '新部署固定当前证据包；assess 仅允许原部署者调用一次。当前钱包兼容问题不能通过充值解决。',
    reviewEyebrow: '交易复核',
    reviewTitle: '签名前复核',
    quoteEmpty: '先选择账户并准备交易。临时测试账户由你在本页确认；外部钱包由你在钱包内确认。',
    consentLabel: '我已复核网络、账户、证据和费用，同意本次操作。临时测试账户在本页确认后会签名发送；外部钱包仍需钱包确认。',
    btnSubmitDisabled: '等待准备',
    reviewFootnote: '应用不接收私钥或助记词。交易发出后，超时只会保留原 ID 继续查询，不会自动再次提交。',
    historyEyebrow: '交易日志',
    historyTitle: '继续查询，无需重复提交',
    btnExportRecord: '导出工作记录 ↓',
    historyDesc: '本机仅保存交易 ID、地址与状态，不保存你的证据包。记录内容来自 RPC，导出文件本身不是平台回执。',
    txidLabel: '查询已有交易 ID',
    txidPlaceholder: '0x…',
    btnTrackTx: '查询交易',
    journalEmpty: '尚无本机交易记录。',
    btnCheckStatus: '继续查询',
    resultsEyebrow: '评估结果',
    resultsTitle: '逐项复核',
    resultSourceNone: '尚无结果',
    resultSourceOutdated: '结果已过期 · 请重新核对',
    resultSourceLocal: '本地确定性预览',
    resultSourceExample: '合成示例 · 固定模拟响应',
    resultSourceChainUnassessed: '链上证据 · 尚未评估',
    resultSourceChainResult: '链上读取',
    resultSourceBundleLocal: '已导入评估包 · 本地预览',
    resultSourceBundleUnverified: '已导入评估包 · 待链上核验',
    resultSourceBundleVerified: '链上评估结果 · 评估包已通过 Studionet 核验',
    resultContextDefault: '检查证据可预览 C1/C2；C3/C4 需要链上评估。也可以单独查看标明来源的合成示例。',
    btnExportBundle: '导出可验证评估包 ↓',
    btnImportBundle: '导入并核验评估包',
    btnVerifyBundleChain: '链上交叉核验评估包 ↗',
    btnPinBaseline: '锁存为对比基准',
    btnClearBaseline: '清除基准',
    bundleGuide: '导出自包含评估复核包（证据快照 + 双 SHA-256 指纹 + 评估结论），或导入评估包以校验哈希、规则与 Studionet 实时链上状态。',
    bundleTrustLocal: '本地预览评估包哈希绑定通过，未声称关联链上合约。',
    bundleTrustUnverified: '离线评估包哈希与规则校验通过；在与 Studionet (61999) 实时核对前，其链上来源属于未核验声明。',
    bundleTrustVerified: 'Studionet (61999) 实时交叉核验通过：合约源码、规范化快照与链上评估结果均与该评估包完全吻合。',
    baselineHeading: '冻结基准对比与重评影响分析',
    baselineEmpty: '可将已检查的快照、链上读取结果或已核验评估包锁存为对比基准，以比对后续编辑差异与重评影响。',
    baselinePinnedPrefix: '已锁存基准：',
    baselineDraftInvalid: '当前草稿不是有效 JSON 或未通过结构检查。修复草稿后可查看与已锁存基准的字段和标准差异。',
    baselineIdentical: '当前草稿与已锁存基准的合约规范化快照完全一致，各项标准状态与证据条目均无变化。',
    baselineChangedSummary: '当前草稿相对于已锁存基准的合约规范化快照已变更：',
    statusMet: '满足',
    statusNotMet: '未满足',
    statusInsufficient: '证据不足',
    evidencePrefix: '依据：',
    noEvidenceToCite: '无足够的可引用证据',
    rawContentBadge: '忠实保留原始输入/链上文本（未翻译）',
    bindingExampleTitle: '示例指纹 · 非当前草稿',
    bindingNote: '所核对证据快照原文的精确指纹。该指纹将上述结果绑定到对应快照，不代表已认证证据真实性。',
    originLocal: '本地预览',
    originChainSnapshot: '链上证据快照',
    originChainResult: '链上评估结果',
    originExample: '固定合成示例',
    msgInitial: '准备好后，从证据包开始。',
    msgSampleLoaded: '已加载合成案例：内容不是实际网站测量。',
    msgValidated: '证据包结构有效，已预览 C1/C2。',
    msgShowingExample: '正在展示合成示例。',
    msgWalletConnected: '钱包已连接 Studionet 开发网；未发送任何交易。',
    msgSessionCreated: '本页测试账户已创建，尚未签名或发送交易。',
    msgSessionEnded: '已结束测试账户。交易记录继续保留，密钥未保存。',
    msgNetworkChecked: 'RPC 链 ID 检查通过，尚未验证合约部署兼容性。',
    msgExported: '工作记录已导出。',
    msgImported: '已导入证据包，仅保留在当前页面内存中。',
    msgBundleExported: '可验证评估复核包已导出。',
    msgBundleImportedLocal: '评估复核包校验通过（本地预览）。',
    msgBundleImportedUnverified: '评估复核包离线哈希与规则校验通过。点击“链上交叉核验评估包”可与 Studionet 实时比对。',
    msgBundleVerifiedLive: '评估复核包已通过 Studionet 链上实时核验：源码、规范化快照与结论完全一致。',
    msgBaselinePinned: '当前快照已锁存为对比基准。',
    msgBaselineCleared: '已清除对比基准。',
    msgResultsLoaded: '读取完成。可在交易记录中导出工作记录。',
    msgPreparingConfig: '正在核对账户、网络和 Studio 当前配置…',
    msgCheckingSchema: '正在读取合约接口，尚未请求签名…',
    msgReadingBalance: '正在读取测试网余额并生成签名前复核内容…',
    msgQuoteReady: '交易内容已准备，5 分钟内有效。每次操作都需要单独复核并确认。',
    msgParseContractFailed: '交易已终局且执行成功；未能从回执解析合约地址，请从浏览器取得后手动读取。',
    msgStorageUnavailable: '浏览器无法持久保存交易记录，请立即复制当前交易 ID。',
    msgBusy: '上一项操作仍在处理中，请查看进度或钱包请求。',
    msgWalletChanged: '钱包网络或账号发生变化，请重新连接。',
    expireEvidenceReplaced: '证据已替换。请重新检查新草稿或重新读取合约。',
    expireTargetChanged: '读取目标已变更。请读取该合约以绑定新结果。',
    expireEvidenceEdited: '证据已修改。旧评估结果已清除；请重新检查当前草稿或重新读取合约。',
    expireContractEdited: '合约目标已修改。请读取所选合约以绑定新结果。',
    contextLocalPreviewSuffix: 'C3/C4 尚未评估。结构有效不代表证据真实。',
    contextExample: '来自历史 SDK 本地测试，不是当前输入的判断，也不是链上结果。',
    contextChainUnassessedSuffix: '合约已读取；C1/C2 为本地核对，不代表已运行 assess。',
    contextChainAssessedSuffix: '仅评估提供的材料。',
    exportNote: '仅包含 RPC 观测与本机记录，不是 Portal 采纳或奖励回执。编辑后 current 为 null；history 仅保留指纹，不含证据正文。',
    footerLeft: 'Agent SLA Workbench · v0.1.9',
    footerRight: 'AI 辅助开发 · 无资金托管 · 无法律裁判效力',
  },
};

// 应用自生成的确定性预览与固定合成示例原因映射（链上真实返回的原因若不在此表或属于链上原文则保持原样）
const APP_REASON_ZH: Record<string, string> = {
  'Compares supplied timestamps only; delivery time is not authenticated.': '仅比较提供的时间戳，未认证交付时间。',
  'Checks the supplied report and revision only; website tests are not rerun.': '仅核对提供的报告与版本，未重新运行网站测试。',
  'Comparison of supplied Unix seconds only; provenance not verified.': '仅比较提供的 Unix 秒级时间戳，未核实来源真实性。',
  'Supplied report counts and revision match only; tests not rerun on chain.': '仅核对提供的测试报告计数与版本匹配，未在链上重跑测试。',
  'The synthetic 360px measurement shows 52px overflow for the named revision.': '合成案例中 360px 视口测量显示指定版本存在 52px 横向溢出。',
  'Only an excerpt is available. It lacks a test command, but this does not establish that the full README lacks one.': '仅提供了 README 节选且缺少测试命令，但这不足以证明完整 README 缺少测试说明。',
};

export function localizeAppReason(reason: string, origin: string | undefined, locale: Locale): {text: string; isRawPreserved: boolean} {
  if (locale === 'zh-CN' && (origin === 'local_preview' || origin === 'synthetic_example') && reason in APP_REASON_ZH) {
    return {text: APP_REASON_ZH[reason], isRawPreserved: false};
  }
  if (origin === 'chain_result') {
    return {text: reason, isRawPreserved: true};
  }
  return {text: reason, isRawPreserved: false};
}

// 统一映射已知错误消息（保持底层模块抛出的英文异常不变以兼容全部既有测试，在 UI 边界精准转换为当前语言）
const ERROR_ZH: Record<string, string> = {
  'The evidence snapshot must not exceed 16,000 bytes.': '证据包不能超过 16,000 字节。',
  'The evidence snapshot has missing or unknown fields.': '证据包字段不完整或包含未知字段。',
  'Invalid schema_version or case_id.': 'schema_version 或 case_id 无效。',
  'Timestamps must be valid Unix seconds.': '时间戳必须是有效的 Unix 秒数。',
  'delivery_commit must contain 40 lowercase hexadecimal characters.': 'delivery_commit 必须是 40 位小写十六进制。',
  'Invalid test report fields or pass counts.': '测试报告字段或通过数量无效。',
  'At most 8 evidence items are allowed.': '最多允许 8 项证据。',
  'Evidence IDs must be unique and content must not be empty.': '证据 ID 必须唯一，内容不能为空。',
  'Evidence may reference C3/C4 only, without duplicates.': '证据只能关联 C3/C4，且不得重复。',
  'Both party statements are required.': '双方陈述不能为空。',
  'The contract did not return the expected JSON text.': '合约没有返回预期的 JSON 文本。',
  'The result does not match the evidence snapshot or rubric.': '返回结果与证据包或协议不匹配。',
  'The result has missing or duplicate criteria.': '返回结果缺少标准或包含重复标准。',
  'Invalid result structure.': '返回结果结构无效。',
  'The result references unknown or unrelated evidence.': '返回结果引用了未知或不相关证据。',
  'The deterministic findings do not match the evidence snapshot.': '确定性检查与证据包不一致。',
  'Enter a valid, nonzero contract address.': '请输入有效的非零合约地址。',
  'A transaction ID must be 0x followed by 64 hexadecimal characters.': '交易 ID 应为 0x 开头的 64 位十六进制。',
  'RPC network identity mismatch. Operation stopped.': 'RPC 网络身份不匹配，已停止操作。',
  'Invalid Studio consensus configuration. Signing stopped.': 'Studio 共识配置无效，已停止签名。',
  'The current Studio transaction ABI does not match the pinned SDK. Signing stopped.': 'Studio 当前交易 ABI 与固定 SDK 不匹配，已停止签名。',
  'Studio uses a zero-address dispatcher. External-wallet signing is blocked. Keep your current account and network and check the supported deployment route. Do not add funds or disable wallet security warnings.': '当前 Studio 使用零地址派发交易，本应用已停止向浏览器钱包请求签名。请保留当前账户与网络，先核对官方支持的部署方式；无需充值或关闭钱包安全提醒。',
  'Invalid Studio transaction details.': 'Studio 交易详情格式无效。',
  'Test accounts require the fixed official Studionet RPC.': '测试账户仅允许固定的官方 Studionet RPC。',
  'Test account network identity mismatch. Operation stopped.': '测试账户网络身份不匹配，已停止。',
  'The Studio dispatcher changed. Prepare again.': 'Studio 派发目标已变化，请重新准备。',
  'Temporary accounts require zero gasPrice on Studionet. Operation stopped.': '临时测试账户仅支持零 gasPrice 的 Studionet，本次已停止。',
  'The temporary account ended or changed. Prepare again.': '临时账户已结束或改变，请重新准备。',
  'Test transaction receipt sender, type, or value mismatch.': '测试交易回执的发送者、类型或金额不符。',
  'An existing test transaction is unresolved. Keep querying its original ID.': '既有测试交易尚未确认，请继续查询原 ID。',
  'Assessment requires a confirmed deployment from this page session. Other contracts remain read-only.': '只能评估本页临时账户已确认部署的合约；旧合约仍可只读查询。',
  'Deployed source verification failed.': '链上源码校验失败。',
  'The on-chain snapshot does not match the review.': '链上证据包与复核不一致。',
  'This contract already has a result. assess cannot run again.': '此合约已有结果，不能重复 assess。',
  'Confirm temporary-account use in this page first.': '请先确认仅在本页使用临时测试账户。',
  'A test-account operation is still running.': '上一项测试账户操作仍在处理中。',
  'Broadcast state unknown. A new account cannot be created to retry in this page.': '广播状态未知，不能在本页创建新账户重试。',
  'Account creation canceled.': '账户创建已取消。',
  'An operation is running or its broadcast state is unknown. Check the original transaction before proceeding.': '已有操作处理中或广播状态未知，请先核对原交易，勿重复提交。',
  'Create a temporary account in this page first.': '请先创建本页临时测试账户。',
  'This source is not the reviewed Agent SLA contract. Operation stopped.': '源码不属于已审核的 Agent SLA 合约，已停止。',
  'Invalid test operation.': '测试操作无效。',
  'Explicitly confirm this test operation.': '需要明确确认这一次测试操作。',
  'The review was already used or the operation state is unknown. Do not resubmit.': '复核已使用或操作状态未知，请勿重复提交。',
  'The account or review expired. Prepare again.': '账户或复核已失效，请重新准备。',
  'Only one signature is allowed per review. ABI fallback cannot sign again.': '同一次复核只允许签名一次，禁止 ABI 回退重发。',
  'Test transaction network, dispatcher, value, or fee mismatch. Operation stopped.': '测试交易的网络、派发地址、金额或费用不匹配，已停止。',
  'The review expired before signing.': '签名前复核已过期。',
  'Unknown assessment origin.': '未知的评估来源。',
  'Invalid assessment metadata.': '评估元数据无效。',
  'Missing verified Studionet provenance.': '缺少已验证的 Studionet 来源信息。',
  'Local or example results cannot claim on-chain provenance.': '本地预览或示例结果不能声称具有链上来源。',
  'Could not load the contract source.': '无法加载合约源码。',
  'The temporary test account is no longer available.': '临时测试账户已失效。',
  'Connect an external wallet first.': '请先连接浏览器钱包。',
  'The wallet account or network changed. Reconnect and prepare again.': '钱包账号或网络已变化，请重新连接并准备。',
  'The deployed source does not match this workbench. Assessment stopped; check the original deployed contract.': '合约源码与本工作台版本不一致，停止评估。请核对部署的原始合约。',
  'No valid evidence snapshot was returned.': '未读取到有效证据包。',
  'Read discarded because the evidence or contract changed while it was loading. Your current draft was kept. Read again when ready.': '读取结果已丢弃，因为加载期间证据或合约发生了变化。当前草稿已保留，准备好后请重新读取。',
  'The previous transaction sender could not be verified. Check its original ID in Transaction History.': '旧交易的发送账号无法核对，请到交易记录中检查原 ID。',
  'An existing deployment succeeded. Read that contract and continue its assessment instead of deploying again.': '已有一笔部署执行成功，请先读取该合约并继续评估，不要重复部署。',
  'This account has an unresolved transaction. Open Transaction History and query its original ID. No new transaction was sent.': '此账号仍有状态未确认的交易。请点击“03 交易记录”继续查询原 ID；尚未发送新交易。',
  'The evidence snapshot is empty. Open Prepare Evidence, load the synthetic case, and validate it before preparing a deployment.': '证据包为空。请到“01 准备证据”加载合成案例并检查，再回来准备部署。',
  'The network could not recognize the contract interface. Check SDK and GenVM compatibility.': '网络未能识别合约接口；请检查 SDK 与 GenVM 兼容性。',
  'This contract already has an assessment. assess cannot run again.': '该合约已有评估结果，不能再次调用 assess。',
  'The on-chain evidence snapshot is invalid.': '链上证据包无效。',
  'Review the transaction and check the confirmation box first.': '请先复核交易并勾选确认框。',
  'This review expired. Prepare the transaction again.': '准备已过期，请重新准备。',
  'The evidence, account, or contract changed. Prepare again.': '证据、账户或合约已变化，请重新准备。',
  'The temporary-account review is missing.': '缺少临时账户复核。',
  'The Studio consensus target changed. Prepare the transaction again.': 'Studio 共识目标已变化，请重新准备交易。',
  'This ID is not the expected contract operation. FINALIZED does not make it a successful deploy or assessment. Do not use this record to call assess.': '此 ID 对应的不是预期合约操作；即使 FINALIZED 也不算部署/评估成功。不要对该记录调用 assess。',
  'Could not load the case.': '无法加载案例。',
  'Example loading was discarded because the draft changed. Your draft was kept.': '由于草稿已修改，示例加载已放弃，当前草稿已保留。',
  'The draft changed during validation. Validate it again.': '检查期间草稿发生了变化，请重新检查。',
  'Could not load the synthetic example.': '无法加载合成示例。',
  'Example loading was discarded because the draft changed.': '由于草稿已修改，示例加载已放弃。',
  'A temporary test account is active. End it before connecting an external wallet.': '当前正在使用本页测试账户。结束测试账户后才能连接浏览器钱包。',
  'No wallet extension detected. Open this app in Chrome with your wallet installed.': '当前浏览器未检测到钱包扩展。请在安装钱包的 Chrome 中打开此应用。',
  'No wallet account was authorized.': '没有授权的钱包账号。',
  'The file exceeds 16,000 bytes.': '文件超过 16,000 字节。',
  'Import discarded because the draft changed while the file was loading.': '文件读取期间草稿已修改，本次导入已放弃。',
  'String contains an unpaired UTF-16 surrogate.': '字符串包含未配对的 UTF-16 代理项。',
  'The evidence snapshot contains an invalid unpaired Unicode surrogate.': '证据快照包含无效的未配对 Unicode 代理项。',
  'Numeric fields must be exact integers without decimals or exponents.': '数字字段必须是精确整数，不能包含小数或科学计数法。',
  'The fixed synthetic example is a canned demonstration and cannot be exported as a verifiable assessment bundle.': '固定合成示例仅作演示，不能导出为可验证评估复核包。',
  'Validate the current draft or read an on-chain contract before exporting an assessment bundle.': '导出评估复核包前，请先检查当前草稿或读取链上合约。',
  'Verify the imported bundle on-chain or re-validate the draft before exporting a new bundle.': '请先对已导入的评估包执行链上核验，或重新检查当前草稿后再导出新评估包。',
  'The active draft case_id no longer matches the bound review.': '当前草稿的 case_id 与已绑定复核不一致。',
  'The active draft fingerprint no longer matches the bound review. Validate or read again.': '当前草稿指纹与已绑定复核不一致，请重新检查或读取。',
  'Local preview bundles cannot claim on-chain contract provenance.': '本地预览评估包不能声称具有链上合约来源。',
  'Local preview bundles cannot include on-chain C1–C4 assessment results.': '本地预览评估包不能包含链上 C1–C4 评估结果。',
  'On-chain bundles require verified Studionet contract provenance.': '链上评估包需要已验证的 Studionet 合约来源信息。',
  'On-chain bundles require Studionet chainId 61999.': '链上评估包要求 Studionet 链 ID 为 61999。',
  'Contract source SHA-256 does not match the reviewed workbench contract.': '合约源码 SHA-256 与本工作台已审核合约不一致。',
  'Missing on-chain assessment result payload.': '缺少链上评估结果数据。',
  'Unassessed on-chain snapshot bundles cannot include C1–C4 assessment results.': '尚未评估的链上快照包不能包含 C1–C4 评估结果。',
  'The serialized assessment bundle exceeds the 64,000-byte limit.': '序列化后的评估复核包超过 64,000 字节上限。',
  'The assessment bundle file must not exceed 64,000 bytes.': '评估复核包文件不能超过 64,000 字节。',
  'The assessment bundle contains an invalid unpaired Unicode surrogate.': '评估复核包包含无效的未配对 Unicode 代理项。',
  'The assessment bundle is not valid JSON.': '评估复核包不是有效的 JSON。',
  'The assessment bundle has missing or unknown top-level fields.': '评估复核包缺少必填字段或包含未知顶层字段。',
  'Unsupported assessment bundle schema version.': '不支持的评估复核包 schema 版本。',
  'Invalid bundle timestamp.': '评估复核包时间戳无效。',
  'Invalid assessment bundle origin.': '评估复核包来源类型无效。',
  'Invalid snapshot fields in bundle.': '评估复核包中的快照字段无效。',
  'Invalid SHA-256 fields in bundle.': '评估复核包中的 SHA-256 字段无效。',
  'Bundle SHA-256 digests must be lowercase hexadecimal.': '评估复核包的 SHA-256 摘要必须为小写十六进制。',
  'Snapshot SHA-256 mismatch: the evidence snapshot was modified or corrupted.': '快照 SHA-256 不匹配：证据快照已被篡改或损坏。',
  'Bundle caseId does not match the embedded evidence snapshot.': '评估复核包的 caseId 与内嵌证据快照不一致。',
  'Bundle canonicalSnapshot does not match the deterministic contract canonicalization.': '评估复核包的规范化快照与确定性合约规范化结果不一致。',
  'Canonical SHA-256 mismatch: the contract snapshot digest does not match.': '规范化快照 SHA-256 不匹配：合约快照摘要不一致。',
  'Bundle objective findings must contain C1 and C2.': '评估复核包的确定性检查结果必须包含 C1 和 C2。',
  'Bundle C1/C2 objective findings do not match the evidence snapshot.': '评估复核包的 C1/C2 确定性检查结果与证据快照不一致。',
  'Local preview bundles cannot carry on-chain provenance.': '本地预览评估包不能携带链上来源信息。',
  'Local preview bundles cannot carry on-chain C1–C4 assessment results.': '本地预览评估包不能携带链上 C1–C4 评估结果。',
  'Invalid on-chain provenance object in bundle.': '评估复核包中的链上来源对象无效。',
  'Bundle provenance chainId must be 61999 (Studionet).': '评估复核包链 ID 必须为 61999（Studionet）。',
  'Bundle contract source SHA-256 does not match this workbench.': '评估复核包的合约源码 SHA-256 与本工作台不一致。',
  'Unassessed chain_snapshot bundles cannot contain an assessment object.': '尚未评估的链上快照包不能包含评估结果对象。',
  'Invalid assessment object in chain_result bundle.': '链上评估结果包中的 assessment 对象无效。',
  'Invalid assessment result fields.': '评估结果字段无效。',
  'resultSha256 must be lowercase hexadecimal.': 'resultSha256 必须为小写十六进制。',
  'Bundle resultRaw must be in canonical contract format.': '评估复核包的 resultRaw 必须为规范化合约格式。',
  'Assessment result SHA-256 mismatch: the findings payload was modified.': '评估结果 SHA-256 不匹配：裁决结果已被篡改。',
  'Bundle findings array does not match the validated resultRaw payload.': '评估复核包的 findings 数组与已校验的 resultRaw 不一致。',
  'Local preview bundles do not have an on-chain contract to verify against.': '本地预览评估包没有可核验的链上合约。',
  'The contract address field does not match the contract recorded in the bundle.': '当前输入的合约地址与评估包记录的合约地址不一致。',
  'Validate evidence, read a contract, or verify an imported bundle before pinning a baseline.': '锁存对比基准前，请先检查当前草稿、读取链上合约或导入评估包。',
  'Bundle verification discarded because the draft or contract changed while loading.': '核验期间草稿或合约发生变化，本次评估包链上核验结果已丢弃。',
  'Bundle import discarded because the draft changed while the file was loading.': '文件读取期间草稿已修改，本次评估包导入已放弃。',
};

export function translateError(rawMessage: string, locale: Locale): string {
  if (locale === 'en') return rawMessage;
  if (rawMessage in ERROR_ZH) return ERROR_ZH[rawMessage];
  const canonicalLimitMatch = rawMessage.match(/^The canonicalized contract snapshot is (\d+) bytes and exceeds the 16,000-byte on-chain limit after ASCII escaping\.$/);
  if (canonicalLimitMatch) {
    return `规范化后的合约快照为 ${canonicalLimitMatch[1]} 字节，经 ASCII 转义后超过链上 16,000 字节上限。`;
  }
  if (/JSON|Unexpected token|Unexpected end of JSON|Expected property name/i.test(rawMessage)) {
    return `JSON 语法无效：${rawMessage}`;
  }
  if (rawMessage.startsWith('Studio RPC HTTP ')) {
    return rawMessage.replace('Studio RPC HTTP ', 'Studio RPC HTTP 状态码 ');
  }
  if (rawMessage.startsWith('Studio RPC: ')) {
    return rawMessage.replace('Studio RPC: ', 'Studio RPC 错误：');
  }
  return rawMessage;
}

// 格式化签名前复核摘要对象（保持底层 quote 数据结构不变，仅按当前语言生成展示 JSON）
export function formatQuoteSummary(
  input: {
    kind: 'deploy' | 'assess';
    route: 'wallet' | 'session';
    chainId: number;
    account: string;
    contract: string;
    consensusTarget: string;
    caseId: string;
    snapshotSha256: string;
    sourceSha256: string;
    balance: bigint;
  },
  locale: Locale,
) {
  const c = COPY[locale];
  return {
    operation: input.kind,
    route:
      input.route === 'session'
        ? locale === 'zh-CN'
          ? '本页临时测试账户，确认后由官方 SDK 签名'
          : 'Temporary page account; the official SDK signs after confirmation'
        : locale === 'zh-CN'
          ? '浏览器钱包确认'
          : 'External-wallet confirmation',
    network: c.networkName,
    chainId: input.chainId,
    account: input.account,
    contract: input.contract || (locale === 'zh-CN' ? '新部署' : 'New deployment'),
    consensusTarget: input.consensusTarget,
    configurationSource:
      locale === 'zh-CN'
        ? '官方 Studio sim_getConsensusContract；仅适用开发网 61999'
        : 'Official Studio sim_getConsensusContract; development chain 61999 only',
    caseId: input.caseId,
    snapshotSha256: input.snapshotSha256,
    sourceSha256: input.sourceSha256,
    balanceWei: String(input.balance),
    fee:
      input.route === 'session'
        ? locale === 'zh-CN'
          ? '仅允许 value=0、gasPrice=0；签名前再次核对'
          : 'Requires value=0 and gasPrice=0; checked again before signing'
        : locale === 'zh-CN'
          ? '具体费用由钱包在签名前展示'
          : 'Review the actual fees in your wallet before signing',
    note:
      locale === 'zh-CN'
        ? '不会自动领取或充值；测试账户签名不会弹出 MetaMask'
        : 'No automatic claims or funding. Temporary-account signing does not open MetaMask.',
  };
}

// 格式化提交按钮文案
export function formatSubmitButton(
  quote: {kind: 'deploy' | 'assess'; route: 'wallet' | 'session'} | null,
  locale: Locale,
): string {
  if (!quote) return COPY[locale].btnSubmitDisabled;
  if (quote.route === 'session') {
    if (locale === 'zh-CN') {
      return `确认并发送测试${quote.kind === 'deploy' ? '部署' : '评估'}`;
    }
    return `Confirm and send test ${quote.kind === 'deploy' ? 'deployment' : 'assessment'}`;
  }
  if (locale === 'zh-CN') {
    return quote.kind === 'deploy' ? '确认并请求部署签名' : '确认并请求评估签名';
  }
  return quote.kind === 'deploy' ? 'Confirm deployment in wallet' : 'Confirm assessment in wallet';
}
