'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=require('../dist/presidio-report.js');
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../integrations/presidio/fixtures/redacted-report.json'),'utf8'));
test('real Presidio report imports with no source hash or policy terms retained',()=>{
 const r=fixture();const out=api.parse(JSON.stringify(r));assert.equal(out.output,r.redactedText);assert.equal(out.findings.length,r.summary.detections);
 assert.equal(out.input_sha256,undefined);assert.equal(out.policy,undefined);
});
test('strict schema rejects every unexpected raw-data field',()=>{
 for(const change of [r=>r.source='PRIVATE',r=>r.findings[0].text='PRIVATE',r=>r.policy.custom_terms=['PRIVATE'],r=>r.schema_version=1,r=>r.engine='unverified engine']){
  const r=fixture();change(r);assert.throws(()=>api.parse(JSON.stringify(r)),/^Error: INVALID_PRESIDIO_REPORT$/);
 }
});
test('invalid metadata and inconsistent counts rejected',()=>{
 for(const change of [r=>r.input_chars=-1,r=>r.findings[0].end=r.input_chars+1,r=>r.findings[0].score=2,r=>r.summary.detections++,r=>r.policy.entities=[],r=>r.policy.custom_terms_count=1,r=>r.policy.minimum_score=0.1]){
  const r=fixture();change(r);assert.throws(()=>api.parse(JSON.stringify(r)),/INVALID_PRESIDIO_REPORT/);
 }
});
test('duplicate escaped keys and oversized reports rejected',()=>{
 const raw=JSON.stringify(fixture());assert.throws(()=>api.parse(raw.replace('"schema_version":2','"schema_version":2,"schema_versi\\u006fn":2')),/INVALID_PRESIDIO_REPORT/);
 assert.throws(()=>api.parse(' '.repeat(api.MAX_BYTES+1)),/INVALID_PRESIDIO_REPORT/);
});
test('HTML-like output stays literal text for a safe DOM sink',()=>{
 const r=fixture();r.redactedText='<img src=x onerror=alert(1)>';assert.equal(api.parse(JSON.stringify(r)).output,r.redactedText);
});

test('new numeric scope imports while legacy schema-2 reports stay accepted',()=>{
 const r=fixture();
 r.summary.scope='Thai/ASCII mobile and checksum-valid ID with bounded separators / ASCII email / optional exact literals';
 const out=api.parse(JSON.stringify(r));assert.equal(out.findings.length,r.findings.length);
 r.summary.scope='arbitrary unsupported detector';assert.throws(()=>api.parse(JSON.stringify(r)),/INVALID_PRESIDIO_REPORT/);
});
