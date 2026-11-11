'use strict';
// Static release checks complement runtime tests; this is not a security proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('dist/index.html');
const scripts = ['privacy-guard.js', 'app.js'];
for (const name of scripts) {
  const content = read('dist/' + name);
  new vm.Script(content, { filename: name });
  assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|serviceWorker)\s*(?:\(|\.|\[)/.test(content), name + ': unexpected network or persistence API');
  assert(!/\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/.test(content), name + ': unsafe HTML or dynamic evaluation');
  assert(html.includes('src="' + name + '"'), name + ': missing script');
}
assert(html.includes("connect-src 'none'"), 'Missing network-blocking CSP');
assert(html.includes("form-action 'none'"), 'Missing form-blocking CSP');
assert(html.includes('name="referrer" content="no-referrer"'), 'Missing referrer policy');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  assert(!match[2].trim(), 'Unexpected inline script');
  assert(/\bsrc="[a-z-]+\.js"/.test(match[1]), 'Unexpected script source');
}
assert(!/\son\w+\s*=/i.test(html), 'Unexpected inline handler');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate element ID');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const value = match[1];
  if (value.startsWith('#')) continue;
  if (value.startsWith('https://github.com/Sandworm-Lazarus/')) continue;
  assert(!/[:?#]/.test(value), 'Unexpected remote or dynamic asset');
  assert(fs.existsSync(path.join(root, 'dist', value)), 'Missing local asset');
}
assert(!/@import|url\(\s*['"]?https?:/i.test(read('dist/styles.css')), 'Unexpected external CSS asset');
for (const name of ['README.md', 'README.th.md', 'LICENSE', 'SECURITY.md', 'docs/THREAT_MODEL.md']) assert(read(name).trim(), 'Missing documentation');
assert(!Object.keys(JSON.parse(read('package.json')).dependencies || {}).length, 'Unexpected runtime dependency');
console.log('Static checks passed: script syntax, local assets, DOM IDs, privacy API policy, CSP and documentation.');
