export type Status = 'met' | 'not_met' | 'insufficient_evidence';
export type Finding = {criterion_id: string; status: Status; evidence_ids: string[]; reason: string};
export type CaseInput = {
  schema_version: number; case_id: string; due_at: number; submitted_at: number | null;
  delivery_commit: string; report: {commit: string; passed: number; total: number} | null;
  evidence: {id: string; criteria: string[]; text: string}[];
  dispute: {client: string; agent: string};
};
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, wanted: string[]) => Object.keys(v).sort().join('|') === [...wanted].sort().join('|');
const text = (v: unknown, max: number): v is string => typeof v === 'string' && [...v].length <= max && !!v.trim();
const int = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const commit = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
export function parseCase(raw: string): CaseInput {
  requireValue(new TextEncoder().encode(raw).length <= 16000, '证据包不能超过 16,000 字节。');
  const v: unknown = JSON.parse(raw);
  requireValue(object(v) && keys(v, ['schema_version','case_id','due_at','submitted_at','delivery_commit','report','evidence','dispute']), '证据包字段不完整或包含未知字段。');
  requireValue(v.schema_version === 1 && text(v.case_id, 80), 'schema_version 或 case_id 无效。');
  requireValue(int(v.due_at,4102444800) && (v.submitted_at === null || int(v.submitted_at,4102444800)), '时间戳必须是有效的 Unix 秒数。');
  requireValue(commit(v.delivery_commit), 'delivery_commit 必须是 40 位小写十六进制。');
  if (v.report !== null) {
    const r = v.report;
    requireValue(object(r) && keys(r,['commit','passed','total']) && commit(r.commit) && int(r.passed,10000) && int(r.total,10000) && r.total > 0 && r.passed <= r.total, '测试报告字段或通过数量无效。');
  }
  requireValue(Array.isArray(v.evidence) && v.evidence.length <= 8, '最多允许 8 项证据。');
  const ids = new Set<string>();
  for (const e of v.evidence) {
    requireValue(object(e) && keys(e,['id','criteria','text']) && text(e.id,24) && !ids.has(e.id) && text(e.text,3000), '证据 ID 必须唯一，内容不能为空。');
    requireValue(Array.isArray(e.criteria) && e.criteria.length >= 1 && e.criteria.length <= 2 && e.criteria.every(c => c === 'C3' || c === 'C4') && new Set(e.criteria).size === e.criteria.length, '证据只能关联 C3/C4，且不得重复。');
    ids.add(e.id);
  }
  requireValue(object(v.dispute) && keys(v.dispute,['client','agent']) && text(v.dispute.client,1500) && text(v.dispute.agent,1500), '双方陈述不能为空。');
  return v as CaseInput;
}
export function objectiveFindings(c: CaseInput): Finding[] {
  return [
    {criterion_id:'C1',status:c.submitted_at === null ? 'insufficient_evidence' : c.submitted_at <= c.due_at ? 'met':'not_met',evidence_ids:['INPUT:timestamps'],reason:'仅比较提供的时间戳，未认证交付时间。'},
    {criterion_id:'C2',status:c.report === null || c.report.commit !== c.delivery_commit ? 'insufficient_evidence' : c.report.passed === c.report.total ? 'met':'not_met',evidence_ids:['INPUT:report'],reason:'仅核对提供的报告与版本，未重新运行网站测试。'},
  ];
}
export function parseResult(raw: unknown, c: CaseInput): {findings: Finding[]; case_id: string; rubric: string; scope: string} {
  requireValue(typeof raw === 'string', '合约没有返回预期的 JSON 文本。');
  const v = JSON.parse(raw);
  requireValue(object(v) && v.case_id === c.case_id && v.rubric === 'SLA-DEMO-v1' && v.scope === 'supplied_evidence_only_no_settlement' && Array.isArray(v.findings) && v.findings.length === 4, '返回结果与证据包或协议不匹配。');
  for (const id of ['C1','C2','C3','C4']) {
    const matches = v.findings.filter((f: unknown) => object(f) && f.criterion_id === id);
    requireValue(matches.length === 1, '返回结果缺少标准或包含重复标准。');
    const f = matches[0];
    requireValue(object(f) && keys(f,['criterion_id','status','evidence_ids','reason']) && ['met','not_met','insufficient_evidence'].includes(String(f.status)) && text(f.reason,600) && Array.isArray(f.evidence_ids) && f.evidence_ids.length <= 8 && f.evidence_ids.every(r => typeof r === 'string') && new Set(f.evidence_ids).size === f.evidence_ids.length, '返回结果结构无效。');
    const allowed = id === 'C1' ? ['INPUT:timestamps'] : id === 'C2' ? ['INPUT:report'] : c.evidence.filter(e => e.criteria.includes(id)).map(e => e.id);
    requireValue(f.evidence_ids.every(r => allowed.includes(r)) && (f.status === 'insufficient_evidence' || f.evidence_ids.length > 0), '返回结果引用了未知或不相关证据。');
    if (id === 'C1' || id === 'C2') requireValue(f.status === objectiveFindings(c).find(x => x.criterion_id === id)!.status, '确定性检查与证据包不一致。');
  }
  return v as ReturnType<typeof parseResult>;
}
export function address(v: string): `0x${string}` {
  requireValue(/^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/.test(v), '请输入有效的非零合约地址。');
  return v as `0x${string}`;
}
export function hash(v: string): `0x${string}` & {length: 66} {
  requireValue(/^0x[0-9a-fA-F]{64}$/.test(v), '交易 ID 应为 0x 开头的 64 位十六进制。');
  return v as `0x${string}` & {length: 66};
}
export function receiptOutcome(v: {statusName?: unknown; txExecutionResultName?: unknown}) {
  if (v.statusName === 'CANCELED') return 'failed';
  if (v.statusName !== 'FINALIZED') return 'pending';
  if (v.txExecutionResultName === 'FINISHED_WITH_ERROR') return 'failed';
  return v.txExecutionResultName === 'FINISHED_WITH_RETURN' ? 'success' : 'unknown';
}
export type TxRecord = {hash: string; kind: 'deploy' | 'assess'; chainId: number; account: string; contract: string; createdAt: string; outcome: string};
export function parseJournal(raw: string | null): TxRecord[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((r): r is TxRecord => object(r) && /^0x[0-9a-fA-F]{64}$/.test(String(r.hash)) && (r.kind === 'deploy' || r.kind === 'assess') && r.chainId === 61999 && /^0x[0-9a-fA-F]{40}$/.test(String(r.account)) && (r.kind === 'deploy' || /^0x[0-9a-fA-F]{40}$/.test(String(r.contract))) && typeof r.contract === 'string' && typeof r.createdAt === 'string' && ['pending','success','failed','unknown','wrong_type'].includes(String(r.outcome))).slice(-40);
  } catch { return []; }
}
