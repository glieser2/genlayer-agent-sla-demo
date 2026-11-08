import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY,
  LOCALE_STORAGE_KEY,
  parseLocale,
  loadLocale,
  saveLocale,
  formatByteCount,
  formatTimestamp,
  localizeAppReason,
  translateError,
  formatQuoteSummary,
  formatSubmitButton,
  containsHan,
} from '../src/i18n.ts';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
  };
}

test('default to English when no preference is stored, even if browser language is Chinese', () => {
  const originalNavigator = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {language: 'zh-CN', languages: ['zh-CN', 'zh']},
      configurable: true,
    });
    const store = memoryStorage();
    assert.equal(loadLocale(store), 'en');
    assert.equal(loadLocale(null), 'en');
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    });
  }
});

test('persist user-selected locale and fall back to English on invalid values or storage failure', () => {
  const store = memoryStorage();
  assert.equal(saveLocale('zh-CN', store), true);
  assert.equal(store.getItem(LOCALE_STORAGE_KEY), 'zh-CN');
  assert.equal(loadLocale(store), 'zh-CN');

  assert.equal(saveLocale('en', store), true);
  assert.equal(loadLocale(store), 'en');

  store.setItem(LOCALE_STORAGE_KEY, 'fr-FR');
  assert.equal(loadLocale(store), 'en');
  store.setItem(LOCALE_STORAGE_KEY, '<script>');
  assert.equal(loadLocale(store), 'en');

  const brokenStore = {
    getItem() { throw new Error('Storage disabled'); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.equal(loadLocale(brokenStore), 'en');
  assert.equal(saveLocale('zh-CN', brokenStore), false);
  assert.equal(parseLocale('zh-CN'), 'zh-CN');
  assert.equal(parseLocale('unknown'), 'en');
});

test('English dictionary and language controls contain zero Chinese characters; Chinese dictionary is complete', () => {
  assert.equal(COPY.en.langEnLabel, 'English');
  assert.equal(COPY.en.langZhLabel, 'Chinese');
  for (const [key, value] of Object.entries(COPY.en)) {
    assert.equal(containsHan(value), false, `English key ${key} must not contain Han characters: ${value}`);
  }
  const enKeys = Object.keys(COPY.en).sort();
  const zhKeys = Object.keys(COPY['zh-CN']).sort();
  assert.deepEqual(zhKeys, enKeys);
  for (const [key, value] of Object.entries(COPY['zh-CN'])) {
    assert.ok(value.trim().length > 0, `Chinese key ${key} must not be empty`);
  }
});

test('format numbers, byte counts, timestamps, quote summaries and submit labels per locale', () => {
  assert.equal(formatByteCount(1101, 'en'), '1,101 / 16,000 bytes');
  assert.equal(formatByteCount(1101, 'zh-CN'), '1,101 / 16,000 字节');
  assert.match(formatTimestamp('2026-10-31T00:00:00.000Z', 'en'), /2026.*UTC/);
  assert.match(formatTimestamp('2026-10-31T00:00:00.000Z', 'zh-CN'), /2026.*UTC/);
  assert.equal(formatTimestamp('not-a-date', 'en'), 'not-a-date');

  const sampleQuote = {
    kind: 'deploy',
    route: 'session',
    chainId: 61999,
    account: '0x' + '1'.repeat(40),
    contract: '',
    consensusTarget: '0x' + '0'.repeat(40),
    caseId: 'SYNTHETIC-WEBSITE-001',
    snapshotSha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
    balance: 0n,
  };
  const enSummary = formatQuoteSummary(sampleQuote, 'en');
  const zhSummary = formatQuoteSummary(sampleQuote, 'zh-CN');
  assert.equal(containsHan(JSON.stringify(enSummary)), false);
  assert.equal(enSummary.contract, 'New deployment');
  assert.equal(zhSummary.contract, '新部署');
  assert.equal(enSummary.snapshotSha256, zhSummary.snapshotSha256);
  assert.equal(enSummary.sourceSha256, zhSummary.sourceSha256);

  assert.equal(formatSubmitButton(null, 'en'), 'Prepare a transaction first');
  assert.equal(formatSubmitButton(null, 'zh-CN'), '等待准备');
  assert.equal(formatSubmitButton({kind: 'deploy', route: 'session'}, 'en'), 'Confirm and send test deployment');
  assert.equal(formatSubmitButton({kind: 'deploy', route: 'session'}, 'zh-CN'), '确认并发送测试部署');
});

test('translate known errors in Chinese mode and preserve raw / on-chain findings faithfully', () => {
  const err = 'Connect an external wallet first.';
  assert.equal(translateError(err, 'en'), err);
  assert.equal(translateError(err, 'zh-CN'), '请先连接浏览器钱包。');
  assert.match(translateError('Unexpected token } in JSON at position 1', 'zh-CN'), /^JSON 语法无效：/);

  const previewReason = 'Compares supplied timestamps only; delivery time is not authenticated.';
  assert.equal(localizeAppReason(previewReason, 'local_preview', 'en').text, previewReason);
  assert.equal(localizeAppReason(previewReason, 'local_preview', 'zh-CN').text, '仅比较提供的时间戳，未认证交付时间。');

  const onChainChineseReason = '链上原始评估原因：360px 存在横向溢出。';
  const preservedEn = localizeAppReason(onChainChineseReason, 'chain_result', 'en');
  const preservedZh = localizeAppReason(onChainChineseReason, 'chain_result', 'zh-CN');
  assert.equal(preservedEn.text, onChainChineseReason);
  assert.equal(preservedEn.isRawPreserved, true);
  assert.equal(preservedZh.text, onChainChineseReason);
  assert.equal(preservedZh.isRawPreserved, true);
});
