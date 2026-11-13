import json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from evaluate import evaluate,fixture_dataset,score_predictions
from redact import GuardError

class SyntheticEvaluationTests(unittest.TestCase):
 def test_labeled_synthetic_dataset_exact_spans(self):
  raw=(ROOT/'fixtures/thai-numeric-synthetic.json').read_bytes()
  result=evaluate(raw)
  self.assertEqual(result['mode'],'synthetic-fixture')
  self.assertEqual(result['cases'],44)
  for entity in ['THAI_ID','THAI_MOBILE','EMAIL_ADDRESS']:
   self.assertGreater(result['entities'][entity]['true_positives'],0)
   self.assertEqual(result['entities'][entity]['false_positives'],0)
   self.assertEqual(result['entities'][entity]['false_negatives'],0)
  serialized=json.dumps(result,ensure_ascii=False)
  for value in ['089-000-0000','1234567890121','synthetic@example.invalid','๐๘๙-๐๐๐-๐๐๐๐','redactedText']:
   self.assertNotIn(value,serialized)
 def test_scoring_counts_wrong_offsets_and_duplicate_predictions(self):
  expected=[{'entity':'THAI_MOBILE','start':2,'end':12},{'entity':'THAI_ID','start':20,'end':33}]
  actual=[expected[0],expected[0],{'entity':'THAI_ID','start':21,'end':34}]
  counts=score_predictions(expected,actual)
  self.assertEqual(counts['THAI_MOBILE'],{'true_positives':1,'false_positives':1,'false_negatives':0})
  self.assertEqual(counts['THAI_ID'],{'true_positives':0,'false_positives':1,'false_negatives':1})
 def test_fixture_errors_never_echo_originals(self):
  for raw in [b'PRIVATE_RAW',b'{"classification":"PRIVATE_RAW"}',b'{"x":1,"x":2}',b'{"x":NaN}']:
   with self.assertRaisesRegex(GuardError,'^INVALID_EVALUATION_DATASET$'):
    fixture_dataset(raw)
 def test_boolean_offset_rejected(self):
  raw=(ROOT/'fixtures/thai-numeric-synthetic.json').read_bytes()
  data=json.loads(raw)
  data['cases'][0]['expected'][0]['start']=True
  with self.assertRaisesRegex(GuardError,'^INVALID_EVALUATION_DATASET$'):
   fixture_dataset(json.dumps(data).encode())
 def test_unlabeled_real_input_not_accepted(self):
  data={'schema_version':1,'classification':'UNLABELED','scope':'test','cases':[]}
  with self.assertRaisesRegex(GuardError,'^INVALID_EVALUATION_DATASET$'):
   fixture_dataset(json.dumps(data).encode())
if __name__=='__main__': unittest.main()
