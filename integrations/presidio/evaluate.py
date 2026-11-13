"""Exact-span synthetic fixture evaluation; reports aggregate counts, never inputs."""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, sys
from collections import Counter
from redact import BUILTINS, GuardError, SafeParser, build_analyzer, read_regular, redact

MAX_DATASET_BYTES = 262144

def fixture_dataset(raw):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result: raise GuardError('INVALID_EVALUATION_DATASET')
            result[key]=value
        return result
    try:
        if not isinstance(raw,bytes) or len(raw)>MAX_DATASET_BYTES: raise ValueError()
        data=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
        if not isinstance(data,dict) or set(data)!={'schema_version','classification','scope','cases'}: raise ValueError()
        if type(data['schema_version']) is not int or data['schema_version']!=1 or data['classification']!='SYNTHETIC_ONLY': raise ValueError()
        if not isinstance(data['scope'],str) or not 1<=len(data['scope'])<=500: raise ValueError()
        cases=data['cases']
        if not isinstance(cases,list) or not 1<=len(cases)<=256: raise ValueError()
        seen=set()
        for case in cases:
            if not isinstance(case,dict) or set(case)!={'id','text','expected'}: raise ValueError()
            cid=case['id']
            if not isinstance(cid,str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}',cid) or cid in seen: raise ValueError()
            seen.add(cid)
            text=case['text']
            if not isinstance(text,str) or len(text.encode('utf-8'))>65536: raise ValueError()
            if not isinstance(case['expected'],list) or len(case['expected'])>100: raise ValueError()
            labels=set()
            for row in case['expected']:
                if not isinstance(row,dict) or set(row)!={'entity','start','end'}: raise ValueError()
                if row['entity'] not in BUILTINS or type(row['start']) is not int or type(row['end']) is not int or not 0<=row['start']<row['end']<=len(text): raise ValueError()
                label=(row['entity'],row['start'],row['end'])
                if label in labels: raise ValueError()
                labels.add(label)
        return data
    except Exception:
        raise GuardError('INVALID_EVALUATION_DATASET') from None

def score_predictions(expected,actual):
    """Counters retain duplicate predictions as false positives."""
    truth=Counter((r['entity'],r['start'],r['end']) for r in expected)
    predicted=Counter((r['entity'],r['start'],r['end']) for r in actual)
    matched=truth & predicted
    counts={}
    for entity in BUILTINS:
        tp=sum(v for k,v in matched.items() if k[0]==entity)
        fp=sum(v for k,v in (predicted-matched).items() if k[0]==entity)
        fn=sum(v for k,v in (truth-matched).items() if k[0]==entity)
        counts[entity]={'true_positives':tp,'false_positives':fp,'false_negatives':fn}
    return counts

def evaluate(raw,analyzer=None):
    data=fixture_dataset(raw)
    analyzer=analyzer or build_analyzer()
    totals={entity:{'true_positives':0,'false_positives':0,'false_negatives':0} for entity in BUILTINS}
    for case in data['cases']:
        result=redact(case['text'],analyzer)
        counts=score_predictions(case['expected'],result['findings'])
        for entity in BUILTINS:
            for field in totals[entity]: totals[entity][field]+=counts[entity][field]
    for row in totals.values():
        tp,fp,fn=row['true_positives'],row['false_positives'],row['false_negatives']
        row['precision']=round(tp/(tp+fp),6) if tp+fp else None
        row['recall']=round(tp/(tp+fn),6) if tp+fn else None
        row['labeled_entities']=tp+fn
        row['predicted_entities']=tp+fp
    return {'schema_version':1,'project':'sandworm-privacy-workbench-presidio-evaluation',
            'mode':'synthetic-fixture','dataset_sha256':hashlib.sha256(raw).hexdigest(),
            'cases':len(data['cases']),'matching':'exact entity and original-code-point start/end',
            'entities':totals,'limits':['Constructed fixtures only; not production precision/recall or identity verification.',
                                       'No source text, matched values, per-case offsets or raw errors are exported.']}

def main(argv=None):
    try:
        parser=SafeParser(description='Evaluate labeled SYNTHETIC_ONLY fixtures, output aggregate counts.')
        parser.add_argument('dataset',type=pathlib.Path)
        parser.add_argument('--output',required=True,type=pathlib.Path)
        args=parser.parse_args(argv)
        raw=read_regular(args.dataset,MAX_DATASET_BYTES).encode('utf-8')
        report=evaluate(raw)
        with os.fdopen(os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w',encoding='utf-8') as f:
            json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
        print(json.dumps({'status':'evaluated','cases':report['cases']}));return 0
    except GuardError as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr);return 2
    except Exception:
        print('{"error":"EVALUATION_FAILED"}',file=sys.stderr);return 2

if __name__=='__main__': raise SystemExit(main())
