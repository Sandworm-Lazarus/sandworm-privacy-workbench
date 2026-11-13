/* Sandworm Presidio report boundary. No source data or policy terms are accepted. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./privacy-guard.js'));
  else root.PresidioReport=factory(root.PrivacyGuard);
})(typeof globalThis!=='undefined'?globalThis:this,function(guard){
  'use strict';
  const MAX_BYTES=262144;
  const ENTITIES=['THAI_ID','THAI_MOBILE','EMAIL_ADDRESS','CUSTOM_TERM'];
  function fail(){throw new Error('INVALID_PRESIDIO_REPORT');}
  function exact(value,keys){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))) fail();
  }
  function parse(text){
    try{
      if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES) fail();
      const clean=guard.redact(text,{mode:'json',maskEmails:false,sensitiveFields:[]}).output;
      const r=JSON.parse(clean);
      exact(r,['schema_version','project','mode','engine','input_sha256','input_chars','redactedText','policy','summary','findings']);
      if(r.schema_version!==2||r.project!=='sandworm-privacy-workbench'||r.mode!=='live'||r.engine!=='presidio-2.2.366-pattern-only'||typeof r.input_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.input_sha256)) fail();
      if(!Number.isSafeInteger(r.input_chars)||r.input_chars<0||r.input_chars>65536||typeof r.redactedText!=='string'||new TextEncoder().encode(r.redactedText).byteLength>75536) fail();
      exact(r.policy,['entities','minimum_score','custom_terms_count']);
      const p=r.policy;
      if(!Array.isArray(p.entities)||!p.entities.length||p.entities.length>4||new Set(p.entities).size!==p.entities.length||p.entities.some(x=>!ENTITIES.includes(x))||typeof p.minimum_score!=='number'||!Number.isFinite(p.minimum_score)||p.minimum_score<0.5||p.minimum_score>1||!Number.isSafeInteger(p.custom_terms_count)||p.custom_terms_count<0||p.custom_terms_count>64||p.entities.includes('CUSTOM_TERM')!==(p.custom_terms_count>0)) fail();
      exact(r.summary,['detections','scope']);
      if(!Array.isArray(r.findings)||r.findings.length>1000||r.summary.detections!==r.findings.length||!['Thai ASCII mobile / checksum-valid ID / ASCII email / optional exact literals','Thai/ASCII mobile and checksum-valid ID with bounded separators / ASCII email / optional exact literals'].includes(r.summary.scope)) fail();
      const findings=r.findings.map(f=>{
        exact(f,['entity','start','end','score']);
        if(!p.entities.includes(f.entity)||!Number.isSafeInteger(f.start)||!Number.isSafeInteger(f.end)||f.start<0||f.end<=f.start||f.end>r.input_chars||typeof f.score!=='number'||!Number.isFinite(f.score)||f.score<p.minimum_score||f.score>1) fail();
        return Object.freeze({entity:f.entity,start:f.start,end:f.end,score:f.score});
      });
      // Keep only what the reviewer needs. Input hashes and raw policy terms are not retained.
      return Object.freeze({output:r.redactedText,findings:Object.freeze(findings),entities:Object.freeze([...p.entities]),minimumScore:p.minimum_score,customTerms:p.custom_terms_count});
    }catch(_){fail();}
  }
  return Object.freeze({parse,MAX_BYTES});
});
