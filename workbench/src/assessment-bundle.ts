// 可移植评估复核包（agent-sla-assessment-bundle/v1）、合约级规范化指纹、链上实盘交叉核验与基准差异溯源模块
import {address, hash, objectiveFindings, parseCase, parseResult, type CaseInput, type Finding, type Status} from './domain.ts';
import {REVIEWED_SOURCE_SHA256} from './studio-session.ts';

export const BUNDLE_SCHEMA = 'agent-sla-assessment-bundle/v1' as const;
export const MAX_BUNDLE_BYTES = 64000;
export const MAX_SNAPSHOT_BYTES = 16000;

export type BundleOrigin = 'local_preview' | 'chain_snapshot' | 'chain_result';
export type BundleTrustStatus = 'local_only' | 'unverified_on_chain' | 'verified_on_chain';

export type BundleProvenance = {
  chainId: 61999;
  contract: `0x${string}`;
  sourceSha256: string;
};

export type BundleAssessment = {
  resultRaw: string;
  resultSha256: string;
  findings: Finding[];
};

export type AssessmentBundle = {
  schema: typeof BUNDLE_SCHEMA;
  exportedAt: string;
  origin: BundleOrigin;
  caseId: string;
  observedAt: string;
  snapshot: string;
  snapshotSha256: string;
  canonicalSnapshot: string;
  canonicalSha256: string;
  provenance: BundleProvenance | null;
  objective: Finding[];
  assessment: BundleAssessment | null;
};

export type VerifiedBundleRecord = Readonly<{
  bundle: AssessmentBundle;
  parsedCase: CaseInput;
  trust: BundleTrustStatus;
  findings: Finding[];
}>;

export type LiveChainReader = {
  getChainId(): Promise<number>;
  getContractCode(contract: `0x${string}`): Promise<string>;
  getSnapshot(contract: `0x${string}`): Promise<unknown>;
  getResult(contract: `0x${string}`): Promise<unknown>;
};

export type LiveVerificationOutcome =
  | {
      status: 'live_match';
      checkedAt: string;
      contract: `0x${string}`;
      chainId: 61999;
      sourceSha256: string;
      canonicalSha256: string;
      resultSha256: string | null;
      upgradedResultRaw?: string;
      upgradedFindings?: Finding[];
      note: 'exact_match' | 'snapshot_matched_result_now_available';
    }
  | {
      status: 'live_mismatch';
      checkedAt: string;
      contract: `0x${string}`;
      reasons: string[];
    }
  | {
      status: 'live_unavailable';
      checkedAt: string;
      contract: `0x${string}`;
      error: string;
    };

export type ScalarChange<T> = {changed: boolean; before: T; after: T};

export type ReportDiff = {
  status: 'unchanged' | 'added' | 'removed' | 'modified';
  commitChanged: boolean;
  passedChanged: boolean;
  totalChanged: boolean;
  before: CaseInput['report'];
  after: CaseInput['report'];
};

export type EvidenceItemDiff = {
  id: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  criteriaBefore: string[];
  criteriaAfter: string[];
  textChanged: boolean;
  lengthBefore: number;
  lengthAfter: number;
};

export type SnapshotDiff = {
  identicalCanonical: boolean;
  rawTextIdentical: boolean;
  baselineCanonicalSha256: string;
  candidateCanonicalSha256: string;
  caseId: ScalarChange<string>;
  dueAt: ScalarChange<number>;
  submittedAt: ScalarChange<number | null>;
  deliveryCommit: ScalarChange<string>;
  report: ReportDiff;
  disputeClientChanged: boolean;
  disputeAgentChanged: boolean;
  evidenceOrderChanged: boolean;
  evidenceDiffs: EvidenceItemDiff[];
  changedEvidenceIds: string[];
  c1Status: ScalarChange<Status>;
  c2Status: ScalarChange<Status>;
  c3ReassessmentRequired: boolean;
  c4ReassessmentRequired: boolean;
};

export type CriterionTrace = {
  criterionId: 'C1' | 'C2' | 'C3' | 'C4';
  kind: 'deterministic' | 'semantic';
  status: Status;
  citedIds: string[];
  summaryEn: string;
  summaryZh: string;
  citedItems: Array<{id: string; criteria: string[]; text: string}>;
  uncitedCandidateIds: string[];
};

function requireCond(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const hasExactKeys = (v: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(v).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((k, i) => k === wanted[i]);
};

// 检测字符串是否包含孤立的 UTF-16 代理项（Python encode('utf-8') 会抛错拒绝，JS 需显式拦截）
export function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

// 检查 Python str.strip() 视为空白的控制字符与空白码点（注意：\ufeff 在 JS \s 中算空白，但在 Python str.isspace() 中不算空白）
const PYTHON_WHITESPACE_RE = /^[\t\n\x0b\x0c\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/;
export function isPythonBlankString(value: string): boolean {
  return value.length === 0 || PYTHON_WHITESPACE_RE.test(value);
}

// 检查原始 JSON 文本中是否存在浮点或科学计数法数字 token（如 1.0 或 1e3），Python type(v) is int 会拒绝
export function hasFloatOrExponentNumberToken(rawJson: string): boolean {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < rawJson.length; i++) {
    const ch = rawJson[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i;
      while (j < rawJson.length && /[0-9a-zA-Z.+_-]/.test(rawJson[j])) j++;
      const token = rawJson.slice(i, j);
      if (/[.eE]/.test(token)) return true;
      i = j - 1;
    }
  }
  return false;
}

// 按 Python json.dumps(..., ensure_ascii=True) 规则转义单个字符串（基于 UTF-16 code unit，补充平面自动输出小写代理对）
function escapePythonAsciiString(str: string): string {
  requireCond(!hasLoneSurrogate(str), 'String contains an unpaired UTF-16 surrogate.');
  let out = '"';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x22) out += '\\"';
    else if (code === 0x5c) out += '\\\\';
    else if (code === 0x08) out += '\\b';
    else if (code === 0x0c) out += '\\f';
    else if (code === 0x0a) out += '\\n';
    else if (code === 0x0d) out += '\\r';
    else if (code === 0x09) out += '\\t';
    else if (code >= 0x20 && code <= 0x7e) out += str[i];
    else out += '\\u' + code.toString(16).padStart(4, '0');
  }
  out += '"';
  return out;
}

// 与 Python json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) 逐字节完全一致的序列化函数
export function canonicalizeJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    requireCond(Number.isSafeInteger(value), 'Canonical JSON requires safe integers.');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') {
    return escapePythonAsciiString(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(item => canonicalizeJson(item)).join(',') + ']';
  }
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort((a, b) => {
      const aPoints = [...a];
      const bPoints = [...b];
      const len = Math.min(aPoints.length, bPoints.length);
      for (let i = 0; i < len; i++) {
        const diff = aPoints[i].codePointAt(0)! - bPoints[i].codePointAt(0)!;
        if (diff !== 0) return diff;
      }
      return aPoints.length - bPoints.length;
    });
    return (
      '{' +
      sortedKeys
        .map(k => escapePythonAsciiString(k) + ':' + canonicalizeJson(value[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error('Unsupported value type for canonical JSON.');
}

// 校验案例快照是否同时满足前端 parseCase 与 Python 合约 parse_case + canonical 的全部边界
export function validateContractCompatibleCase(rawSnapshot: string): {
  parsed: CaseInput;
  canonicalSnapshot: string;
} {
  requireCond(typeof rawSnapshot === 'string', 'The evidence snapshot must be a string.');
  requireCond(!hasLoneSurrogate(rawSnapshot), 'The evidence snapshot contains an invalid unpaired Unicode surrogate.');
  const parsed = parseCase(rawSnapshot);
  requireCond(!hasFloatOrExponentNumberToken(rawSnapshot), 'Numeric fields must be exact integers without decimals or exponents.');
  requireCond(!isPythonBlankString(parsed.case_id), 'Invalid schema_version or case_id.');
  requireCond(
    !isPythonBlankString(parsed.dispute.client) && !isPythonBlankString(parsed.dispute.agent),
    'Both party statements are required.',
  );
  for (const item of parsed.evidence) {
    requireCond(!isPythonBlankString(item.id) && !isPythonBlankString(item.text), 'Evidence IDs must be unique and content must not be empty.');
  }
  const canonicalSnapshot = canonicalizeJson(parsed);
  const canonicalBytes = new TextEncoder().encode(canonicalSnapshot).length;
  requireCond(
    canonicalBytes <= MAX_SNAPSHOT_BYTES,
    `The canonicalized contract snapshot is ${canonicalBytes} bytes and exceeds the 16,000-byte on-chain limit after ASCII escaping.`,
  );
  return {parsed, canonicalSnapshot};
}

export function canonicalizeCase(caseInput: CaseInput): string {
  return canonicalizeJson(caseInput);
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digestBuffer), b => b.toString(16).padStart(2, '0')).join('');
}

// 严格 ISO-8601 UTC 时间戳校验（例如 2026-11-09T05:00:00.000Z 或 +00:00）
export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

// 校验链上评估结果 JSON 原文的严格结构、C1-C4 顺序与引用排序
export function validateCanonicalAssessmentResult(rawResult: string, parsedCase: CaseInput): {
  findings: Finding[];
  canonicalResult: string;
} {
  requireCond(typeof rawResult === 'string', 'Invalid on-chain assessment result text.');
  const resultBytes = new TextEncoder().encode(rawResult).length;
  requireCond(resultBytes > 0 && resultBytes <= MAX_SNAPSHOT_BYTES, 'Invalid on-chain assessment result text.');
  requireCond(!hasLoneSurrogate(rawResult), 'The assessment result contains an invalid unpaired Unicode surrogate.');
  const rawObj: unknown = JSON.parse(rawResult);
  requireCond(
    isPlainObject(rawObj) && hasExactKeys(rawObj, ['case_id', 'findings', 'rubric', 'scope']),
    'The assessment result has missing or unexpected top-level fields.',
  );
  const checked = parseResult(rawResult, parsedCase);
  const orderIds = checked.findings.map(f => f.criterion_id);
  requireCond(
    orderIds.length === 4 && orderIds[0] === 'C1' && orderIds[1] === 'C2' && orderIds[2] === 'C3' && orderIds[3] === 'C4',
    'The assessment findings must appear in exact C1, C2, C3, C4 order.',
  );
  for (const f of checked.findings) {
    requireCond(!isPythonBlankString(f.reason), 'Invalid result structure.');
    const sortedRefs = [...f.evidence_ids].sort();
    requireCond(
      f.evidence_ids.every((r, idx) => r === sortedRefs[idx]),
      'The assessment evidence references must be in canonical sorted order.',
    );
  }
  const canonicalResult = canonicalizeJson(rawObj);
  return {
    findings: checked.findings.map(f => ({
      criterion_id: f.criterion_id,
      status: f.status,
      evidence_ids: [...f.evidence_ids],
      reason: f.reason,
    })),
    canonicalResult,
  };
}

// 构建并导出自包含的可验证评估复核包（拒绝未绑定、已过期或合成示例状态）
export async function buildAssessmentBundle(input: {
  origin: BundleOrigin | 'synthetic_example';
  snapshot: string;
  boundSnapshotSha256: string;
  boundCaseId: string;
  observedAt: string;
  exportedAt?: string;
  provenance?: {chainId?: number; contract?: string; sourceSha256?: string} | null;
  resultRaw?: string | null;
}): Promise<AssessmentBundle> {
  requireCond(
    input.origin !== 'synthetic_example',
    'The fixed synthetic example is a canned demonstration and cannot be exported as a verifiable assessment bundle.',
  );
  requireCond(
    input.origin === 'local_preview' || input.origin === 'chain_snapshot' || input.origin === 'chain_result',
    'Validate the current draft or read an on-chain contract before exporting an assessment bundle.',
  );
  requireCond(isValidIsoTimestamp(input.observedAt), 'Invalid observation timestamp.');
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  requireCond(isValidIsoTimestamp(exportedAt), 'Invalid export timestamp.');

  const {parsed, canonicalSnapshot} = validateContractCompatibleCase(input.snapshot);
  requireCond(parsed.case_id === input.boundCaseId, 'The active draft case_id no longer matches the bound review.');

  const snapshotSha256 = await sha256Hex(input.snapshot);
  requireCond(
    snapshotSha256 === input.boundSnapshotSha256.toLowerCase(),
    'The active draft fingerprint no longer matches the bound review. Validate or read again.',
  );
  const canonicalSha256 = await sha256Hex(canonicalSnapshot);
  const objective = objectiveFindings(parsed);

  let provenance: BundleProvenance | null = null;
  let assessment: BundleAssessment | null = null;

  if (input.origin === 'local_preview') {
    requireCond(!input.provenance, 'Local preview bundles cannot claim on-chain contract provenance.');
    requireCond(!input.resultRaw, 'Local preview bundles cannot include on-chain C1–C4 assessment results.');
  } else {
    requireCond(!!input.provenance, 'On-chain bundles require verified Studionet contract provenance.');
    requireCond(input.provenance.chainId === 61999, 'On-chain bundles require Studionet chainId 61999.');
    const validContract = address(String(input.provenance.contract ?? ''));
    const sourceHash = String(input.provenance.sourceSha256 ?? '').toLowerCase();
    hash('0x' + sourceHash);
    requireCond(sourceHash === REVIEWED_SOURCE_SHA256, 'Contract source SHA-256 does not match the reviewed workbench contract.');
    provenance = {
      chainId: 61999,
      contract: validContract,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    };

    if (input.origin === 'chain_result') {
      requireCond(typeof input.resultRaw === 'string' && input.resultRaw.length > 0, 'Missing on-chain assessment result payload.');
      const {findings, canonicalResult} = validateCanonicalAssessmentResult(input.resultRaw, parsed);
      const resultSha256 = await sha256Hex(canonicalResult);
      assessment = {
        resultRaw: canonicalResult,
        resultSha256,
        findings,
      };
    } else {
      requireCond(!input.resultRaw, 'Unassessed on-chain snapshot bundles cannot include C1–C4 assessment results.');
    }
  }

  const bundle: AssessmentBundle = {
    schema: BUNDLE_SCHEMA,
    exportedAt,
    origin: input.origin,
    caseId: parsed.case_id,
    observedAt: input.observedAt,
    snapshot: input.snapshot,
    snapshotSha256,
    canonicalSnapshot,
    canonicalSha256,
    provenance,
    objective,
    assessment,
  };

  const serializedPretty = JSON.stringify(bundle, null, 2);
  const serializedBytes = new TextEncoder().encode(serializedPretty).length;
  requireCond(serializedBytes <= MAX_BUNDLE_BYTES, 'The serialized assessment bundle exceeds the 64,000-byte limit.');
  return bundle;
}

// 零信任导入校验：对导入的评估复核包执行完整密码学哈希、合约规范化与规则校验
export async function verifyAssessmentBundle(rawBundleJson: string): Promise<VerifiedBundleRecord> {
  requireCond(typeof rawBundleJson === 'string', 'The assessment bundle must be a JSON string.');
  const byteLength = new TextEncoder().encode(rawBundleJson).length;
  requireCond(byteLength > 0 && byteLength <= MAX_BUNDLE_BYTES, 'The assessment bundle file must not exceed 64,000 bytes.');
  requireCond(!hasLoneSurrogate(rawBundleJson), 'The assessment bundle contains an invalid unpaired Unicode surrogate.');

  let raw: unknown;
  try {
    raw = JSON.parse(rawBundleJson);
  } catch {
    throw new Error('The assessment bundle is not valid JSON.');
  }

  const topKeys = [
    'schema',
    'exportedAt',
    'origin',
    'caseId',
    'observedAt',
    'snapshot',
    'snapshotSha256',
    'canonicalSnapshot',
    'canonicalSha256',
    'provenance',
    'objective',
    'assessment',
  ] as const;
  requireCond(
    isPlainObject(raw) && hasExactKeys(raw, topKeys),
    'The assessment bundle has missing or unknown top-level fields.',
  );
  requireCond(raw.schema === BUNDLE_SCHEMA, 'Unsupported assessment bundle schema version.');
  requireCond(isValidIsoTimestamp(raw.exportedAt) && isValidIsoTimestamp(raw.observedAt), 'Invalid bundle timestamp.');
  requireCond(
    raw.origin === 'local_preview' || raw.origin === 'chain_snapshot' || raw.origin === 'chain_result',
    'Invalid assessment bundle origin.',
  );
  requireCond(typeof raw.snapshot === 'string' && typeof raw.canonicalSnapshot === 'string', 'Invalid snapshot fields in bundle.');
  requireCond(typeof raw.snapshotSha256 === 'string' && typeof raw.canonicalSha256 === 'string', 'Invalid SHA-256 fields in bundle.');
  hash('0x' + raw.snapshotSha256);
  hash('0x' + raw.canonicalSha256);
  requireCond(
    raw.snapshotSha256 === raw.snapshotSha256.toLowerCase() && raw.canonicalSha256 === raw.canonicalSha256.toLowerCase(),
    'Bundle SHA-256 digests must be lowercase hexadecimal.',
  );

  // 1. 校验 snapshot 结构并重算双哈希
  const actualSnapshotSha256 = await sha256Hex(raw.snapshot);
  requireCond(actualSnapshotSha256 === raw.snapshotSha256, 'Snapshot SHA-256 mismatch: the evidence snapshot was modified or corrupted.');

  const {parsed, canonicalSnapshot} = validateContractCompatibleCase(raw.snapshot);
  requireCond(raw.caseId === parsed.case_id, 'Bundle caseId does not match the embedded evidence snapshot.');
  requireCond(raw.canonicalSnapshot === canonicalSnapshot, 'Bundle canonicalSnapshot does not match the deterministic contract canonicalization.');

  const actualCanonicalSha256 = await sha256Hex(canonicalSnapshot);
  requireCond(actualCanonicalSha256 === raw.canonicalSha256, 'Canonical SHA-256 mismatch: the contract snapshot digest does not match.');

  // 2. 校验确定性 C1/C2 结果
  const expectedObjective = objectiveFindings(parsed);
  requireCond(Array.isArray(raw.objective) && raw.objective.length === 2, 'Bundle objective findings must contain C1 and C2.');
  requireCond(
    canonicalizeJson(raw.objective) === canonicalizeJson(expectedObjective),
    'Bundle C1/C2 objective findings do not match the evidence snapshot.',
  );

  // 3. 校验来源、链上 provenance 与 C1-C4 assessment 的一致性
  let provenance: BundleProvenance | null = null;
  let assessment: BundleAssessment | null = null;
  let findings: Finding[] = expectedObjective;
  let trust: BundleTrustStatus = 'local_only';

  if (raw.origin === 'local_preview') {
    requireCond(raw.provenance === null, 'Local preview bundles cannot carry on-chain provenance.');
    requireCond(raw.assessment === null, 'Local preview bundles cannot carry on-chain C1–C4 assessment results.');
    trust = 'local_only';
  } else {
    requireCond(
      isPlainObject(raw.provenance) && hasExactKeys(raw.provenance, ['chainId', 'contract', 'sourceSha256']),
      'Invalid on-chain provenance object in bundle.',
    );
    requireCond(raw.provenance.chainId === 61999, 'Bundle provenance chainId must be 61999 (Studionet).');
    const validContract = address(String(raw.provenance.contract));
    const sourceSha = String(raw.provenance.sourceSha256);
    hash('0x' + sourceSha);
    requireCond(sourceSha === REVIEWED_SOURCE_SHA256, 'Bundle contract source SHA-256 does not match this workbench.');
    provenance = {
      chainId: 61999,
      contract: validContract,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    };
    // 离线导入的链上包在实时 RPC 核验通过前一律标记为 unverified_on_chain
    trust = 'unverified_on_chain';

    if (raw.origin === 'chain_snapshot') {
      requireCond(raw.assessment === null, 'Unassessed chain_snapshot bundles cannot contain an assessment object.');
      findings = expectedObjective;
    } else {
      requireCond(
        isPlainObject(raw.assessment) && hasExactKeys(raw.assessment, ['resultRaw', 'resultSha256', 'findings']),
        'Invalid assessment object in chain_result bundle.',
      );
      requireCond(typeof raw.assessment.resultRaw === 'string' && typeof raw.assessment.resultSha256 === 'string', 'Invalid assessment result fields.');
      hash('0x' + raw.assessment.resultSha256);
      requireCond(raw.assessment.resultSha256 === raw.assessment.resultSha256.toLowerCase(), 'resultSha256 must be lowercase hexadecimal.');
      const {findings: validatedFindings, canonicalResult} = validateCanonicalAssessmentResult(raw.assessment.resultRaw, parsed);
      requireCond(raw.assessment.resultRaw === canonicalResult, 'Bundle resultRaw must be in canonical contract format.');
      const actualResultSha = await sha256Hex(canonicalResult);
      requireCond(actualResultSha === raw.assessment.resultSha256, 'Assessment result SHA-256 mismatch: the findings payload was modified.');
      requireCond(
        canonicalizeJson(raw.assessment.findings) === canonicalizeJson(validatedFindings),
        'Bundle findings array does not match the validated resultRaw payload.',
      );
      assessment = {
        resultRaw: canonicalResult,
        resultSha256: actualResultSha,
        findings: validatedFindings,
      };
      findings = validatedFindings;
    }
  }

  const verifiedBundle: AssessmentBundle = Object.freeze({
    schema: BUNDLE_SCHEMA,
    exportedAt: raw.exportedAt,
    origin: raw.origin,
    caseId: parsed.case_id,
    observedAt: raw.observedAt,
    snapshot: raw.snapshot,
    snapshotSha256: actualSnapshotSha256,
    canonicalSnapshot,
    canonicalSha256: actualCanonicalSha256,
    provenance: provenance ? Object.freeze(provenance) : null,
    objective: expectedObjective,
    assessment: assessment ? Object.freeze(assessment) : null,
  });

  return Object.freeze({
    bundle: verifiedBundle,
    parsedCase: parsed,
    trust,
    findings,
  });
}

// 实时与 Studionet (61999) 链上合约状态进行只读交叉核验
export async function compareBundleWithLiveChain(
  record: VerifiedBundleRecord,
  reader: LiveChainReader,
  selectedContractInput?: string,
): Promise<LiveVerificationOutcome> {
  const {bundle} = record;
  requireCond(
    bundle.origin !== 'local_preview' && bundle.provenance !== null,
    'Local preview bundles do not have an on-chain contract to verify against.',
  );
  const targetContract = bundle.provenance.contract;
  if (selectedContractInput && selectedContractInput.trim() !== '') {
    const cleanInput = address(selectedContractInput.trim());
    requireCond(
      cleanInput.toLowerCase() === targetContract.toLowerCase(),
      'The contract address field does not match the contract recorded in the bundle.',
    );
  }

  const checkedAt = new Date().toISOString();
  let actualChainId: number;
  let remoteCode: string;
  let remoteSnapshotRaw: unknown;
  let remoteResultRaw: unknown;

  try {
    actualChainId = Number(await reader.getChainId());
    if (actualChainId !== 61999) {
      return {
        status: 'live_mismatch',
        checkedAt,
        contract: targetContract,
        reasons: [`Connected RPC returned chainId ${actualChainId} instead of Studionet 61999.`],
      };
    }
    remoteCode = await reader.getContractCode(targetContract);
    remoteSnapshotRaw = await reader.getSnapshot(targetContract);
    remoteResultRaw = await reader.getResult(targetContract);
  } catch (e) {
    return {
      status: 'live_unavailable',
      checkedAt,
      contract: targetContract,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (typeof remoteCode !== 'string' || !remoteCode.trim()) {
    return {
      status: 'live_mismatch',
      checkedAt,
      contract: targetContract,
      reasons: ['No contract code was found at this address on Studionet.'],
    };
  }

  const mismatches: string[] = [];
  const liveSourceSha256 = await sha256Hex(remoteCode);
  if (liveSourceSha256 !== bundle.provenance.sourceSha256 || liveSourceSha256 !== REVIEWED_SOURCE_SHA256) {
    mismatches.push(`Deployed contract source SHA-256 (${liveSourceSha256.slice(0, 12)}…) does not match the reviewed workbench source.`);
  }

  if (typeof remoteSnapshotRaw !== 'string' || remoteSnapshotRaw.length === 0 || remoteSnapshotRaw.length > MAX_SNAPSHOT_BYTES) {
    mismatches.push('The contract did not return a valid on-chain snapshot string.');
  } else {
    const liveSnapshotSha256 = await sha256Hex(remoteSnapshotRaw);
    if (remoteSnapshotRaw !== bundle.canonicalSnapshot || liveSnapshotSha256 !== bundle.canonicalSha256) {
      mismatches.push(
        `On-chain canonical snapshot SHA-256 (${liveSnapshotSha256.slice(0, 12)}…) does not match bundle canonical SHA-256 (${bundle.canonicalSha256.slice(0, 12)}…).`,
      );
    }
  }

  if (typeof remoteResultRaw !== 'string') {
    mismatches.push('The contract did not return a valid string from get_result().');
  } else if (bundle.origin === 'chain_result' && bundle.assessment) {
    if (remoteResultRaw === '') {
      mismatches.push('Bundle claims a finalized on-chain assessment, but the contract on Studionet has not been assessed yet (get_result is empty).');
    } else {
      try {
        const {canonicalResult} = validateCanonicalAssessmentResult(remoteResultRaw, record.parsedCase);
        const liveResultSha256 = await sha256Hex(canonicalResult);
        if (canonicalResult !== bundle.assessment.resultRaw || liveResultSha256 !== bundle.assessment.resultSha256) {
          mismatches.push('On-chain C1–C4 assessment result does not match the findings recorded in the bundle.');
        }
      } catch (e) {
        mismatches.push(`On-chain result failed rubric validation: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else if (bundle.origin === 'chain_snapshot') {
    if (remoteResultRaw !== '') {
      try {
        const {findings, canonicalResult} = validateCanonicalAssessmentResult(remoteResultRaw, record.parsedCase);
        const liveResultSha256 = await sha256Hex(canonicalResult);
        if (mismatches.length === 0) {
          return {
            status: 'live_match',
            checkedAt,
            contract: targetContract,
            chainId: 61999,
            sourceSha256: liveSourceSha256,
            canonicalSha256: bundle.canonicalSha256,
            resultSha256: liveResultSha256,
            upgradedResultRaw: canonicalResult,
            upgradedFindings: findings,
            note: 'snapshot_matched_result_now_available',
          };
        }
      } catch (e) {
        mismatches.push(`On-chain result failed rubric validation: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (mismatches.length > 0) {
    return {
      status: 'live_mismatch',
      checkedAt,
      contract: targetContract,
      reasons: mismatches,
    };
  }

  return {
    status: 'live_match',
    checkedAt,
    contract: targetContract,
    chainId: 61999,
    sourceSha256: liveSourceSha256,
    canonicalSha256: bundle.canonicalSha256,
    resultSha256: bundle.assessment?.resultSha256 ?? null,
    note: 'exact_match',
  };
}

// 对比锁存基准快照（Baseline）与当前候选快照（Candidate）的结构化差异及重评影响
export async function diffSnapshots(baselineRaw: string, candidateRaw: string): Promise<SnapshotDiff> {
  const base = validateContractCompatibleCase(baselineRaw);
  const cand = validateContractCompatibleCase(candidateRaw);
  const b = base.parsed;
  const c = cand.parsed;

  const baselineCanonicalSha256 = await sha256Hex(base.canonicalSnapshot);
  const candidateCanonicalSha256 = await sha256Hex(cand.canonicalSnapshot);

  let reportDiff: ReportDiff;
  if (b.report === null && c.report === null) {
    reportDiff = {status: 'unchanged', commitChanged: false, passedChanged: false, totalChanged: false, before: null, after: null};
  } else if (b.report === null && c.report !== null) {
    reportDiff = {status: 'added', commitChanged: true, passedChanged: true, totalChanged: true, before: null, after: {...c.report}};
  } else if (b.report !== null && c.report === null) {
    reportDiff = {status: 'removed', commitChanged: true, passedChanged: true, totalChanged: true, before: {...b.report}, after: null};
  } else {
    const commitChanged = b.report!.commit !== c.report!.commit;
    const passedChanged = b.report!.passed !== c.report!.passed;
    const totalChanged = b.report!.total !== c.report!.total;
    reportDiff = {
      status: commitChanged || passedChanged || totalChanged ? 'modified' : 'unchanged',
      commitChanged,
      passedChanged,
      totalChanged,
      before: {...b.report!},
      after: {...c.report!},
    };
  }

  const baseMap = new Map(b.evidence.map(e => [e.id, e]));
  const candMap = new Map(c.evidence.map(e => [e.id, e]));
  const allIds: string[] = [];
  for (const e of b.evidence) allIds.push(e.id);
  for (const e of c.evidence) {
    if (!baseMap.has(e.id)) allIds.push(e.id);
  }

  const evidenceDiffs: EvidenceItemDiff[] = [];
  const changedEvidenceIds: string[] = [];
  let c3ReassessmentRequired = false;
  let c4ReassessmentRequired = false;

  for (const id of allIds) {
    const bItem = baseMap.get(id);
    const cItem = candMap.get(id);
    if (!bItem && cItem) {
      evidenceDiffs.push({
        id,
        status: 'added',
        criteriaBefore: [],
        criteriaAfter: [...cItem.criteria],
        textChanged: true,
        lengthBefore: 0,
        lengthAfter: [...cItem.text].length,
      });
      changedEvidenceIds.push(id);
      if (cItem.criteria.includes('C3')) c3ReassessmentRequired = true;
      if (cItem.criteria.includes('C4')) c4ReassessmentRequired = true;
    } else if (bItem && !cItem) {
      evidenceDiffs.push({
        id,
        status: 'removed',
        criteriaBefore: [...bItem.criteria],
        criteriaAfter: [],
        textChanged: true,
        lengthBefore: [...bItem.text].length,
        lengthAfter: 0,
      });
      changedEvidenceIds.push(id);
      if (bItem.criteria.includes('C3')) c3ReassessmentRequired = true;
      if (bItem.criteria.includes('C4')) c4ReassessmentRequired = true;
    } else if (bItem && cItem) {
      const criteriaChanged = canonicalizeJson(bItem.criteria) !== canonicalizeJson(cItem.criteria);
      const textChanged = bItem.text !== cItem.text;
      const modified = criteriaChanged || textChanged;
      evidenceDiffs.push({
        id,
        status: modified ? 'modified' : 'unchanged',
        criteriaBefore: [...bItem.criteria],
        criteriaAfter: [...cItem.criteria],
        textChanged,
        lengthBefore: [...bItem.text].length,
        lengthAfter: [...cItem.text].length,
      });
      if (modified) {
        changedEvidenceIds.push(id);
        if (bItem.criteria.includes('C3') || cItem.criteria.includes('C3')) c3ReassessmentRequired = true;
        if (bItem.criteria.includes('C4') || cItem.criteria.includes('C4')) c4ReassessmentRequired = true;
      }
    }
  }

  const commonIdsBefore = b.evidence.filter(e => candMap.has(e.id)).map(e => e.id);
  const commonIdsAfter = c.evidence.filter(e => baseMap.has(e.id)).map(e => e.id);
  const evidenceOrderChanged = commonIdsBefore.some((id, idx) => id !== commonIdsAfter[idx]);

  const disputeClientChanged = b.dispute.client !== c.dispute.client;
  const disputeAgentChanged = b.dispute.agent !== c.dispute.agent;
  const deliveryCommitChanged = b.delivery_commit !== c.delivery_commit;

  // 若交付 commit 或双方争议陈述变更，C3/C4 的上下文也发生变化，提示需要重新上链评估
  if (deliveryCommitChanged || disputeClientChanged || disputeAgentChanged || evidenceOrderChanged) {
    c3ReassessmentRequired = true;
    c4ReassessmentRequired = true;
  }

  const bObj = objectiveFindings(b);
  const cObj = objectiveFindings(c);
  const bC1 = bObj.find(f => f.criterion_id === 'C1')!.status;
  const cC1 = cObj.find(f => f.criterion_id === 'C1')!.status;
  const bC2 = bObj.find(f => f.criterion_id === 'C2')!.status;
  const cC2 = cObj.find(f => f.criterion_id === 'C2')!.status;

  return {
    identicalCanonical: base.canonicalSnapshot === cand.canonicalSnapshot,
    rawTextIdentical: baselineRaw === candidateRaw,
    baselineCanonicalSha256,
    candidateCanonicalSha256,
    caseId: {changed: b.case_id !== c.case_id, before: b.case_id, after: c.case_id},
    dueAt: {changed: b.due_at !== c.due_at, before: b.due_at, after: c.due_at},
    submittedAt: {changed: b.submitted_at !== c.submitted_at, before: b.submitted_at, after: c.submitted_at},
    deliveryCommit: {changed: deliveryCommitChanged, before: b.delivery_commit, after: c.delivery_commit},
    report: reportDiff,
    disputeClientChanged,
    disputeAgentChanged,
    evidenceOrderChanged,
    evidenceDiffs,
    changedEvidenceIds,
    c1Status: {changed: bC1 !== cC1, before: bC1, after: cC1},
    c2Status: {changed: bC2 !== cC2, before: bC2, after: cC2},
    c3ReassessmentRequired,
    c4ReassessmentRequired,
  };
}

// 为当前已验证的案例与评估发现构建逐项证据溯源明细（C1-C4）
export function buildCriterionTraceability(parsedCase: CaseInput, findings: Finding[]): CriterionTrace[] {
  const traces: CriterionTrace[] = [];
  const findingMap = new Map(findings.map(f => [f.criterion_id, f]));
  const objMap = new Map(objectiveFindings(parsedCase).map(f => [f.criterion_id, f]));

  // C1: 时间戳对比
  const f1 = findingMap.get('C1') ?? objMap.get('C1')!;
  let c1En = '';
  let c1Zh = '';
  if (parsedCase.submitted_at === null) {
    c1En = `submitted_at is null (due_at: ${parsedCase.due_at}) → insufficient_evidence`;
    c1Zh = `submitted_at 为 null（约定 due_at：${parsedCase.due_at}）→ 证据不足`;
  } else {
    const delta = parsedCase.submitted_at - parsedCase.due_at;
    const sign = delta > 0 ? `+${delta}s late` : `${delta}s (on or before deadline)`;
    const signZh = delta > 0 ? `晚于截止时间 +${delta} 秒` : `${delta} 秒（不晚于截止时间）`;
    c1En = `submitted_at (${parsedCase.submitted_at}) vs due_at (${parsedCase.due_at}): ${sign}`;
    c1Zh = `提交时间 (${parsedCase.submitted_at}) 对比截止时间 (${parsedCase.due_at})：${signZh}`;
  }
  traces.push({
    criterionId: 'C1',
    kind: 'deterministic',
    status: f1.status,
    citedIds: [...f1.evidence_ids],
    summaryEn: c1En,
    summaryZh: c1Zh,
    citedItems: [],
    uncitedCandidateIds: [],
  });

  // C2: 测试报告与交付版本对比
  const f2 = findingMap.get('C2') ?? objMap.get('C2')!;
  let c2En = '';
  let c2Zh = '';
  const shortCommit = `${parsedCase.delivery_commit.slice(0, 8)}…${parsedCase.delivery_commit.slice(-6)}`;
  if (parsedCase.report === null) {
    c2En = `report is null for delivery_commit ${shortCommit} → insufficient_evidence`;
    c2Zh = `交付版本 ${shortCommit} 的测试报告为 null → 证据不足`;
  } else {
    const r = parsedCase.report;
    const shortRep = `${r.commit.slice(0, 8)}…${r.commit.slice(-6)}`;
    const commitMatch = r.commit === parsedCase.delivery_commit;
    c2En = `report.commit (${shortRep}) ${commitMatch ? 'matches' : 'MISMATCHES'} delivery_commit (${shortCommit}); passed ${r.passed} / ${r.total}`;
    c2Zh = `报告版本 (${shortRep}) 与交付版本 (${shortCommit}) ${commitMatch ? '一致' : '不一致'}；通过 ${r.passed} / ${r.total}`;
  }
  traces.push({
    criterionId: 'C2',
    kind: 'deterministic',
    status: f2.status,
    citedIds: [...f2.evidence_ids],
    summaryEn: c2En,
    summaryZh: c2Zh,
    citedItems: [],
    uncitedCandidateIds: [],
  });

  // C3 & C4: 语义评估证据项映射
  for (const cid of ['C3', 'C4'] as const) {
    const f = findingMap.get(cid);
    if (!f) continue;
    const candidateItems = parsedCase.evidence.filter(e => e.criteria.includes(cid));
    const citedSet = new Set(f.evidence_ids);
    const citedItems = candidateItems
      .filter(e => citedSet.has(e.id))
      .map(e => ({id: e.id, criteria: [...e.criteria], text: e.text}));
    const uncitedCandidateIds = candidateItems.filter(e => !citedSet.has(e.id)).map(e => e.id);
    const summaryEn = citedItems.length
      ? `Cites ${citedItems.map(i => i.id).join(', ')} of ${candidateItems.length} ${cid}-tagged evidence item(s)`
      : `No ${cid} evidence cited (${candidateItems.length} candidate item(s) in snapshot)`;
    const summaryZh = citedItems.length
      ? `引用了 ${candidateItems.length} 项 ${cid} 关联证据中的 ${citedItems.map(i => i.id).join('、')}`
      : `未引用 ${cid} 证据（快照中共 ${candidateItems.length} 项候选证据）`;
    traces.push({
      criterionId: cid,
      kind: 'semantic',
      status: f.status,
      citedIds: [...f.evidence_ids],
      summaryEn,
      summaryZh,
      citedItems,
      uncitedCandidateIds,
    });
  }

  return traces;
}
