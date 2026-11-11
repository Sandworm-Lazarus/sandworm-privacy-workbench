'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
const ids = ['source', 'output', 'mode-json', 'mode-text', 'email-rule', 'default-fields',
  'custom-fields', 'redact-btn', 'demo-btn', 'clear-btn', 'upload-btn', 'file-input',
  'drop-zone', 'review-check', 'copy-btn', 'download-btn', 'status', 'error-box',
  'email-count', 'field-count', 'input-size', 'output-size', 'result-badge',
  'source-label', 'hide-source', 'source-cover', 'source-panel', 'mode-hint',
  'presidio-import','presidio-file','presidio-panel','presidio-summary','presidio-findings'];

class Element {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.files = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.classes = new Set();
    this.classList = {
      add: value => this.classes.add(value),
      remove: value => this.classes.delete(value),
      toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value)
    };
  }
  addEventListener(name, callback) {
    const entries = this.listeners.get(name) || [];
    entries.push(callback);
    this.listeners.set(name, entries);
  }
  async dispatch(name, detail = {}) {
    const event = { prevented: false, preventDefault() { this.prevented = true; }, ...detail };
    for (const callback of this.listeners.get(name) || []) await callback(event);
    return event;
  }
  click() { if (!this.disabled) return this.dispatch('click'); }
  focus() { this.focused = true; }
  replaceChildren(...children) { this.children=children; }
  appendChild(child) { (this.children ||= []).push(child); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  remove() { this.removed = true; }
}

function setup(options = {}) {
  const el = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  el['email-rule'].checked = true;
  el['default-fields'].checked = true;
  const doc = new Element('document');
  doc.readyState = options.loading ? 'loading' : 'complete';
  doc.getElementById = id => el[id];
  const anchors = [];
  doc.createElement = tag => {
    if(tag==='tr'||tag==='td') return new Element(tag);
    assert.equal(tag, 'a');
    const anchor = new Element('download');
    anchor.click = () => { anchor.clicked = true; };
    anchors.push(anchor);
    return anchor;
  };
  doc.body = { appendChild(anchor) { anchor.appended = true; } };
  const calls = [];
  const engine = options.engine || {
    DEFAULT_FIELDS: ['password', 'api_key'],
    MAX_BYTES: 1048576,
    redact(input, policy) {
      calls.push({ input, policy });
      return { output: '[REDACTED OUTPUT]', stats: { emails: 2, fields: 1, inputBytes: Buffer.byteLength(input), outputBytes: 17 } };
    }
  };
  const clipboard = [];
  const blobs = [];
  const revoked = [];
  const timers = [];
  let networkCalls = 0;
  const context = {
    document: doc,
    PrivacyGuard: engine,
    PresidioReport: require('../dist/presidio-report.js'),
    TextEncoder,
    TextDecoder,
    Blob,
    navigator: options.navigator || { clipboard: { async writeText(text) { clipboard.push(text); } } },
    URL: {
      createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-local'; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    setTimeout(callback) { timers.push(callback); },
    fetch() { networkCalls += 1; throw new Error('Unexpected network access'); },
    XMLHttpRequest: function () { networkCalls += 1; throw new Error('Unexpected network access'); },
    localStorage: new Proxy({}, { get() { throw new Error('Unexpected storage access'); } }),
    sessionStorage: new Proxy({}, { get() { throw new Error('Unexpected storage access'); } })
  };
  vm.runInNewContext(script, context, { filename: 'app.js' });
  return { el, doc, calls, clipboard, blobs, anchors, timers, revoked, networkCalls: () => networkCalls };
}

async function ready(app) {
  app.el.source.value = '{"note":"synthetic@example.invalid"}';
  await app.el.source.dispatch('input');
  await app.el['redact-btn'].click();
}

async function reviewed(app) {
  await ready(app);
  app.el['review-check'].checked = true;
  await app.el['review-check'].dispatch('change');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function file(name, content, pending) {
  const bytes = new TextEncoder().encode(content);
  return { name, size: bytes.byteLength, async arrayBuffer() { return pending ? pending.promise : bytes.buffer; } };
}

async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

test('starts empty with review and export disabled; supports DOMContentLoaded', async () => {
  const app = setup({ loading: true });
  await app.doc.dispatch('DOMContentLoaded');
  assert.equal(app.el.source.value, '');
  assert.equal(app.el.output.value, '');
  assert.equal(app.el['review-check'].disabled, true);
  assert.equal(app.el['copy-btn'].disabled, true);
  assert.equal(app.el['download-btn'].disabled, true);
  assert.equal(app.el['mode-json'].attributes.get('aria-pressed'), 'true');
});

test('processing passes explicit rules; review gate controls copy/download', async () => {
  const app = setup();
  app.el['custom-fields'].value = ' citizen_id, ชื่อ , ,';
  await ready(app);
  assert.deepEqual(Array.from(app.calls[0].policy.sensitiveFields), ['password', 'api_key', 'citizen_id', 'ชื่อ']);
  assert.equal(app.el.output.value, '[REDACTED OUTPUT]');
  await app.el['copy-btn'].click();
  await app.el['download-btn'].click();
  assert.equal(app.clipboard.length, 0);
  assert.equal(app.blobs.length, 0);
  app.el['review-check'].checked = true;
  await app.el['review-check'].dispatch('change');
  await app.el['copy-btn'].click();
  await app.el['download-btn'].click();
  assert.deepEqual(app.clipboard, ['[REDACTED OUTPUT]']);
  assert.equal(await app.blobs[0].text(), '[REDACTED OUTPUT]');
  assert.equal(app.anchors[0].download, 'redacted.json');
  assert.equal(app.anchors[0].removed, true);
  app.timers.forEach(callback => callback());
  assert.deepEqual(app.revoked, ['blob:synthetic-local']);
  assert.equal(app.networkCalls(), 0);
});

test('all policy/source changes invalidate output and prior review', async t => {
  for (const [id, event] of [['source', 'input'], ['email-rule', 'change'], ['default-fields', 'change'], ['custom-fields', 'input']]) {
    await t.test(id, async () => {
      const app = setup();
      await reviewed(app);
      await app.el[id].dispatch(event);
      assert.equal(app.el.output.value, '');
      assert.equal(app.el['review-check'].checked, false);
      assert.equal(app.el['review-check'].disabled, true);
      assert.equal(app.el['copy-btn'].disabled, true);
      assert.equal(app.el['download-btn'].disabled, true);
    });
  }
});

test('switching modes invalidates result and text mode disables JSON field controls', async () => {
  const app = setup();
  await reviewed(app);
  await app.el['mode-text'].click();
  assert.equal(app.el.output.value, '');
  assert.equal(app.el['custom-fields'].disabled, true);
  assert.equal(app.el['default-fields'].disabled, true);
  assert.equal(app.el['mode-text'].attributes.get('aria-pressed'), 'true');
  await app.el['redact-btn'].click();
  assert.equal(app.calls.at(-1).policy.mode, 'text');
});

test('engine errors only display known sanitized messages, never original exception data', async () => {
  const sentinel = 'PRIVATE-SENTINEL-DO-NOT-ECHO';
  for (const code of ['INVALID_JSON', 'DUPLICATE_KEY', 'INPUT_TOO_LARGE', 'untrusted-code']) {
    const app = setup({ engine: { DEFAULT_FIELDS: [], MAX_BYTES: 1048576, redact() { throw Object.assign(new Error(sentinel), { code }); } } });
    app.el.source.value = sentinel;
    await app.el['redact-btn'].click();
    assert.equal(app.el['error-box'].hidden, false);
    assert.equal(app.el['error-box'].textContent.includes(sentinel), false);
    assert.equal(app.el.output.value, '');
    assert.equal(app.el['download-btn'].disabled, true);
  }
});

test('empty input reports an actionable error without invoking engine', async () => {
  const app = setup();
  await app.el['redact-btn'].click();
  assert.equal(app.calls.length, 0);
  assert.equal(app.el['error-box'].hidden, false);
});

test('file import selects mode, keeps filenames private, and requires explicit processing', async () => {
  const app = setup();
  app.el['file-input'].files = [file('PRIVATE-CUSTOMER.json', '{"a":1}')];
  await app.el['file-input'].dispatch('change');
  await flush();
  assert.equal(app.el.source.value, '{"a":1}');
  assert.equal(app.el['source-label'].textContent, 'ไฟล์ JSON ที่นำเข้า');
  assert.equal(app.el['source-label'].textContent.includes('PRIVATE'), false);
  assert.equal(app.calls.length, 0);
  assert.equal(app.el['file-input'].value, '');
  app.el['file-input'].files = [file('private.log', 'plain text')];
  await app.el['file-input'].dispatch('change');
  await flush();
  assert.equal(app.el['mode-text'].attributes.get('aria-pressed'), 'true');
});

test('file validation rejects large, unsupported, multiple, unreadable and invalid UTF-8 files', async () => {
  const variants = [
    [file('private.exe', 'content')],
    [{ name: 'private.json', size: 1048577, arrayBuffer() { throw new Error('Should not read oversized file'); } }],
    [file('a.txt', 'a'), file('b.txt', 'b')],
    [{ name: 'private.txt', size: 2, async arrayBuffer() { return Uint8Array.from([0xc3, 0x28]).buffer; } }],
    [{ name: 'private.txt', size: 2, async arrayBuffer() { throw new Error('PRIVATE PATH'); } }]
  ];
  for (const files of variants) {
    const app = setup();
    await reviewed(app);
    await app.el['drop-zone'].dispatch('drop', { dataTransfer: { files } });
    await flush();
    assert.equal(app.el['error-box'].hidden, false);
    assert.equal(app.el['error-box'].textContent.includes('private'), false);
    assert.equal(app.el['error-box'].textContent.includes('PRIVATE'), false);
    assert.equal(app.el.output.value, '');
    assert.equal(app.el['copy-btn'].disabled, true);
  }
});

test('clear and new input prevent late file reads from overwriting current source', async () => {
  for (const action of ['clear', 'edit']) {
    const app = setup();
    const pending = deferred();
    app.el['file-input'].files = [file('private.txt', 'old', pending)];
    await app.el['file-input'].dispatch('change');
    if (action === 'clear') await app.el['clear-btn'].click();
    else { app.el.source.value = 'new data'; await app.el.source.dispatch('input'); }
    pending.resolve(new TextEncoder().encode('stale data').buffer);
    await flush();
    assert.equal(app.el.source.value, action === 'clear' ? '' : 'new data');
  }
});

test('latest file wins when earlier reads finish later', async () => {
  const app = setup();
  const first = deferred();
  app.el['file-input'].files = [file('first.txt', 'old', first)];
  await app.el['file-input'].dispatch('change');
  app.el['file-input'].files = [file('second.txt', 'new')];
  await app.el['file-input'].dispatch('change');
  await flush();
  first.resolve(new TextEncoder().encode('old').buffer);
  await flush();
  assert.equal(app.el.source.value, 'new');
});

test('late clipboard completion does not replace status after clear', async () => {
  const pending = deferred();
  const app = setup({ navigator: { clipboard: { writeText() { return pending.promise; } } } });
  await reviewed(app);
  const copying = app.el['copy-btn'].click();
  await app.el['clear-btn'].click();
  const status = app.el.status.textContent;
  pending.resolve();
  await copying;
  assert.equal(app.el.status.textContent, status);
  assert.equal(app.el.source.value, '');
  assert.equal(app.el['download-btn'].disabled, true);
});

test('clipboard unavailable has a download fallback and no error payload', async () => {
  const app = setup({ navigator: {} });
  await reviewed(app);
  await app.el['copy-btn'].click();
  assert.match(app.el.status.textContent, /ดาวน์โหลด/);
  assert.equal(app.el['download-btn'].disabled, false);
});

test('hide source is visual only and clear removes both input and output', async () => {
  const app = setup();
  await reviewed(app);
  const input = app.el.source.value;
  app.el['hide-source'].checked = true;
  await app.el['hide-source'].dispatch('change');
  assert.equal(app.el.source.hidden, true);
  assert.equal(app.el.source.value, input);
  assert.equal(app.el['source-cover'].hidden, false);
  await app.el['clear-btn'].click();
  assert.equal(app.el.source.value, '');
  assert.equal(app.el.output.value, '');
  assert.equal(app.el.source.hidden, false);
  assert.equal(app.el['hide-source'].checked, false);
});

test('demo is synthetic, explicit, and preserves the large number source token', async () => {
  const app = setup();
  await app.el['demo-btn'].click();
  assert.match(app.el.source.value, /900719925474099312345/);
  assert.match(app.el.source.value, /example\.invalid/);
  assert.match(app.el.source.value, /SYNTHETIC/);
  assert.equal(app.el.output.value, '');
  assert.equal(app.calls.length, 0);
  assert.equal(app.el['mode-json'].attributes.get('aria-pressed'), 'true');
});

test('drops are intercepted globally and drag styling clears on drop', async () => {
  const app = setup();
  assert.equal((await app.doc.dispatch('dragover')).prevented, true);
  assert.equal((await app.doc.dispatch('drop')).prevented, true);
  await app.el['drop-zone'].dispatch('dragenter');
  assert.equal(app.el['drop-zone'].classes.has('is-dragging'), true);
  await app.el['drop-zone'].dispatch('drop', { dataTransfer: { files: [file('sample.txt', 'demo')] } });
  await flush();
  assert.equal(app.el['drop-zone'].classes.has('is-dragging'), false);
  assert.equal(app.el.source.value, 'demo');
});

test('disabling defaults replaces them with only custom fields', async () => {
  const app = setup();
  app.el['default-fields'].checked = false;
  app.el['custom-fields'].value = 'account_id';
  await ready(app);
  assert.deepEqual(Array.from(app.calls[0].policy.sensitiveFields), ['account_id']);
});

test('real engine demo flow masks selected fields/emails and exports exact large number', async () => {
  const engine = require('../dist/privacy-guard.js');
  const app = setup({ engine });
  await app.el['demo-btn'].click();
  await app.el['redact-btn'].click();
  assert.equal(app.el['error-box'].hidden, true);
  assert.equal(app.el['email-count'].textContent, '2');
  assert.equal(app.el['field-count'].textContent, '2');
  assert.match(app.el.output.value, /900719925474099312345/);
  assert.equal(app.el.output.value.includes('nina@example.invalid'), false);
  assert.equal(app.el.output.value.includes('SYNTHETIC-DEMO-KEY'), false);
  assert.equal(app.el.output.value.includes('บุคคลสมมติ ก'), false);
  app.el['review-check'].checked = true;
  await app.el['review-check'].dispatch('change');
  await app.el['download-btn'].click();
  assert.equal(await app.blobs[0].text(), app.el.output.value);
  assert.equal(app.networkCalls(), 0);
});

test('real engine malformed JSON clears an earlier reviewed result and reveals no content', async () => {
  const engine = require('../dist/privacy-guard.js');
  const app = setup({ engine });
  await reviewed(app);
  app.el.source.value = '{"secret":"PRIVATE-SENTINEL", "secret":"duplicate"}';
  await app.el.source.dispatch('input');
  await app.el['redact-btn'].click();
  assert.equal(app.el.output.value, '');
  assert.equal(app.el['copy-btn'].disabled, true);
  assert.match(app.el['error-box'].textContent, /คีย์ซ้ำ/);
  assert.equal(app.el['error-box'].textContent.includes('PRIVATE-SENTINEL'), false);
});

const presidioFixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../integrations/presidio/fixtures/redacted-report.json'),'utf8'));
test('Presidio import clears source, reviews redacted output and renders metadata only',async()=>{
 const app=setup();await reviewed(app);
 const r=presidioFixture();
 app.el['presidio-file'].files=[file('private-report.json',JSON.stringify(r))];
 await app.el['presidio-file'].dispatch('change');await flush();
 assert.equal(app.el.source.value,'');assert.equal(app.el.output.value,r.redactedText);
 assert.equal(app.el['review-check'].checked,false);assert.equal(app.el['copy-btn'].disabled,true);
 assert.equal(app.el['presidio-panel'].hidden,false);
 assert.equal(app.el['presidio-findings'].children.length,r.findings.length);
 assert(!app.el['presidio-summary'].textContent.includes(r.input_sha256));
 app.el['review-check'].checked=true;await app.el['review-check'].dispatch('change');
 await app.el['copy-btn'].click();assert.equal(app.clipboard.at(-1),r.redactedText);
 assert.equal(app.networkCalls(),0);
 await app.el['clear-btn'].click();assert.equal(app.el['presidio-panel'].hidden,true);assert.equal(app.el['presidio-findings'].children.length,0);
});
test('Presidio rejects extra raw fields without echo and clears prior export',async()=>{
 const app=setup();await reviewed(app);const r=presidioFixture();r.source='PRIVATE-SENTINEL';
 app.el['presidio-file'].files=[file('report.json',JSON.stringify(r))];
 await app.el['presidio-file'].dispatch('change');await flush();
 assert.equal(app.el.output.value,'');assert.equal(app.el['copy-btn'].disabled,true);assert.equal(app.el.source.value,'');
 assert(!app.el['error-box'].textContent.includes('PRIVATE-SENTINEL'));
});
test('late Presidio reads cannot restore cleared state',async()=>{
 const app=setup();const pending=deferred();const r=JSON.stringify(presidioFixture());
 app.el['presidio-file'].files=[file('report.json',r,pending)];await app.el['presidio-file'].dispatch('change');
 await app.el['clear-btn'].click();pending.resolve(new TextEncoder().encode(r).buffer);await flush();
 assert.equal(app.el.output.value,'');assert.equal(app.el['presidio-panel'].hidden,true);
});
test('Presidio import rejects oversized and malformed UTF-8 bytes',async()=>{
 const app=setup();
 for(const f of [{name:'r.json',size:300000,arrayBuffer(){throw new Error();}}, {name:'r.json',size:1,async arrayBuffer(){return new Uint8Array([255]).buffer;}}]){
  app.el['presidio-file'].files=[f];await app.el['presidio-file'].dispatch('change');await flush();
  assert.equal(app.el['error-box'].hidden,false);assert.equal(app.el['copy-btn'].disabled,true);
 }
});
