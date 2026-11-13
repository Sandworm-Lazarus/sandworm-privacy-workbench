import importlib.util,json,pathlib,sys,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from redact import redact,build_analyzer,valid_thai_id,GuardError,MAX_BYTES
class RedactionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.analyzer=build_analyzer()
 def go(self,text): return redact(text,self.analyzer)
 def test_email_and_mobile(self):
  report=self.go('ติดต่อ analyst@example.invalid โทร 0890000000')
  self.assertEqual(report['summary']['detections'],2);self.assertNotIn('analyst@',json.dumps(report));self.assertNotIn('0890000000',json.dumps(report))
 def test_international_mobile(self): self.assertEqual(self.go('โทร +66890000000')['summary']['detections'],1)
 def test_preserves_non_pii(self): self.assertEqual(self.go('สวัสดีครับ ไม่มีข้อมูลตัวอย่าง')['redactedText'],'สวัสดีครับ ไม่มีข้อมูลตัวอย่าง')
 def test_checksum(self):
  prefix='123456789012'; good=prefix+str((11-sum(int(v)*(13-i) for i,v in enumerate(prefix))%11)%10)
  self.assertTrue(valid_thai_id(good));self.assertEqual(self.go(good)['summary']['detections'],1)
 def test_wrong_checksum(self):
  self.assertFalse(valid_thai_id('1234567890123'));self.assertEqual(self.go('1234567890123')['summary']['detections'],0)
 def test_bad_id_prefix(self): self.assertFalse(valid_thai_id('0000000000000')); self.assertFalse(valid_thai_id('9999999999999'))
 def test_thai_digit_scope(self): self.assertEqual(self.go('๐๘๙๐๐๐๐๐๐๐')['summary']['detections'],1)
 def test_mobile_boundary(self): self.assertEqual(self.go('108900000001')['summary']['detections'],0)
 def test_invalid_unicode(self):
  with self.assertRaisesRegex(GuardError,'INVALID_UTF8'): self.go('\ud800')
 def test_empty(self): self.assertEqual(self.go('')['summary']['detections'],0)
 def test_limit(self):
  with self.assertRaisesRegex(GuardError,'INPUT_LIMIT'): self.go('ก'*MAX_BYTES)
 def test_safe_error(self):
  class Broken:
   def analyze(self,**kwargs): raise RuntimeError('analyst@example.invalid raw secret')
  with self.assertRaisesRegex(GuardError,'^REDACTION_FAILED$'): redact('secret',Broken())
 def test_no_network_or_model_download(self):
  with patch('socket.socket.connect',side_effect=AssertionError('network forbidden')):
   analyzer=build_analyzer();self.assertEqual(redact('test@example.invalid',analyzer)['summary']['detections'],1)
 def test_hash_sensitive_to_change(self): self.assertNotEqual(self.go('a')['input_sha256'],self.go('b')['input_sha256'])

class PolicyTests(unittest.TestCase):
 def test_exact_thai_literal_and_regex_metacharacters(self):
  r=redact('บุคคลสมมติ ก / .* / safe',policy={'entities':[],'custom_terms':['บุคคลสมมติ ก','.*']})
  self.assertEqual(r['redactedText'],'[REDACTED] / [REDACTED] / safe')
  self.assertEqual(r['summary']['detections'],2)
  self.assertNotIn('บุคคลสมมติ ก',json.dumps(r,ensure_ascii=False));self.assertNotIn('custom_terms"',json.dumps(r))
 def test_custom_literals_are_case_sensitive_substrings(self):
  r=redact('INTERNAL-FIXTURE-only internal-fixture-only',policy={'entities':[],'custom_terms':['INTERNAL-FIXTURE']})
  self.assertEqual(r['redactedText'],'[REDACTED]-only internal-fixture-only')
 def test_select_entities(self):
  r=redact('example@example.invalid 0890000000',policy={'entities':['THAI_MOBILE']})
  self.assertEqual(r['redactedText'],'example@example.invalid [REDACTED]')
 def test_threshold_is_applied(self):
  r=redact('example@example.invalid',policy={'minimum_score':0.9})
  self.assertEqual(r['summary']['detections'],0)
 def test_report_schema_no_original(self):
  r=redact('example@example.invalid')
  self.assertEqual(r['schema_version'],2);self.assertEqual(r['input_chars'],23)
  self.assertNotIn('text',r['findings'][0]);self.assertNotIn('example@',json.dumps(r))
 def test_email_boundary(self):
  for text in ['x'*65+'@example.invalid','a@@example.invalid','a@-bad.invalid']:
   self.assertEqual(redact(text)['summary']['detections'],0)
 def test_invalid_policies_sanitized(self):
  from redact import policy_for
  for value in [{'regex':'SECRET'},{'entities':['UNKNOWN']},{'entities':[]},{'entities':['THAI_ID','THAI_ID']},{'minimum_score':True},{'minimum_score':float('nan')},{'minimum_score':0.4},{'custom_terms':['']},{'custom_terms':['\ud800']},{'custom_terms':['x']*65},{'custom_terms':['x','x']},{'custom_terms':['a\nb']}]:
   with self.subTest(value=str(type(value))):
    with self.assertRaisesRegex(GuardError,'^INVALID_POLICY$'):policy_for(value)
 def test_policy_duplicate_keys_rejected(self):
  import tempfile
  from redact import load_policy
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'policy.json';p.write_text('{"entities":["THAI_ID"],"enti\\u0074ies":["THAI_MOBILE"]}')
   with self.assertRaisesRegex(GuardError,'^INVALID_POLICY$'):load_policy(p)
 def test_policy_custom_limit(self):
  with self.assertRaisesRegex(GuardError,'^FINDING_LIMIT$'):redact('x'*1001,policy={'entities':[],'custom_terms':['x']})
 def test_unicode_offsets_are_codepoints(self):
  r=redact('😀 example@example.invalid')
  self.assertEqual(r['findings'][0]['start'],2)
 def test_regular_file_only_and_no_overwrite(self):
  import tempfile,os,contextlib,io
  from redact import main,read_regular
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'input.txt';p.write_text('safe')
   with contextlib.redirect_stderr(io.StringIO()):self.assertEqual(main([str(p),'--output',str(p)]),2)
   self.assertEqual(p.read_text(),'safe')
   link=pathlib.Path(d)/'link';link.symlink_to(p)
   with self.assertRaises((GuardError,OSError)):read_regular(link,100)
   fifo=pathlib.Path(d)/'fifo';os.mkfifo(fifo)
   with self.assertRaisesRegex(GuardError,'^REGULAR_FILE_REQUIRED$'):read_regular(fifo,100)
 def test_invalid_cli_arguments_do_not_echo(self):
  import contextlib,io
  from redact import main
  stderr=io.StringIO()
  with contextlib.redirect_stderr(stderr):self.assertEqual(main(['--RAW-PRIVATE-SENTINEL']),2)
  self.assertEqual(stderr.getvalue().strip(),'{"error": "INVALID_ARGUMENTS"}')

class NumericCoverageTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.analyzer=build_analyzer()
 def test_formatted_id_checksum(self):
  for value in ['1-2345-67890-12-1','๑ ๒๓๔๕ ๖๗๘๙๐ ๑๒ ๑','๑-2๓4๕-6๗8๙0-1๒-1']:
   with self.subTest(format='synthetic'):
    self.assertTrue(valid_thai_id(value))
    self.assertEqual(redact(value,self.analyzer)['redactedText'],'[REDACTED]')
 def test_offsets_preserve_original_codepoints(self):
  value='๐8๙-0๐0-0๐0๐'
  text='😀 ก\u0e33 โทร'+value+' จบ'
  report=redact(text,self.analyzer)
  finding=report['findings'][0]
  self.assertEqual(text[finding['start']:finding['end']],value)
  self.assertEqual(finding['start'],len('😀 ก\u0e33 โทร'))
  self.assertEqual(report['redactedText'],'😀 ก\u0e33 โทร[REDACTED] จบ')
  self.assertNotIn(value,json.dumps(report,ensure_ascii=False))
 def test_normalization_is_one_codepoint_only(self):
  from redact import normalize_numeric_text
  original='😀 ก\u0e33 A\u0301 ๐8๙ fullwidth０'
  view=normalize_numeric_text(original)
  self.assertEqual(len(view),len(original))
  self.assertEqual(view,'😀 ก\u0e33 A\u0301 089 fullwidth０')
 def test_numeric_version_and_identifier_boundaries(self):
  for value in ['v0890000000','0890000000beta','0890000000.2','๑0890000000','١0890000000','1234567890121.2','id1234567890121','089-000-0000-1']:
   with self.subTest(kind='negative'):
    self.assertEqual(redact(value,self.analyzer)['summary']['detections'],0)
 def test_only_bounded_single_space_or_hyphen_groups(self):
  for value in ['089--000-0000','089  000 0000','089\t000\t0000','089\n000\n0000','1-2345 67890-12-1','１234567890121']:
   with self.subTest(kind='negative'):
    self.assertEqual(redact(value,self.analyzer)['summary']['detections'],0)
 def test_numeric_policy_selection_and_threshold(self):
  text='๑-๒๓๔๕-๖๗๘๙๐-๑๒-๑ / ๐๘๙-๐๐๐-๐๐๐๐'
  r=redact(text,policy={'entities':['THAI_ID']})
  self.assertEqual([f['entity'] for f in r['findings']],['THAI_ID'])
  self.assertEqual(redact('๐๘๙-๐๐๐-๐๐๐๐',policy={'minimum_score':0.9})['summary']['detections'],0)

if __name__=='__main__': unittest.main()

