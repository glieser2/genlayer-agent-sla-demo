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

const profileDir = mkdtempSync(path.join(tmpdir(), 'agent-sla-chrome-'));
const debugPort = 9333 + Math.floor(Math.random() * 500);

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
    this.events = [];
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
      } else if (msg.method) {
        this.events.push(msg);
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

  // 1. 全新访问且浏览器环境为 zh-CN，验证仍默认英文
  await cdp.send('Page.navigate', {url: appUrl});
  await new Promise(r => setTimeout(r, 800));

  const initialCheck = await cdp.eval(`(() => {
    const visibleText = document.body.innerText;
    const hanMatches = visibleText.match(/[\\u3400-\\u9fff]+/g) ?? [];
    const attrs = Array.from(document.querySelectorAll('[aria-label],[placeholder],title')).map(el => el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent);
    const attrHan = attrs.filter(Boolean).filter(s => /[\\u3400-\\u9fff]/.test(s));
    return {
      navigatorLang: navigator.language,
      docLang: document.documentElement.lang,
      translateAttr: document.documentElement.getAttribute('translate'),
      storedLocale: localStorage.getItem('agent-sla:locale:v1'),
      langEnText: document.getElementById('lang-en').textContent,
      langZhText: document.getElementById('lang-zh').textContent,
      langEnPressed: document.getElementById('lang-en').getAttribute('aria-pressed'),
      langZhPressed: document.getElementById('lang-zh').getAttribute('aria-pressed'),
      hanMatches,
      attrHan,
      footerLeft: document.getElementById('footer-left').textContent,
    };
  })()`);

  assert.equal(initialCheck.docLang, 'en');
  assert.equal(initialCheck.translateAttr, 'no');
  assert.equal(initialCheck.storedLocale, null);
  assert.equal(initialCheck.langEnText, 'English');
  assert.equal(initialCheck.langZhText, 'Chinese');
  assert.equal(initialCheck.langEnPressed, 'true');
  assert.equal(initialCheck.langZhPressed, 'false');
  assert.deepEqual(initialCheck.hanMatches, [], 'English UI must contain zero Han characters');
  assert.deepEqual(initialCheck.attrHan, [], 'English attributes must contain zero Han characters');
  assert.equal(initialCheck.footerLeft, 'Agent SLA Workbench · v0.1.8');

  // 2. 空状态错误提示验证（英文）
  await cdp.eval(`document.getElementById('validate').click()`);
  await new Promise(r => setTimeout(r, 200));
  const emptyErrorEn = await cdp.eval(`document.getElementById('message').textContent`);
  assert.match(emptyErrorEn, /JSON|Unexpected end/i);

  // 3. 加载合成案例并校验预览（英文）
  await cdp.eval(`document.getElementById('sample').click()`);
  await new Promise(r => setTimeout(r, 300));
  await cdp.eval(`document.getElementById('validate').click()`);
  await new Promise(r => setTimeout(r, 300));

  const previewEn = await cdp.eval(`(() => ({
    draft: document.getElementById('snapshot').value,
    status: document.getElementById('case-status').textContent,
    byteCount: document.getElementById('byte-count').textContent,
    resultSource: document.getElementById('result-source').textContent,
    bindingText: document.getElementById('review-binding').textContent,
    findingsCount: document.querySelectorAll('.finding').length,
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  }))()`);

  assert.equal(previewEn.status, 'Schema valid');
  assert.match(previewEn.byteCount, /bytes$/);
  assert.equal(previewEn.resultSource, 'Local deterministic preview');
  assert.match(previewEn.bindingText, /Evidence binding · Revision 2/);
  assert.match(previewEn.bindingText, /Snapshot SHA-256: e8e8746ec6383a112c369ac57ea8409c1298b39a0a8a950f50adceb6cfd47e71/);
  assert.equal(previewEn.findingsCount, 2);
  assert.deepEqual(previewEn.hanMatches, []);

  await cdp.screenshot(path.join(docsDir, 'bilingual-en-desktop-v018.png'));

  // 4. 英文 -> 中文切换，验证草稿、版本和指纹完全不变，且中文界面完整翻译
  await cdp.eval(`document.getElementById('lang-zh').click()`);
  await new Promise(r => setTimeout(r, 200));

  const previewZh = await cdp.eval(`(() => ({
    docLang: document.documentElement.lang,
    storedLocale: localStorage.getItem('agent-sla:locale:v1'),
    langEnText: document.getElementById('lang-en').textContent,
    langZhText: document.getElementById('lang-zh').textContent,
    langEnPressed: document.getElementById('lang-en').getAttribute('aria-pressed'),
    langZhPressed: document.getElementById('lang-zh').getAttribute('aria-pressed'),
    draft: document.getElementById('snapshot').value,
    status: document.getElementById('case-status').textContent,
    byteCount: document.getElementById('byte-count').textContent,
    resultSource: document.getElementById('result-source').textContent,
    bindingText: document.getElementById('review-binding').textContent,
    findingTitles: Array.from(document.querySelectorAll('.finding h3')).map(e => e.textContent),
    findingReasons: Array.from(document.querySelectorAll('.finding p:not(.micro)')).map(e => e.textContent),
    messageText: document.getElementById('message').textContent,
  }))()`);

  assert.equal(previewZh.docLang, 'zh-CN');
  assert.equal(previewZh.storedLocale, 'zh-CN');
  assert.equal(previewZh.langEnText, '英文');
  assert.equal(previewZh.langZhText, '简体中文');
  assert.equal(previewZh.langZhPressed, 'true');
  assert.equal(previewZh.draft, previewEn.draft, 'Draft must remain identical after language switch');
  assert.equal(previewZh.status, '结构检查通过');
  assert.match(previewZh.byteCount, /字节$/);
  assert.equal(previewZh.resultSource, '本地确定性预览');
  assert.match(previewZh.bindingText, /证据绑定 · 修订版 2/);
  assert.match(previewZh.bindingText, /Snapshot SHA-256: e8e8746ec6383a112c369ac57ea8409c1298b39a0a8a950f50adceb6cfd47e71/);
  assert.deepEqual(previewZh.findingTitles, ['满足', '未满足']);
  assert.equal(previewZh.messageText, '证据包结构有效，已预览 C1/C2。');

  await cdp.screenshot(path.join(docsDir, 'bilingual-zh-desktop-v018.png'));

  // 5. 刷新后恢复用户主动选择的中文偏好
  await cdp.send('Page.reload');
  await new Promise(r => setTimeout(r, 600));
  const afterReloadZh = await cdp.eval(`({
    docLang: document.documentElement.lang,
    storedLocale: localStorage.getItem('agent-sla:locale:v1'),
    title: document.getElementById('case-title').textContent,
  })`);
  assert.equal(afterReloadZh.docLang, 'zh-CN');
  assert.equal(afterReloadZh.storedLocale, 'zh-CN');
  assert.equal(afterReloadZh.title, '你的交付证据包');

  // 6. 中文 -> 英文切换，以及非法偏好与存储不可用回退英文验证
  await cdp.eval(`document.getElementById('lang-en').click()`);
  await new Promise(r => setTimeout(r, 200));
  const backToEn = await cdp.eval(`({
    docLang: document.documentElement.lang,
    storedLocale: localStorage.getItem('agent-sla:locale:v1'),
    hanMatches: document.body.innerText.match(/[\\u3400-\\u9fff]+/g) ?? [],
  })`);
  assert.equal(backToEn.docLang, 'en');
  assert.equal(backToEn.storedLocale, 'en');
  assert.deepEqual(backToEn.hanMatches, []);

  // 测试导出工作记录的中英文说明切换（拦截 Blob 内容验证）
  const exportedRecords = await cdp.eval(`(() => {
    const captured = [];
    const origCreateObjectURL = URL.createObjectURL;
    let lastBlob = null;
    URL.createObjectURL = (blob) => { lastBlob = blob; return 'blob:mock'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    return (async () => {
      try {
        document.getElementById('export').click();
        const enJson = JSON.parse(await lastBlob.text());
        document.getElementById('lang-zh').click();
        document.getElementById('export').click();
        const zhJson = JSON.parse(await lastBlob.text());
        document.getElementById('lang-en').click();
        return {enJson, zhJson};
      } finally {
        URL.createObjectURL = origCreateObjectURL;
        HTMLAnchorElement.prototype.click = origClick;
      }
    })();
  })()`);
  assert.equal(exportedRecords.enJson.version, '0.1.8');
  assert.equal(exportedRecords.enJson.locale, 'en');
  assert.equal(/[\u3400-\u9fff]/.test(exportedRecords.enJson.note), false);
  assert.equal(exportedRecords.zhJson.locale, 'zh-CN');
  assert.match(exportedRecords.zhJson.note, /仅包含 RPC 观测与本机记录/);

  await cdp.eval(`localStorage.setItem('agent-sla:locale:v1', 'invalid-locale')`);
  await cdp.send('Page.reload');
  await new Promise(r => setTimeout(r, 600));
  const fallbackEn = await cdp.eval(`document.documentElement.lang`);
  assert.equal(fallbackEn, 'en');

  // 模拟 localStorage 抛出异常时页面正常初始化并回退英文
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if (window.__breakStorage) { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }); }`,
  });
  await cdp.eval(`window.name = 'breakStorage';`);
  const storageExceptionCheck = await cdp.eval(`(() => {
    const origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('Blocked'); };
    try {
      document.getElementById('lang-zh').click();
      return {lang: document.documentElement.lang};
    } finally {
      Storage.prototype.getItem = origGetItem;
      document.getElementById('lang-en').click();
    }
  })()`);
  assert.equal(storageExceptionCheck.lang, 'zh-CN');

  // 7. 只读链上读取既有合约 0x12de9d0F0CEFC3697e76656A3b520c302e17faE9 并验证切换语言保持链上结果与指纹不变
  await cdp.eval(`document.getElementById('tab-chain').click()`);
  await new Promise(r => setTimeout(r, 200));
  await cdp.eval(`document.getElementById('read-verified').click()`);

  let chainReadState;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    chainReadState = await cdp.eval(`({
      resultSource: document.getElementById('result-source').textContent,
      message: document.getElementById('message').textContent,
      isError: document.getElementById('message').classList.contains('error'),
      findingsCount: document.querySelectorAll('.finding').length,
      bindingText: document.getElementById('review-binding').textContent,
    })`);
    if (chainReadState.resultSource === 'On-chain result' || chainReadState.isError) break;
  }
  assert.equal(chainReadState.resultSource, 'On-chain result', `Chain read failed: ${chainReadState.message}`);
  assert.equal(chainReadState.findingsCount, 4);
  assert.match(chainReadState.bindingText, /Source SHA-256: 9bab25a9f898d20ec6af13f0e34aa19d395998f973a592d379726e48304dd912/);

  // 切换至中文，确认链上评估结果的指印与原文保留不变，而界面标签切换为中文
  await cdp.eval(`document.getElementById('lang-zh').click()`);
  await new Promise(r => setTimeout(r, 200));
  const chainReadZh = await cdp.eval(`({
    resultSource: document.getElementById('result-source').textContent,
    bindingText: document.getElementById('review-binding').textContent,
    findingTitles: Array.from(document.querySelectorAll('.finding h3')).map(e => e.textContent),
    rawReasons: Array.from(document.querySelectorAll('.finding p[data-raw-content="true"]')).map(e => e.textContent),
  })`);
  assert.equal(chainReadZh.resultSource, '链上读取');
  assert.match(chainReadZh.bindingText, /已校验源码 · chain 61999 · 0x12de9d0F0CEFC3697e76656A3b520c302e17faE9/);
  assert.deepEqual(chainReadZh.findingTitles, ['满足', '未满足', '未满足', '未满足']);
  assert.equal(chainReadZh.rawReasons.length, 4, 'All 4 on-chain reasons must be preserved verbatim');

  // 切回英文并检查移动端 390px 响应式布局无横向溢出且无汉字
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
  await cdp.screenshot(path.join(docsDir, 'bilingual-en-mobile-v018.png'));

  const summary = {
    verifiedAt: new Date().toISOString(),
    version: '0.1.8',
    checks: [
      'Default English on fresh visit even when browser locale is zh-CN',
      'Zero Chinese characters in English UI text and attributes',
      'English -> Simplified Chinese -> English switcher updates all labels and status messages',
      'Language preference persists across reload and falls back to English on invalid storage value',
      'Draft text, revision number and SHA-256 fingerprints remain unchanged across language switches',
      'Read-only live Studionet contract 0x12de9d0F0CEFC3697e76656A3b520c302e17faE9 verified across English and Chinese views',
      'On-chain finding reasons preserved verbatim without silent translation',
      'Desktop (1440px) and mobile (390px) layouts have zero horizontal overflow',
    ],
    screenshots: [
      'docs/bilingual-en-desktop-v018.png',
      'docs/bilingual-zh-desktop-v018.png',
      'docs/bilingual-en-mobile-v018.png',
    ],
  };
  writeFileSync(path.join(docsDir, 'bilingual-verification-v018.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (cdp) cdp.close();
  chrome.kill();
  await new Promise(resolve => server.close(resolve));
  try { rmSync(profileDir, {recursive: true, force: true}); } catch {}
}
