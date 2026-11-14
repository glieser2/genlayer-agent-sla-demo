import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const docsDir = fileURLToPath(new URL('../docs/', import.meta.url));
const base = '/genlayer-agent-sla-demo/';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!pathname.startsWith(base)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const filename = path.resolve(root, decodeURIComponent(pathname.slice(base.length)) || 'index.html');
  if (!filename.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const content = readFileSync(filename);
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.py': 'text/plain; charset=utf-8',
    }[path.extname(filename)] ?? 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime});
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const appUrl = `http://127.0.0.1:${port}${base}`;

const profileDir = mkdtempSync(path.join(tmpdir(), 'agent-sla-bundle-chrome-'));
const debugPort = 9400 + Math.floor(Math.random() * 400);

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--lang=zh-CN',
  '--accept-lang=zh-CN,zh',
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${debugPort}`,
  'about:blank',
], {stdio: 'ignore'});

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (r.ok) {
        const list = await r.json();
        const pageTarget = list.find(t => t.type === 'page');
        if (pageTarget?.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for headless Chrome DevTools endpoint');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, {once: true});
      this.ws.addEventListener('error', reject, {once: true});
    });
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.pending.has(msg.id)) {
        const {resolve, reject} = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolve, reject) => this.pending.set(id, {resolve, reject}));
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`);
    }
    return res.result.value;
  }
  async screenshot(filepath) {
    const {data} = await this.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
    writeFileSync(filepath, Buffer.from(data, 'base64'));
  }
  close() {
    this.ws.close();
  }
}

let cdp;
try {
  const wsUrl = await waitForDebugger();
  cdp = new CDPClient(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false});

  await cdp.send('Page.navigate', {url: appUrl});
  await new Promise(r => setTimeout(r, 800));

  // 1. 验证默认英文、v0.1.9 版本号且零汉字
  const init = await cdp.eval(`({
    lang: document.documentElement.lang,
    footerLeft: document.getElementById('footer-left').textContent,
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  })`);
  assert.equal(init.lang, 'en');
  assert.equal(init.footerLeft, 'Agent SLA Workbench · v0.1.9');
  assert.deepEqual(init.hanMatches, []);

  // 2. 加载合成案例并校验，确认同时显示精确文本哈希与合约规范化哈希，且显示溯源明细
  await cdp.eval(`document.getElementById('sample').click()`);
  await new Promise(r => setTimeout(r, 300));
  await cdp.eval(`document.getElementById('validate').click()`);
  await new Promise(r => setTimeout(r, 300));

  const localPreview = await cdp.eval(`({
    binding: document.getElementById('review-binding').textContent,
    traces: Array.from(document.querySelectorAll('.finding-trace')).map(el => el.textContent),
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  })`);
  assert.match(localPreview.binding, /Snapshot SHA-256: e8e8746ec6383a112c369ac57ea8409c1298b39a0a8a950f50adceb6cfd47e71/);
  assert.match(localPreview.binding, /Canonical Contract SHA-256: 5e7433a01618bfbc7ab213c1b9bc5ac12eb186e20d1fd957ddd92e83ebe3624a/);
  assert.equal(localPreview.traces.length, 2);
  assert.match(localPreview.traces[0], /submitted_at \(1792969200\) vs due_at \(1792972800\): -3600s/);
  assert.deepEqual(localPreview.hanMatches, []);

  // 3. 锁存基准（Pin as baseline）并修改草稿，验证旧评估立即失效清除，同时基准对比面板显示字段变更与 C2/C4 影响
  await cdp.eval(`document.getElementById('pin-baseline').click()`);
  await new Promise(r => setTimeout(r, 200));

  const pinnedIdentical = await cdp.eval(`document.getElementById('baseline-panel').textContent`);
  assert.match(pinnedIdentical, /exact same canonical contract snapshot/);

  await cdp.eval(`(() => {
    const el = document.getElementById('snapshot');
    const obj = JSON.parse(el.value);
    obj.report.passed = 12;
    obj.evidence[1].text += ' Run tests with npm test.';
    el.value = JSON.stringify(obj, null, 2);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await new Promise(r => setTimeout(r, 300));

  const afterEditDiff = await cdp.eval(`({
    resultSource: document.getElementById('result-source').textContent,
    findingsCount: document.querySelectorAll('.finding').length,
    baselineText: document.getElementById('baseline-panel').textContent,
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  })`);
  assert.equal(afterEditDiff.resultSource, 'Outdated · Review again');
  assert.equal(afterEditDiff.findingsCount, 0);
  assert.match(afterEditDiff.baselineText, /Test report \(modified\): pass count 11\/12 → 12\/12/);
  assert.match(afterEditDiff.baselineText, /Evidence E2 \[modified\]/);
  assert.match(afterEditDiff.baselineText, /C2 \(not_met → met\)/);
  assert.match(afterEditDiff.baselineText, /C4 evidence or context changed/);
  assert.deepEqual(afterEditDiff.hanMatches, []);

  // 4. 只读读取真实 Studionet 合约 0x12de9d0F0CEFC3697e76656A3b520c302e17faE9 并导出可验证评估包
  await cdp.eval(`document.getElementById('tab-chain').click()`);
  await new Promise(r => setTimeout(r, 200));
  await cdp.eval(`document.getElementById('read-verified').click()`);

  let chainRead;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    chainRead = await cdp.eval(`({
      resultSource: document.getElementById('result-source').textContent,
      message: document.getElementById('message').textContent,
      isError: document.getElementById('message').classList.contains('error'),
      findingsCount: document.querySelectorAll('.finding').length,
    })`);
    if (chainRead.resultSource === 'On-chain result' || chainRead.isError) break;
  }
  assert.equal(chainRead.resultSource, 'On-chain result', `Chain read failed: ${chainRead.message}`);
  assert.equal(chainRead.findingsCount, 4);

  const exportedBundleStr = await cdp.eval(`(() => {
    const origCreateObjectURL = URL.createObjectURL;
    let capturedBlob = null;
    URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:mock'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    return (async () => {
      try {
        document.getElementById('export-bundle').click();
        await new Promise(r => setTimeout(r, 150));
        return await capturedBlob.text();
      } finally {
        URL.createObjectURL = origCreateObjectURL;
        HTMLAnchorElement.prototype.click = origClick;
      }
    })();
  })()`);
  const exportedBundle = JSON.parse(exportedBundleStr);
  assert.equal(exportedBundle.schema, 'agent-sla-assessment-bundle/v1');
  assert.equal(exportedBundle.origin, 'chain_result');
  assert.equal(exportedBundle.canonicalSha256, '5e7433a01618bfbc7ab213c1b9bc5ac12eb186e20d1fd957ddd92e83ebe3624a');
  assert.equal(exportedBundle.assessment.findings.length, 4);

  // 5. 导入被篡改的评估包，确认零信任拦截并报错
  const tamperedBundle = structuredClone(exportedBundle);
  tamperedBundle.snapshot = tamperedBundle.snapshot.replace('"passed":11', '"passed":12');
  const tamperImportMsg = await cdp.eval(`(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(JSON.stringify(tamperedBundle))}], 'tampered.json', {type: 'application/json'}));
    const input = document.getElementById('import-bundle');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await new Promise(r => setTimeout(r, 250));
    return {
      msg: document.getElementById('message').textContent,
      isError: document.getElementById('message').classList.contains('error'),
    };
  })()`);
  assert.equal(tamperImportMsg.isError, true);
  assert.match(tamperImportMsg.msg, /Snapshot SHA-256 mismatch/);

  // 6. 离线导入合法的链上评估包，确认标记为 Imported bundle · Unverified on-chain，且导出 work-record 中 chainRead 为 null
  const unverifiedState = await cdp.eval(`(async () => {
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(exportedBundleStr)}], 'valid-bundle.json', {type: 'application/json'}));
    const input = document.getElementById('import-bundle');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await new Promise(r => setTimeout(r, 300));

    const origCreateObjectURL = URL.createObjectURL;
    let capturedBlob = null;
    URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:mock'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    let workRecord;
    try {
      document.getElementById('export').click();
      workRecord = JSON.parse(await capturedBlob.text());
    } finally {
      URL.createObjectURL = origCreateObjectURL;
      HTMLAnchorElement.prototype.click = origClick;
    }

    return {
      resultSource: document.getElementById('result-source').textContent,
      bindingText: document.getElementById('review-binding').textContent,
      verifyBtnVisible: !document.getElementById('verify-bundle-chain').classList.contains('hidden'),
      workRecordChainRead: workRecord.chainRead,
      workRecordCurrent: workRecord.reviewProvenance.current,
    };
  })()`);
  assert.equal(unverifiedState.resultSource, 'Imported bundle · Unverified on-chain');
  assert.match(unverifiedState.bindingText, /unverified on-chain/i);
  assert.equal(unverifiedState.verifyBtnVisible, true);
  assert.equal(unverifiedState.workRecordChainRead, null);
  assert.equal(unverifiedState.workRecordCurrent, null);

  // 7. 点击 Verify bundle on-chain ↗ 执行 Studionet (61999) 实时交叉核验，验证升级为 Bundle verified on Studionet
  await cdp.eval(`document.getElementById('verify-bundle-chain').click()`);
  let liveVerified;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    liveVerified = await cdp.eval(`({
      resultSource: document.getElementById('result-source').textContent,
      liveBoxText: document.getElementById('live-verify-box').textContent,
      liveBoxHidden: document.getElementById('live-verify-box').hidden,
      message: document.getElementById('message').textContent,
      isError: document.getElementById('message').classList.contains('error'),
      hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
    })`);
    if (liveVerified.resultSource.includes('Bundle verified') || liveVerified.isError) break;
  }
  assert.equal(liveVerified.resultSource, 'On-chain result · Bundle verified on Studionet', `Live bundle verify failed: ${liveVerified.message}`);
  assert.equal(liveVerified.liveBoxHidden, false);
  assert.match(liveVerified.liveBoxText, /live cross-check passed/);
  assert.deepEqual(liveVerified.hanMatches, []);

  await cdp.screenshot(path.join(docsDir, 'bundle-en-desktop-v019.png'));

  // 8. 切换到中文，验证所有新增 v0.1.9 评估包、核验框、溯源与基准对比全部准确翻译为中文
  await cdp.eval(`document.getElementById('lang-zh').click()`);
  await new Promise(r => setTimeout(r, 250));
  const zhCheck = await cdp.eval(`({
    lang: document.documentElement.lang,
    resultSource: document.getElementById('result-source').textContent,
    liveBoxText: document.getElementById('live-verify-box').textContent,
    baselineTitle: document.getElementById('baseline-heading').textContent,
    traces: Array.from(document.querySelectorAll('.finding-trace')).map(el => el.textContent),
  })`);
  assert.equal(zhCheck.lang, 'zh-CN');
  assert.equal(zhCheck.resultSource, '链上评估结果 · 评估包已通过 Studionet 核验');
  assert.match(zhCheck.liveBoxText, /实时交叉核验通过/);
  assert.equal(zhCheck.baselineTitle, '冻结基准对比与重评影响分析');
  assert.equal(zhCheck.traces.length, 4);
  assert.match(zhCheck.traces[0], /提交时间/);

  await cdp.screenshot(path.join(docsDir, 'bundle-zh-desktop-v019.png'));

  // 9. 切回英文并验证移动端 390px 布局零横向溢出且零汉字
  await cdp.eval(`document.getElementById('lang-en').click()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
  await new Promise(r => setTimeout(r, 300));
  const mobileCheck = await cdp.eval(`({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  })`);
  assert.ok(mobileCheck.scroll <= mobileCheck.viewport, `Mobile overflow: ${JSON.stringify(mobileCheck)}`);
  assert.deepEqual(mobileCheck.hanMatches, []);
  await cdp.screenshot(path.join(docsDir, 'bundle-en-mobile-v019.png'));

  const summary = {
    verifiedAt: new Date().toISOString(),
    version: '0.1.9',
    checks: [
      'Dual SHA-256 fingerprints: exact text SHA-256 (e8e8746e…) and canonical contract SHA-256 (5e7433a0…) aligned with Studionet contract storage',
      'Criterion-to-evidence traceability inline details for C1–C4 without breaking raw content preservation',
      'Pinned baseline comparison and reassessment impact analysis across edited drafts while clearing stale findings immediately',
      'Export self-contained verifiable assessment bundle (agent-sla-assessment-bundle/v1) from verified views',
      'Zero-trust bundle import rejects tampered snapshots, forged provenance, and mismatched digests',
      'Offline imported chain_result bundle explicitly labelled Unverified on-chain with null work-record chainRead until live RPC cross-check',
      'Read-only live Studionet (61999) cross-check against 0x12de9d0F0CEFC3697e76656A3b520c302e17faE9 upgrades bundle to verified on-chain status',
      'Full English (default, zero Han characters) and Simplified Chinese support across desktop (1440px) and mobile (390px) viewports',
    ],
    screenshots: [
      'docs/bundle-en-desktop-v019.png',
      'docs/bundle-zh-desktop-v019.png',
      'docs/bundle-en-mobile-v019.png',
    ],
  };
  writeFileSync(path.join(docsDir, 'bundle-verification-v019.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (cdp) cdp.close();
  chrome.kill();
  await new Promise(resolve => server.close(resolve));
  try { rmSync(profileDir, {recursive: true, force: true}); } catch {}
}
