"""Offline Presidio worker with bounded Thai recognizers and literal policies."""
from __future__ import annotations
import argparse, hashlib, json, math, os, pathlib, stat, sys
MAX_BYTES = 65536
BUILTINS = ('THAI_ID', 'THAI_MOBILE', 'EMAIL_ADDRESS')
class GuardError(ValueError): pass

def valid_thai_id(value):
    return isinstance(value, str) and len(value) == 13 and value.isascii() and value.isdecimal() and value[0] in '12345678' and (11-sum(int(v)*(13-i) for i,v in enumerate(value[:12]))%11)%10 == int(value[-1])

def policy_for(value=None):
    if value is None: value = {}
    if not isinstance(value, dict) or set(value) - {'entities','minimum_score','custom_terms'}: raise GuardError('INVALID_POLICY')
    entities = value.get('entities', list(BUILTINS))
    score = value.get('minimum_score', 0.5)
    terms = value.get('custom_terms', [])
    if not isinstance(entities, list) or len(entities) > 3 or any(not isinstance(e, str) or e not in BUILTINS for e in entities) or len(set(entities)) != len(entities): raise GuardError('INVALID_POLICY')
    if isinstance(score, bool) or not isinstance(score, (int,float)) or not math.isfinite(score) or not 0.5 <= score <= 1: raise GuardError('INVALID_POLICY')
    if not isinstance(terms,list) or len(terms) > 64: raise GuardError('INVALID_POLICY')
    try:
        if any(not isinstance(t,str) or not t.strip() or len(t) > 80 or any(ord(c)<32 for c in t) for t in terms) or len(set(terms)) != len(terms) or sum(len(t.encode('utf-8')) for t in terms) > 4096: raise GuardError('INVALID_POLICY')
    except (UnicodeError,TypeError): raise GuardError('INVALID_POLICY') from None
    if not entities and not terms: raise GuardError('INVALID_POLICY')
    return {'entities':list(entities),'minimum_score':float(score),'custom_terms':list(terms)}

def build_analyzer(policy=None):
    policy = policy_for(policy)
    import spacy
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry, PatternRecognizer, Pattern, EntityRecognizer, RecognizerResult
    from presidio_analyzer.nlp_engine import NlpEngine, NlpArtifacts
    class PatternOnlyEngine(NlpEngine):
        def __init__(self): self.tokenizer = spacy.blank('xx')
        def load(self): pass
        def is_loaded(self): return True
        def process_text(self,text,language):
            doc=self.tokenizer(text)
            return NlpArtifacts([],doc,[t.idx for t in doc],[t.text for t in doc],self,language,[])
        def process_batch(self,texts,language,**kwargs):
            for text in texts: yield text,self.process_text(text,language)
        def is_stopword(self,word,language): return False
        def is_punct(self,word,language): return False
        def get_supported_entities(self): return []
        def get_supported_languages(self): return ['th']
    class ThaiIdRecognizer(PatternRecognizer):
        def __init__(self):
            super().__init__(supported_entity='THAI_ID',supported_language='th',patterns=[Pattern('thai-id-ascii',r'(?<![0-9])[1-8][0-9]{12}(?![0-9])',0.6)])
        def validate_result(self,text): return valid_thai_id(text)
    class LiteralRecognizer(EntityRecognizer):
        def __init__(self): super().__init__(supported_entities=['CUSTOM_TERM'],supported_language='th',name='SandwormLiteralRecognizer')
        def load(self): pass
        def analyze(self,text,entities,nlp_artifacts=None):
            found=[]
            for term in policy['custom_terms']:
                offset=0
                while True:
                    start=text.find(term,offset)
                    if start < 0: break
                    found.append(RecognizerResult('CUSTOM_TERM',start,start+len(term),1.0))
                    if len(found)>1000: raise GuardError('FINDING_LIMIT')
                    offset=start+len(term)
            return found
    registry=RecognizerRegistry(supported_languages=['th'])
    if 'THAI_ID' in policy['entities']: registry.add_recognizer(ThaiIdRecognizer())
    if 'THAI_MOBILE' in policy['entities']: registry.add_recognizer(PatternRecognizer(supported_entity='THAI_MOBILE',supported_language='th',patterns=[Pattern('thai-mobile-ascii',r'(?<![A-Za-z0-9+])(?:0[689][0-9]{8}|\+66[689][0-9]{8})(?![0-9])',0.8)]))
    if 'EMAIL_ADDRESS' in policy['entities']: registry.add_recognizer(PatternRecognizer(supported_entity='EMAIL_ADDRESS',supported_language='th',patterns=[Pattern('email-ascii',r'(?<![A-Za-z0-9._%+\-@])[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)+(?![A-Za-z0-9.\-])',0.8)]))
    if policy['custom_terms']: registry.add_recognizer(LiteralRecognizer())
    return AnalyzerEngine(registry=registry,nlp_engine=PatternOnlyEngine(),supported_languages=['th'])

def redact(text, analyzer=None, policy=None):
    if not isinstance(text,str): raise GuardError('INVALID_TEXT')
    try: encoded=text.encode('utf-8')
    except UnicodeError: raise GuardError('INVALID_UTF8') from None
    if len(encoded)>MAX_BYTES: raise GuardError('INPUT_LIMIT')
    policy=policy_for(policy)
    try:
        from presidio_anonymizer import AnonymizerEngine
        from presidio_anonymizer.entities import OperatorConfig
        analyzer=analyzer or build_analyzer(policy)
        entities=policy['entities']+(['CUSTOM_TERM'] if policy['custom_terms'] else [])
        found=analyzer.analyze(text=text,language='th',entities=entities,score_threshold=policy['minimum_score'])
        if len(found)>1000: raise GuardError('FINDING_LIMIT')
        result=AnonymizerEngine().anonymize(text=text,analyzer_results=found,operators={'DEFAULT':OperatorConfig('replace',{'new_value':'[REDACTED]'})})
        return {'schema_version':2,'project':'sandworm-privacy-workbench','mode':'live','engine':'presidio-2.2.366-pattern-only','input_sha256':hashlib.sha256(encoded).hexdigest(),'input_chars':len(text),'redactedText':result.text,'policy':{'entities':entities,'minimum_score':policy['minimum_score'],'custom_terms_count':len(policy['custom_terms'])},'summary':{'detections':len(found),'scope':'Thai ASCII mobile / checksum-valid ID / ASCII email / optional exact literals'},'findings':[{'entity':r.entity_type,'start':r.start,'end':r.end,'score':r.score} for r in sorted(found,key=lambda r:(r.start,r.end,r.entity_type))]}
    except GuardError: raise
    except ImportError: raise GuardError('DEPENDENCIES_MISSING') from None
    except Exception: raise GuardError('REDACTION_FAILED') from None

def read_regular(path,limit):
    fd=None
    try:
        fd=os.open(path,os.O_RDONLY|os.O_NONBLOCK|getattr(os,'O_NOFOLLOW',0))
        if not stat.S_ISREG(os.fstat(fd).st_mode): raise GuardError('REGULAR_FILE_REQUIRED')
        with os.fdopen(fd,'rb') as f:
            fd=None
            data=f.read(limit+1)
        if len(data)>limit: raise GuardError('INPUT_LIMIT')
        try: return data.decode('utf-8')
        except UnicodeError: raise GuardError('INVALID_UTF8') from None
    finally:
        if fd is not None: os.close(fd)

def load_policy(path):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise GuardError('INVALID_POLICY')
            result[key]=value
        return result
    try: return policy_for(json.loads(read_regular(path,8192),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(GuardError('INVALID_POLICY'))))
    except (ValueError,RecursionError) as e:
        if isinstance(e,GuardError): raise
        raise GuardError('INVALID_POLICY') from None

class SafeParser(argparse.ArgumentParser):
    def error(self,message): raise GuardError('INVALID_ARGUMENTS')

def main(argv=None):
    try:
        p=SafeParser(description='Offline Thai PII redaction with configurable local Presidio.')
        p.add_argument('input',type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--policy',type=pathlib.Path)
        args=p.parse_args(argv)
        text=read_regular(args.input,MAX_BYTES)
        report=redact(text,policy=load_policy(args.policy) if args.policy else None)
        # Exclusive creation prevents overwriting original inputs or existing reports.
        with os.fdopen(os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w',encoding='utf-8') as f: json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
        print(json.dumps({'status':'redacted','detections':report['summary']['detections']}));return 0
    except GuardError as e: print(json.dumps({'error':str(e)}),file=sys.stderr);return 2
    except (OSError,ValueError): print('{"error":"LOCAL_IO_FAILED"}',file=sys.stderr);return 2
if __name__=='__main__': raise SystemExit(main())
