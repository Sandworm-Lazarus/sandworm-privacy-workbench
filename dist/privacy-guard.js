/*
 * Sandworm Privacy Workbench — original browser redaction engine.
 * Copyright (c) 2026 Sandworm-Lazarus. MIT licensed.
 * Inspired by this project's Python Privacy Guard; not a byte-equivalent port.
 * No network, storage, dynamic code evaluation, or third-party dependencies.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrivacyGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_BYTES = 1024 * 1024;
  const MAX_DEPTH = 32;
  const MAX_NODES = 50000;
  const EMAIL_MASK = '[EMAIL_REDACTED]';
  const FIELD_MASK = '[FIELD_REDACTED]';
  const DEFAULT_FIELDS = Object.freeze([
    'customer_name', 'password', 'api_key', 'access_token',
    'refresh_token', 'secret', 'authorization',
  ]);
  const MESSAGES = Object.freeze({
    INVALID_INPUT: 'Input must be text.',
    INVALID_OPTIONS: 'The redaction settings are invalid.',
    INPUT_TOO_LARGE: 'Input exceeds the 1 MiB limit.',
    OUTPUT_TOO_LARGE: 'Output exceeds the 1 MiB limit.',
    INVALID_UNICODE: 'Text contains an unsupported Unicode sequence.',
    INVALID_JSON: 'Input is not a valid JSON document.',
    DUPLICATE_KEY: 'JSON contains a duplicate object key.',
    MAX_DEPTH: 'JSON exceeds the supported nesting depth.',
    MAX_NODES: 'JSON exceeds the supported number of values.',
  });

  class PrivacyError extends Error {
    constructor(code) {
      const safeCode = Object.prototype.hasOwnProperty.call(MESSAGES, code)
        ? code : 'INVALID_INPUT';
      super(MESSAGES[safeCode]);
      this.name = 'PrivacyError';
      this.code = safeCode;
    }
  }
  function fail(code) { throw new PrivacyError(code); }

  // Count actual UTF-8 bytes and reject lone UTF-16 surrogates. TextEncoder
  // silently replaces them, which would lose original data without a warning.
  function utf8Bytes(text, overflowCode) {
    if (text.length > MAX_BYTES && overflowCode) fail(overflowCode);
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_UNICODE');
        bytes += 4;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) fail('INVALID_UNICODE');
      else bytes += 3;
      if (overflowCode && bytes > MAX_BYTES) fail(overflowCode);
    }
    return bytes;
  }

  // ASCII letters fold; all other characters match exactly. There is no
  // Unicode normalization, substring matching, or whitespace trimming.
  function foldField(text) {
    return text.replace(/[A-Z]/g, letter => letter.toLowerCase());
  }

  function optionsFor(options) {
    if (options === undefined) options = {};
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      fail('INVALID_OPTIONS');
    }
    const allowed = new Set(['mode', 'maskEmails', 'sensitiveFields']);
    if (Object.keys(options).some(key => !allowed.has(key))) fail('INVALID_OPTIONS');
    const mode = options.mode === undefined ? 'text' : options.mode;
    const maskEmails = options.maskEmails === undefined ? true : options.maskEmails;
    const names = options.sensitiveFields === undefined ? DEFAULT_FIELDS : options.sensitiveFields;
    if ((mode !== 'text' && mode !== 'json') || typeof maskEmails !== 'boolean'
      || !Array.isArray(names) || names.length > 128) fail('INVALID_OPTIONS');
    const fields = new Set();
    for (const name of names) {
      if (typeof name !== 'string' || !name.length || name.length > 128) fail('INVALID_OPTIONS');
      utf8Bytes(name);
      fields.add(foldField(name));
    }
    return { mode, maskEmails, fields };
  }

  // Deliberately limited conventional ASCII mailbox pattern, not RFC mailbox
  // parsing or general PII recognition. JSON keys are never email-masked.
  const LOCAL = "A-Za-z0-9.!#$%&'*+/=?^_`{|}~\\-";
  const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
  const EMAIL_SOURCE = '(?<![' + LOCAL + '@])[' + LOCAL + ']{1,64}@'
    + LABEL + '(?:\\.' + LABEL + ')+(?![A-Za-z0-9_\\-])';
  function maskEmailValues(text, stats) {
    return text.replace(new RegExp(EMAIL_SOURCE, 'g'), () => {
      stats.emails += 1;
      return EMAIL_MASK;
    });
  }

  // A bounded strict JSON parser stores number lexemes and object entry lists.
  // Native JSON.parse would silently round large IDs and discard duplicate keys.
  class JsonParser {
    constructor(text) {
      this.text = text;
      this.pos = 0;
      this.nodes = 0;
      this.number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    }
    whitespace() {
      while (this.pos < this.text.length && /[\x20\t\r\n]/.test(this.text[this.pos])) this.pos += 1;
    }
    string() {
      if (this.text[this.pos] !== '"') fail('INVALID_JSON');
      this.pos += 1;
      let start = this.pos;
      const parts = [];
      while (this.pos < this.text.length) {
        const char = this.text[this.pos];
        if (char === '"') {
          parts.push(this.text.slice(start, this.pos));
          this.pos += 1;
          const value = parts.join('');
          utf8Bytes(value);
          return value;
        }
        if (char.charCodeAt(0) < 0x20) fail('INVALID_JSON');
        if (char !== '\\') { this.pos += 1; continue; }
        parts.push(this.text.slice(start, this.pos));
        this.pos += 1;
        const escape = this.text[this.pos];
        this.pos += 1;
        if (escape === 'u') {
          const hex = this.text.slice(this.pos, this.pos + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('INVALID_JSON');
          parts.push(String.fromCharCode(parseInt(hex, 16)));
          this.pos += 4;
        } else {
          const escapes = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (!Object.prototype.hasOwnProperty.call(escapes, escape)) fail('INVALID_JSON');
          parts.push(escapes[escape]);
        }
        start = this.pos;
      }
      fail('INVALID_JSON');
    }
    value(depth) {
      if (depth > MAX_DEPTH) fail('MAX_DEPTH');
      this.nodes += 1;
      if (this.nodes > MAX_NODES) fail('MAX_NODES');
      this.whitespace();
      const char = this.text[this.pos];
      if (char === '"') return { kind: 'string', value: this.string() };
      if (char === '{') {
        this.pos += 1;
        this.whitespace();
        const entries = [];
        const seen = new Set();
        if (this.text[this.pos] === '}') { this.pos += 1; return { kind: 'object', entries }; }
        while (true) {
          this.whitespace();
          const key = this.string();
          if (seen.has(key)) fail('DUPLICATE_KEY');
          seen.add(key);
          this.whitespace();
          if (this.text[this.pos] !== ':') fail('INVALID_JSON');
          this.pos += 1;
          entries.push([key, this.value(depth + 1)]);
          this.whitespace();
          if (this.text[this.pos] === '}') { this.pos += 1; return { kind: 'object', entries }; }
          if (this.text[this.pos] !== ',') fail('INVALID_JSON');
          this.pos += 1;
        }
      }
      if (char === '[') {
        this.pos += 1;
        this.whitespace();
        const values = [];
        if (this.text[this.pos] === ']') { this.pos += 1; return { kind: 'array', values }; }
        while (true) {
          values.push(this.value(depth + 1));
          this.whitespace();
          if (this.text[this.pos] === ']') { this.pos += 1; return { kind: 'array', values }; }
          if (this.text[this.pos] !== ',') fail('INVALID_JSON');
          this.pos += 1;
        }
      }
      for (const literal of ['true', 'false', 'null']) {
        if (this.text.startsWith(literal, this.pos)) {
          this.pos += literal.length;
          return { kind: 'literal', raw: literal };
        }
      }
      this.number.lastIndex = this.pos;
      const match = this.number.exec(this.text);
      if (!match) fail('INVALID_JSON');
      this.pos = this.number.lastIndex;
      return { kind: 'number', raw: match[0] };
    }
    parse() {
      const result = this.value(0);
      this.whitespace();
      if (this.pos !== this.text.length) fail('INVALID_JSON');
      return result;
    }
  }

  function serialize(root, policy, stats) {
    const chunks = [];
    let bytes = 0;
    function write(text) {
      bytes += utf8Bytes(text);
      if (bytes > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
      chunks.push(text);
    }
    function walk(node, depth) {
      if (node.kind === 'string') {
        write(JSON.stringify(policy.maskEmails ? maskEmailValues(node.value, stats) : node.value));
      } else if (node.kind === 'number' || node.kind === 'literal') write(node.raw);
      else {
        const object = node.kind === 'object';
        const items = object ? node.entries : node.values;
        write(object ? '{' : '[');
        if (items.length) {
          write('\n');
          items.forEach((item, index) => {
            write('  '.repeat(depth + 1));
            if (object) {
              const [key, value] = item;
              write(JSON.stringify(key) + ': ');
              if (policy.fields.has(foldField(key))) {
                if (!(value.kind === 'string' && value.value === FIELD_MASK)) stats.fields += 1;
                write(JSON.stringify(FIELD_MASK));
              } else walk(value, depth + 1);
            } else walk(item, depth + 1);
            write(index === items.length - 1 ? '\n' : ',\n');
          });
          write('  '.repeat(depth));
        }
        write(object ? '}' : ']');
      }
    }
    walk(root, 0);
    stats.outputBytes = bytes;
    return chunks.join('');
  }

  /**
   * Redact a string with a fixed 1 MiB UTF-8 input/output budget.
   * sensitiveFields REPLACES the defaults; [] disables field redaction.
   * JSON matching is ASCII case-insensitive with exact other characters.
   * JSON numbers retain their original lexeme, including very large exponents.
   * Counters count new replacements only; emails inside masked fields are not
   * counted separately. This is preprocessing, not complete PII detection.
   */
  function redact(input, options) {
    try {
      if (typeof input !== 'string') fail('INVALID_INPUT');
      const inputBytes = utf8Bytes(input, 'INPUT_TOO_LARGE');
      const policy = optionsFor(options);
      const stats = { emails: 0, fields: 0, inputBytes, outputBytes: 0 };
      let output;
      if (policy.mode === 'json') {
        const tree = new JsonParser(input).parse();
        output = serialize(tree, policy, stats);
      } else {
        output = policy.maskEmails ? maskEmailValues(input, stats) : input;
        stats.outputBytes = utf8Bytes(output, 'OUTPUT_TOO_LARGE');
      }
      return { output, stats };
    } catch (error) {
      if (error instanceof PrivacyError) throw error;
      // Never propagate engine, custom-object, or accessor errors containing
      // original content. No cause, raw input, field path, or parser excerpt.
      throw new PrivacyError('INVALID_INPUT');
    }
  }

  return Object.freeze({
    redact, PrivacyError, DEFAULT_FIELDS, MAX_BYTES, MAX_DEPTH, MAX_NODES,
    EMAIL_MASK, FIELD_MASK,
  });
});
