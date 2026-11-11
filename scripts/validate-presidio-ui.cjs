'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(x=>x.endsWith('.test.cjs')).sort().map(x=>'tests/'+x);
const tested=cp.spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:root,encoding:'utf8',timeout:60000});
if(tested.status!==0){process.stderr.write(tested.stdout||'TEST_FAILED');process.exit(2);}
const count=Number(tested.stdout.match(/^# tests (\d+)$/m)?.[1]);if(!Number.isSafeInteger(count)||count<1)throw new Error('TEST_COUNT_MISSING');
const checked=cp.spawnSync(process.execPath,['scripts/verify.cjs'],{cwd:root,encoding:'utf8',timeout:30000});
if(checked.status!==0){process.stderr.write('STATIC_CHECK_FAILED\n');process.exit(2);}
const sources=['package.json','README.md','README.th.md','SECURITY.md','THIRD_PARTY_NOTICES.md','.gitignore','.github/workflows/upstream-integrations.yml','dist/index.html','dist/styles.css','dist/app.js','dist/privacy-guard.js','dist/presidio-report.js','scripts/verify.cjs','scripts/validate-presidio-ui.cjs','docs/BROWSER_QA.md','docs/DEVELOPMENT.md','docs/VALIDATION.md','docs/THREAT_MODEL.md','integrations/presidio/fixtures/redacted-report.json',...files].sort();
const report={schema_version:1,project:'sandworm-privacy-workbench',version:'0.2.0',validated_at:new Date().toISOString(),status:'passed',node:process.version,passed:count,static_checks:'passed',browser_qa:'new Presidio UI not visually tested; DOM harness only',source_sha256:Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/presidio-ui-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:count,static_checks:'passed',source_files:sources.length}));
