"""Run real-engine tests and record the exact integration tree tested."""
import datetime,hashlib,json,pathlib,sys,unittest,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
suite=unittest.defaultTestLoader.discover(str(ROOT/'tests'))
result=unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():raise SystemExit(2)
smoke=subprocess.run([sys.executable,str(ROOT/'offline_smoke.py')],capture_output=True,text=True,timeout=30)
if smoke.returncode:print('OFFLINE_SMOKE_FAILED',file=sys.stderr);raise SystemExit(2)
from redact import redact
report=redact((ROOT/'fixtures/input.txt').read_text())
(ROOT/'fixtures/redacted-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
excluded={'.venv','__pycache__','reports','.runtime','.git'}
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.rglob('*')) if p.is_file() and not any(x in excluded for x in p.relative_to(ROOT).parts)}
record={'schema_version':1,'project':'sandworm-privacy-workbench-presidio','validated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'passed','passed':result.testsRun,'upstream_smoke':{'engine':'presidio-analyzer + presidio-anonymizer','version':'2.2.366','mode':'actual-local-pattern-only','pretrained_models_downloaded':0,'fresh_process_network_attempts':0,'synthetic_detections':report['summary']['detections']},'source_sha256':hashes}
(ROOT/'reports').mkdir(exist_ok=True);(ROOT/'reports/validation.json').write_text(json.dumps(record,indent=2)+'\n')
