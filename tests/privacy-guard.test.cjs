'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const guard = require('../dist/privacy-guard.js');
const { redact, PrivacyError, MAX_BYTES, MAX_DEPTH, MAX_NODES, DEFAULT_FIELDS } = guard;
const json = (value, options = {}) => redact(value, { mode: 'json', ...options });
function rejectsCode(fn, code) {
  assert.throws(fn, error => error instanceof PrivacyError && error.code === code);
}

test('exports a frozen dependency-free browser API and works without CommonJS', () => {
  const source = fs.readFileSync(path.join(__dirname, '../dist/privacy-guard.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(context.PrivacyGuard.redact('a@example.invalid').output, '[EMAIL_REDACTED]');
  assert.equal(Object.isFrozen(guard), true);
  assert.equal(Object.isFrozen(DEFAULT_FIELDS), true);
});

test('masks conventional emails in Thai and English while preserving other text', () => {
  const result = redact('ส่งถึง nina@example.invalid\nTo: <dev.one@example.invalid>, cc: DEV_TWO@demo.example.invalid.');
  assert.equal(result.output, 'ส่งถึง [EMAIL_REDACTED]\nTo: <[EMAIL_REDACTED]>, cc: [EMAIL_REDACTED].');
  assert.equal(result.stats.emails, 3);
  assert.equal(result.stats.fields, 0);
  assert.equal(result.stats.inputBytes, Buffer.byteLength('ส่งถึง nina@example.invalid\nTo: <dev.one@example.invalid>, cc: DEV_TWO@demo.example.invalid.'));
  assert.equal(result.stats.outputBytes, Buffer.byteLength(result.output));
});

test('preserves benign text, names, version numbers, and empty text', () => {
  for (const input of ['', 'บุคคลสมมติ ก', 'Python 3.12 / Node 24', 'not-an-email', 'user@localhost']) {
    assert.equal(redact(input).output, input);
  }
});

test('email masks are idempotent with zero new replacements on the second pass', () => {
  const first = redact('x@example.invalid y@example.invalid');
  const second = redact(first.output);
  assert.equal(first.output, second.output);
  assert.equal(second.stats.emails, 0);
});

test('email option can be disabled without affecting text or JSON field masking', () => {
  assert.equal(redact('x@example.invalid', { maskEmails: false }).output, 'x@example.invalid');
  const value = json('{"email":"x@example.invalid","password":"demo"}', { maskEmails: false });
  assert.deepEqual(JSON.parse(value.output), { email: 'x@example.invalid', password: '[FIELD_REDACTED]' });
  assert.equal(value.stats.emails, 0);
  assert.equal(value.stats.fields, 1);
});

test('matches supported ASCII local-part punctuation and does not match an overlong local part', () => {
  assert.equal(redact("a+b.c_9@example.invalid").output, '[EMAIL_REDACTED]');
  const max = 'a'.repeat(64) + '@example.invalid';
  const tooLong = 'a'.repeat(65) + '@example.invalid';
  assert.equal(redact(max).output, '[EMAIL_REDACTED]');
  assert.equal(redact(tooLong).output, tooLong);
});

test('preserves email-looking strings outside the documented ASCII pattern', () => {
  for (const value of ['a@@example.invalid', 'a@-example.invalid', 'a@example_.invalid', 'a@localhost']) {
    assert.equal(redact(value).output, value);
  }
});

test('masks default fields recursively and preserves all JSON scalar types', () => {
  const input = '{"count":3,"enabled":true,"nil":null,"items":[{"PASSWORD":{"nested":"a@example.invalid"}},"b@example.invalid"]}';
  const result = json(input);
  assert.deepEqual(JSON.parse(result.output), {
    count: 3, enabled: true, nil: null,
    items: [{ PASSWORD: '[FIELD_REDACTED]' }, '[EMAIL_REDACTED]'],
  });
  assert.equal(result.stats.fields, 1);
  assert.equal(result.stats.emails, 1, 'emails hidden inside a whole-field replacement are not double-counted');
});

test('replaces selected null, boolean, numeric, string, array, and object values', () => {
  for (const value of ['null', 'true', '123', '"demo"', '[]', '{}']) {
    assert.equal(json('{"secret":' + value + '}').stats.fields, 1);
    assert.equal(JSON.parse(json('{"secret":' + value + '}').output).secret, '[FIELD_REDACTED]');
  }
});

test('field masks are idempotent and count only new replacements', () => {
  const first = json('{"password":"demo","nested":{"secret":"demo"}}');
  const second = json(first.output);
  assert.equal(first.output, second.output);
  assert.equal(first.stats.fields, 2);
  assert.deepEqual({ emails: second.stats.emails, fields: second.stats.fields }, { emails: 0, fields: 0 });
});

test('custom sensitiveFields replace defaults and an empty list disables field masking', () => {
  const source = '{"password":"demo","Citizen_ID":"synthetic"}';
  assert.deepEqual(JSON.parse(json(source, { sensitiveFields: ['citizen_id'] }).output), {
    password: 'demo', Citizen_ID: '[FIELD_REDACTED]',
  });
  assert.deepEqual(JSON.parse(json(source, { sensitiveFields: [] }).output), {
    password: 'demo', Citizen_ID: 'synthetic',
  });
});

test('ASCII field folding is exact, does not trim, normalize Unicode, or use substrings', () => {
  const source = '{"PASSWORD":"a","password_hint":"b"," password":"c","Straße":"d","STRASSE":"e","รหัส":"f","é":"g","é":"h"}';
  const result = JSON.parse(json(source, { sensitiveFields: ['password', 'Straße', 'รหัส', 'é'] }).output);
  assert.deepEqual(result, {
    PASSWORD: '[FIELD_REDACTED]', password_hint: 'b', ' password': 'c',
    Straße: '[FIELD_REDACTED]', STRASSE: 'e', รหัส: '[FIELD_REDACTED]',
    é: '[FIELD_REDACTED]', 'é': 'h',
  });
});

test('preserves object key text, including email-looking metadata', () => {
  const result = json('{"contact@example.invalid":"x@example.invalid"}');
  assert.equal(result.output, '{\n  "contact@example.invalid": "[EMAIL_REDACTED]"\n}');
  assert.equal(result.stats.emails, 1);
});

test('object order and number spellings are preserved without rounding', () => {
  const source = '{"z":9007199254740993123456789,"2":-0,"1":1.2300e+009,"huge":1e999,"small":-1e-999}';
  assert.equal(json(source).output, '{\n  "z": 9007199254740993123456789,\n  "2": -0,\n  "1": 1.2300e+009,\n  "huge": 1e999,\n  "small": -1e-999\n}');
});

test('valid huge number lexemes are bounded by bytes rather than JavaScript numeric limits', () => {
  const number = '9'.repeat(5000);
  assert.equal(json(number).output, number);
});

test('supports JSON root scalars and empty containers', () => {
  for (const value of ['null', 'true', 'false', '123', '-0', '[]', '{}']) assert.equal(json(value).output, value);
  assert.equal(json('"a@example.invalid"').output, '"[EMAIL_REDACTED]"');
});

test('escaped strings and surrogate pairs round-trip without changing values', () => {
  const source = '{"text":"line\\nnext\\t\\b\\f\\r\\/\\\\\\\"","emoji":"\\uD83D\\uDE00","raw":"😀"}';
  assert.deepEqual(JSON.parse(json(source).output), JSON.parse(source));
});

test('XSS-like input is preserved as data; rendering is the caller responsibility', () => {
  const source = '<img src=x onerror=alert(1)><script>bad()</script>';
  assert.equal(redact(source).output, source);
  assert.equal(JSON.parse(json(JSON.stringify(source)).output), source);
});

test('prototype-related object names remain ordinary JSON entries', () => {
  const result = json('{"__proto__":{"polluted":true},"constructor":"safe","prototype":"safe"}', { sensitiveFields: ['__proto__'] });
  assert.equal(result.output, '{\n  "__proto__": "[FIELD_REDACTED]",\n  "constructor": "safe",\n  "prototype": "safe"\n}');
  assert.equal({}.polluted, undefined);
});

test('rejects duplicate decoded keys, including sensitive keys and escaped aliases', () => {
  for (const source of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"password":"x","password":"y"}', '{"a":{"b":1,"b":2}}']) {
    rejectsCode(() => json(source), 'DUPLICATE_KEY');
  }
  assert.deepEqual(JSON.parse(json('{"a":1,"A":2}').output), { a: 1, A: 2 });
});

test('validates the complete sensitive subtree before redaction', () => {
  rejectsCode(() => json('{"secret":{"x":1,"x":2}}'), 'DUPLICATE_KEY');
  rejectsCode(() => json('{"secret":"\\ud800"}'), 'INVALID_UNICODE');
  rejectsCode(() => json('{"secret":NaN}'), 'INVALID_JSON');
  rejectsCode(() => json('{"secret":' + '['.repeat(33) + '0' + ']'.repeat(33) + '}'), 'MAX_DEPTH');
});

test('rejects malformed JSON, forbidden whitespace, extra values, and non-JSON constants', () => {
  const invalid = ['', ' ', 'undefined', 'NaN', 'Infinity', '-Infinity', '+1', '01', '-01', '1.', '.1', '1e', '1e+', '--1', 'truefalse', 'null null', '[]x', '[1,]', '{"a":1,}', '{a:1}', '{"a" 1}', '{"a":}', '"unterminated', '"bad\\x"', '"bad\\u12xz"', '"raw\nline"', '\u00a0null', '\ufeff{}', '{"a": /* comment */ 1}'];
  for (const source of invalid) rejectsCode(() => json(source), 'INVALID_JSON');
});

test('accepts all legal JSON surrounding whitespace', () => {
  assert.equal(json(' \t\r\n {"a": 1} \r\n\t ').output, '{\n  "a": 1\n}');
});

test('rejects lone UTF-16 surrogates in input, decoded JSON values, and keys', () => {
  for (const source of ['\ud800', '\udfff', 'ok\ud800x']) rejectsCode(() => redact(source), 'INVALID_UNICODE');
  for (const source of ['"\\ud800"', '"\\udfff"', '"\\ud800x"', '{"\\ud800":1}', '"\\ud800\\ud800\\udc00"']) {
    rejectsCode(() => json(source), 'INVALID_UNICODE');
  }
});

test('accepts exactly 1 MiB ASCII text and rejects one byte more', () => {
  assert.equal(redact('x'.repeat(MAX_BYTES)).stats.outputBytes, MAX_BYTES);
  rejectsCode(() => redact('x'.repeat(MAX_BYTES + 1)), 'INPUT_TOO_LARGE');
});

test('uses UTF-8 bytes rather than UTF-16 length for the input budget', () => {
  const input = 'ก'.repeat(Math.floor(MAX_BYTES / 3));
  assert.equal(redact(input).stats.inputBytes, Buffer.byteLength(input));
  rejectsCode(() => redact(input + 'ก'), 'INPUT_TOO_LARGE');
  const emoji = '😀'.repeat(MAX_BYTES / 4);
  assert.equal(redact(emoji).stats.inputBytes, MAX_BYTES);
  rejectsCode(() => redact(emoji + 'x'), 'INPUT_TOO_LARGE');
});

test('rejects text output expansion beyond the byte budget', () => {
  const input = 'x'.repeat(MAX_BYTES - 7) + ' a@b.co';
  assert.equal(Buffer.byteLength(input), MAX_BYTES);
  rejectsCode(() => redact(input), 'OUTPUT_TOO_LARGE');
});

test('rejects JSON pretty-print expansion beyond the byte budget', () => {
  const source = '{"a":"' + 'x'.repeat(MAX_BYTES - 8) + '"}';
  assert.equal(Buffer.byteLength(source), MAX_BYTES);
  rejectsCode(() => json(source), 'OUTPUT_TOO_LARGE');
});

test('output byte stats include JSON formatting and decoded Unicode correctly', () => {
  const result = json('{"ไทย":"😀","password":"demo"}');
  assert.equal(result.stats.inputBytes, Buffer.byteLength('{"ไทย":"😀","password":"demo"}'));
  assert.equal(result.stats.outputBytes, Buffer.byteLength(result.output));
});

test('depth boundary includes root at zero and validates empty containers', () => {
  const boundary = '['.repeat(MAX_DEPTH) + '0' + ']'.repeat(MAX_DEPTH);
  assert.equal(JSON.parse(json(boundary).output).length, 1);
  rejectsCode(() => json('[' + boundary + ']'), 'MAX_DEPTH');
  assert.doesNotThrow(() => json('['.repeat(MAX_DEPTH + 1) + ']'.repeat(MAX_DEPTH + 1)));
  rejectsCode(() => json('['.repeat(MAX_DEPTH + 2) + ']'.repeat(MAX_DEPTH + 2)), 'MAX_DEPTH');
});

test('node boundary counts containers and values, including hidden subtree values', () => {
  const atLimit = '[' + Array(MAX_NODES - 1).fill('0').join(',') + ']';
  assert.doesNotThrow(() => json(atLimit));
  const aboveLimit = '[' + Array(MAX_NODES).fill('0').join(',') + ']';
  rejectsCode(() => json(aboveLimit), 'MAX_NODES');
  rejectsCode(() => json('{"secret":' + atLimit + '}'), 'MAX_NODES');
});

test('options are strict and custom fields have bounded length and count', () => {
  const invalid = [null, true, [], 'json', { mode: 'auto' }, { maskEmails: 1 }, { other: true }, { sensitiveFields: 'password' }, { sensitiveFields: [''] }, { sensitiveFields: [3] }, { sensitiveFields: ['a'.repeat(129)] }, { sensitiveFields: Array(129).fill('a') }];
  for (const options of invalid) rejectsCode(() => redact('', options), 'INVALID_OPTIONS');
  assert.doesNotThrow(() => redact('', { sensitiveFields: ['a'.repeat(128)] }));
  assert.doesNotThrow(() => redact('', { sensitiveFields: Array(128).fill('a') }));
  rejectsCode(() => redact('', { sensitiveFields: ['\ud800'] }), 'INVALID_UNICODE');
});

test('input must be a string, without coercing arbitrary objects', () => {
  for (const input of [null, undefined, 3, {}, [], new String('text')]) {
    rejectsCode(() => redact(input), 'INVALID_INPUT');
  }
});

test('all reported errors are stable and do not echo input, keys, or original causes', () => {
  const secret = 'SENSITIVE_SENTINEL_93891';
  const attempts = [
    () => json('{"' + secret + '":1,"' + secret + '":2}'),
    () => json('{"password":"' + secret + '"} trailing'),
    () => redact(secret, { mode: secret }),
    () => redact(secret, { get mode() { throw new Error(secret); } }),
  ];
  for (const attempt of attempts) {
    let caught;
    try { attempt(); } catch (error) { caught = error; }
    assert.ok(caught instanceof PrivacyError);
    assert.equal(caught.message.includes(secret), false);
    assert.equal(String(caught.stack).includes(secret), false);
    assert.equal('cause' in caught, false);
    assert.equal(JSON.stringify(caught).includes(secret), false);
  }
});

test('different calls do not share counters or regex state', () => {
  for (let i = 0; i < 5; i += 1) {
    assert.equal(redact('x@example.invalid').stats.emails, 1);
    assert.equal(redact('plain').stats.emails, 0);
    assert.equal(json('{"secret":"demo"}').stats.fields, 1);
  }
});

test('deterministic generated valid JSON corpus preserves non-redacted semantic values', () => {
  let seed = 48271;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed; };
  function generate(depth) {
    const choice = random() % (depth ? 7 : 5);
    if (choice === 0) return null;
    if (choice === 1) return Boolean(random() % 2);
    if (choice === 2) return random() - 1000000;
    if (choice === 3) return 'ไทย 😀 " \\ \n ' + random();
    if (choice === 4) return random() / 3;
    if (choice === 5) return Array.from({ length: random() % 4 }, () => generate(depth - 1));
    return Object.fromEntries(Array.from({ length: random() % 4 }, (_, i) => ['key_' + i, generate(depth - 1)]));
  }
  for (let i = 0; i < 300; i += 1) {
    const value = generate(4);
    const result = json(JSON.stringify(value), { maskEmails: false, sensitiveFields: [] });
    assert.deepEqual(JSON.parse(result.output), value);
    assert.equal(result.stats.outputBytes, Buffer.byteLength(result.output));
    assert.equal(json(result.output, { maskEmails: false, sensitiveFields: [] }).output, result.output);
  }
});

test('mutated JSON corpus never accepts syntax rejected by the native parser', () => {
  const bases = ['{"a":[1,true,null,"😀"],"b":"x"}', '[0,-0,1e999,1.2e+4]', '"escape\\nline"'];
  for (const source of bases) {
    for (let i = 0; i <= source.length; i += 1) {
      for (const character of ['x', ',', ':', '{', '}', '[', ']', '"', '\\', '0', ' ', '\u0000']) {
        const changed = source.slice(0, i) + character + source.slice(i);
        let nativeValid = true;
        try { JSON.parse(changed); } catch { nativeValid = false; }
        let engineValid = true;
        try { json(changed); } catch { engineValid = false; }
        // Native JSON.parse accepts lone UTF-16 surrogates; our engine rejects
        // these deliberately, so only acceptance of invalid syntax is a defect.
        assert.ok(!(engineValid && !nativeValid));
      }
    }
  }
});
