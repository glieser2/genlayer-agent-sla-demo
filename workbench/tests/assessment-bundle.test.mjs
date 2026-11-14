import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  BUNDLE_SCHEMA,
  isPythonBlankString,
  canonicalizeJson,
  canonicalizeCase,
  validateContractCompatibleCase,
  validateCanonicalAssessmentResult,
  sha256Hex,
  buildAssessmentBundle,
  verifyAssessmentBundle,
  compareBundleWithLiveChain,
  diffSnapshots,
  buildCriterionTraceability,
} from '../src/assessment-bundle.ts';
import {parseCase} from '../src/domain.ts';
import {REVIEWED_SOURCE_SHA256} from '../src/studio-session.ts';

const rawFixture = readFileSync(new URL('../public/fixtures/case.json', import.meta.url), 'utf8');
const contractCode = readFileSync(new URL('../public/contracts/agent_sla.py', import.meta.url), 'utf8');
const demoAssessmentObj = JSON.parse(readFileSync(new URL('../public/fixtures/demo-result.json', import.meta.url), 'utf8')).assessment;
const canonicalResultStr = canonicalizeJson(demoAssessmentObj);

const ON_CHAIN_SNAPSHOT_SHA256 = '5e7433a01618bfbc7ab213c1b9bc5ac12eb186e20d1fd957ddd92e83ebe3624a';
const VERIFIED_CONTRACT = '0x12de9d0F0CEFC3697e76656A3b520c302e17faE9';

test('canonicalizeCase matches the deployed Python contract canonical() SHA-256 byte-for-byte', async () => {
  const {parsed, canonicalSnapshot} = validateContractCompatibleCase(rawFixture);
  assert.equal(await sha256Hex(canonicalSnapshot), ON_CHAIN_SNAPSHOT_SHA256);

  // Indented JSON and compact JSON produce different text hashes but identical canonical contract hashes
  const pretty = JSON.stringify(parsed, null, 2);
  const prettySha = await sha256Hex(pretty);
  assert.notEqual(prettySha, ON_CHAIN_SNAPSHOT_SHA256);
  assert.equal(await sha256Hex(canonicalizeCase(parseCase(pretty))), ON_CHAIN_SNAPSHOT_SHA256);
});

test('canonicalizeJson matches Python ensure_ascii=True for control chars, DEL, BMP, and surrogate pairs', () => {
  assert.equal(canonicalizeJson({b: 1, a: 'hello/world'}), '{"a":"hello/world","b":1}');
  assert.equal(canonicalizeJson('\u0000\u001f\u007f'), '"\\u0000\\u001f\\u007f"');
  assert.equal(canonicalizeJson('é中'), '"\\u00e9\\u4e2d"');
  assert.equal(canonicalizeJson('😀'), '"\\ud83d\\ude00"');
  assert.equal(canonicalizeJson('\u2028\u2029'), '"\\u2028\\u2029"');
});

test('validateContractCompatibleCase rejects lone surrogates, float tokens, Python-only blank strings, and >16KB canonical expansion', () => {
  // 1. Lone surrogate
  assert.throws(() => validateContractCompatibleCase('{"a":"\ud800"}'), /surrogate/i);

  // 2. Float token like 1.0 or 1e3 (accepted by JS JSON.parse as integer 1, rejected by Python type(x) is int)
  const floatRaw = rawFixture.replace('"schema_version": 1', '"schema_version": 1.0');
  assert.doesNotThrow(() => parseCase(floatRaw));
  assert.throws(() => validateContractCompatibleCase(floatRaw), /integers without decimals/i);

  // 3. Python-only whitespace (\x85 or \x1c)
  const base = JSON.parse(rawFixture);
  const blankCase = structuredClone(base);
  blankCase.dispute.client = '\x85\x1c';
  assert.throws(() => validateContractCompatibleCase(JSON.stringify(blankCase)), /Both party statements/i);

  // 4. Snapshot <= 16,000 UTF-8 bytes in raw form that expands > 16,000 bytes after \uXXXX ASCII escaping
  const bloated = structuredClone(base);
  bloated.evidence[0].text = '中'.repeat(2500);
  bloated.evidence[1].text = '文'.repeat(2000);
  const bloatedRaw = JSON.stringify(bloated);
  assert.ok(Buffer.byteLength(bloatedRaw, 'utf8') <= 16000);
  assert.throws(() => validateContractCompatibleCase(bloatedRaw), /exceeds the 16,000-byte on-chain limit after ASCII escaping/i);
});

test('buildAssessmentBundle and verifyAssessmentBundle round-trip local_preview and chain_result bundles with strict trust boundaries', async () => {
  const pretty = JSON.stringify(JSON.parse(rawFixture), null, 2);
  const prettySha = await sha256Hex(pretty);

  // 1. Local preview bundle
  const localBundle = await buildAssessmentBundle({
    origin: 'local_preview',
    snapshot: pretty,
    boundSnapshotSha256: prettySha,
    boundCaseId: 'SYNTHETIC-WEBSITE-001',
    observedAt: '2026-11-09T05:00:00.000Z',
    exportedAt: '2026-11-09T05:01:00.000Z',
  });
  assert.equal(localBundle.schema, BUNDLE_SCHEMA);
  assert.equal(localBundle.canonicalSha256, ON_CHAIN_SNAPSHOT_SHA256);
  assert.equal(localBundle.provenance, null);
  assert.equal(localBundle.assessment, null);

  const verifiedLocal = await verifyAssessmentBundle(JSON.stringify(localBundle));
  assert.equal(verifiedLocal.trust, 'local_only');
  assert.equal(verifiedLocal.findings.length, 2);

  // 2. Chain result bundle (imported offline -> trust must be unverified_on_chain)
  const canonicalSnap = localBundle.canonicalSnapshot;
  const chainBundle = await buildAssessmentBundle({
    origin: 'chain_result',
    snapshot: canonicalSnap,
    boundSnapshotSha256: ON_CHAIN_SNAPSHOT_SHA256,
    boundCaseId: 'SYNTHETIC-WEBSITE-001',
    observedAt: '2026-11-09T05:02:00.000Z',
    exportedAt: '2026-11-09T05:03:00.000Z',
    provenance: {
      chainId: 61999,
      contract: VERIFIED_CONTRACT,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    },
    resultRaw: canonicalResultStr,
  });
  assert.equal(chainBundle.assessment?.findings.length, 4);

  const verifiedChain = await verifyAssessmentBundle(JSON.stringify(chainBundle));
  assert.equal(verifiedChain.trust, 'unverified_on_chain');
  assert.equal(verifiedChain.findings.length, 4);

  // 3. Synthetic example cannot be exported as a verifiable bundle
  await assert.rejects(
    () =>
      buildAssessmentBundle({
        origin: 'synthetic_example',
        snapshot: pretty,
        boundSnapshotSha256: prettySha,
        boundCaseId: 'SYNTHETIC-WEBSITE-001',
        observedAt: '2026-11-09T05:00:00.000Z',
      }),
    /synthetic example/i,
  );
});

test('verifyAssessmentBundle rejects tampered hashes, forged provenance, modified findings, extra keys, and oversized payloads', async () => {
  const canonicalSnap = canonicalizeCase(parseCase(rawFixture));
  const validBundle = await buildAssessmentBundle({
    origin: 'chain_result',
    snapshot: canonicalSnap,
    boundSnapshotSha256: ON_CHAIN_SNAPSHOT_SHA256,
    boundCaseId: 'SYNTHETIC-WEBSITE-001',
    observedAt: '2026-11-09T05:02:00.000Z',
    exportedAt: '2026-11-09T05:03:00.000Z',
    provenance: {
      chainId: 61999,
      contract: VERIFIED_CONTRACT,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    },
    resultRaw: canonicalResultStr,
  });

  const mutate = fn => {
    const copy = structuredClone(validBundle);
    fn(copy);
    return JSON.stringify(copy);
  };

  // Tampered snapshot text without updating hash
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.snapshot = b.snapshot.replace('11', '12'); })), /mismatch/i);

  // Tampered canonicalSha256
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.canonicalSha256 = 'a'.repeat(64); })), /Canonical SHA-256 mismatch/i);

  // Forged trust field or unknown top-level property
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.trust = 'verified_on_chain'; })), /unknown top-level/i);

  // Local preview claiming chain provenance
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.origin = 'local_preview'; })), /cannot carry on-chain provenance/i);

  // Wrong contract source hash
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.provenance.sourceSha256 = 'f'.repeat(64); })), /source SHA-256 does not match/i);

  // Tampered finding status in bundle.assessment.findings
  await assert.rejects(() => verifyAssessmentBundle(mutate(b => { b.assessment.findings[2].status = 'met'; })), /does not match the validated resultRaw/i);

  // Oversized payload > 64,000 bytes
  await assert.rejects(() => verifyAssessmentBundle('x'.repeat(64001)), /64,000 bytes/i);
});

test('compareBundleWithLiveChain distinguishes exact match, snapshot upgrade, mismatch, and RPC unavailability', async () => {
  const canonicalSnap = canonicalizeCase(parseCase(rawFixture));
  const chainBundle = await buildAssessmentBundle({
    origin: 'chain_result',
    snapshot: canonicalSnap,
    boundSnapshotSha256: ON_CHAIN_SNAPSHOT_SHA256,
    boundCaseId: 'SYNTHETIC-WEBSITE-001',
    observedAt: '2026-11-09T05:02:00.000Z',
    exportedAt: '2026-11-09T05:03:00.000Z',
    provenance: {
      chainId: 61999,
      contract: VERIFIED_CONTRACT,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    },
    resultRaw: canonicalResultStr,
  });
  const verified = await verifyAssessmentBundle(JSON.stringify(chainBundle));

  // 1. Exact live match
  const matchingReader = {
    async getChainId() { return 61999; },
    async getContractCode() { return contractCode; },
    async getSnapshot() { return canonicalSnap; },
    async getResult() { return canonicalResultStr; },
  };
  const matchRes = await compareBundleWithLiveChain(verified, matchingReader);
  assert.equal(matchRes.status, 'live_match');
  assert.equal(matchRes.note, 'exact_match');

  // 2. Live mismatch when on-chain result is empty or different
  const unassessedReader = {...matchingReader, async getResult() { return ''; }};
  const mismatchRes = await compareBundleWithLiveChain(verified, unassessedReader);
  assert.equal(mismatchRes.status, 'live_mismatch');
  assert.match(mismatchRes.reasons[0], /has not been assessed yet/i);

  // 3. RPC network failure -> live_unavailable (not mismatch)
  const failingReader = {...matchingReader, async getContractCode() { throw new Error('Studio RPC HTTP 503'); }};
  const unavailRes = await compareBundleWithLiveChain(verified, failingReader);
  assert.equal(unavailRes.status, 'live_unavailable');
  assert.match(unavailRes.error, /503/);

  // 4. chain_snapshot bundle upgraded when live contract now has a finalized result
  const snapBundle = await buildAssessmentBundle({
    origin: 'chain_snapshot',
    snapshot: canonicalSnap,
    boundSnapshotSha256: ON_CHAIN_SNAPSHOT_SHA256,
    boundCaseId: 'SYNTHETIC-WEBSITE-001',
    observedAt: '2026-11-09T05:02:00.000Z',
    provenance: {
      chainId: 61999,
      contract: VERIFIED_CONTRACT,
      sourceSha256: REVIEWED_SOURCE_SHA256,
    },
  });
  const verifiedSnap = await verifyAssessmentBundle(JSON.stringify(snapBundle));
  const upgradeRes = await compareBundleWithLiveChain(verifiedSnap, matchingReader);
  assert.equal(upgradeRes.status, 'live_match');
  assert.equal(upgradeRes.note, 'snapshot_matched_result_now_available');
  assert.equal(upgradeRes.upgradedFindings?.length, 4);
});

test('diffSnapshots and buildCriterionTraceability detect field edits, C1/C2 status transitions, C3/C4 impact, and evidence citations', async () => {
  const baseObj = JSON.parse(rawFixture);
  const candObj = structuredClone(baseObj);
  candObj.report.passed = 12; // C2 transitions from not_met -> met
  candObj.evidence[1].text += ' Run tests with npm test.'; // E2 (C4) modified

  const diff = await diffSnapshots(JSON.stringify(baseObj, null, 2), JSON.stringify(candObj, null, 2));
  assert.equal(diff.identicalCanonical, false);
  assert.equal(diff.c1Status.changed, false);
  assert.equal(diff.c2Status.changed, true);
  assert.equal(diff.c2Status.before, 'not_met');
  assert.equal(diff.c2Status.after, 'met');
  assert.equal(diff.c3ReassessmentRequired, false);
  assert.equal(diff.c4ReassessmentRequired, true);
  assert.deepEqual(diff.changedEvidenceIds, ['E2']);

  const traces = buildCriterionTraceability(baseObj, demoAssessmentObj.findings);
  assert.equal(traces.length, 4);
  assert.match(traces[0].summaryEn, /-3600s/);
  assert.match(traces[1].summaryEn, /passed 11 \/ 12/);
  assert.deepEqual(traces[2].citedItems.map(i => i.id), ['E1']);
  assert.deepEqual(traces[3].citedItems.map(i => i.id), ['E2']);
});

test('Audit regression: Python whitespace parity (\\ufeff vs \\x85/\\x1c) and UTF-8 byte-size checks', () => {
  // \ufeff is NOT whitespace in Python str.isspace(), whereas \x85 and \x1c ARE whitespace in Python
  assert.equal(isPythonBlankString('\ufeff'), false);
  assert.equal(isPythonBlankString('\x85\x1c\t\n'), true);

  // UTF-8 byte size limit check on validateCanonicalAssessmentResult
  const parsedCase = JSON.parse(rawFixture);
  const oversizedReason = 'é'.repeat(8100); // 8,100 chars (< 16,000 UTF-16 units) but 16,200 UTF-8 bytes (> 16,000 limit)
  const oversizedResult = JSON.stringify({
    ...demoAssessmentObj,
    findings: demoAssessmentObj.findings.map((f, idx) => (idx === 2 ? {...f, reason: oversizedReason} : f)),
  });
  assert.ok(oversizedResult.length < 16000);
  assert.throws(() => validateCanonicalAssessmentResult(oversizedResult, parsedCase), /Invalid on-chain assessment result text/);
});
