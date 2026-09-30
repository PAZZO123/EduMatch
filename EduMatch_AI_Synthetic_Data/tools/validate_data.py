"""Check CSV joins, split isolation, pair features, labels and reference constraints."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
from common import *

def validate_package(root):
    report={'synthetic':True,'status':'PASS','checks':[],'model_splits':{},'cohorts':{},'invalid_fixtures':{}}
    ids={}
    for split in ['train','validation','test']:
        folder=root/'model_training'/split
        s=load_csv(folder/'students.csv');o=load_csv(folder/'offers.csv');p=load_csv(folder/'preferences.csv')
        assert not validate_inputs(s,o,p),(split,'invalid clean inputs')
        ids[split]={r['student_id'] for r in s}
        sdf=pd.DataFrame(s).set_index('student_id');odf=pd.DataFrame(o).set_index('offer_id')
        numeric_s=['overall_score','math_score','science_score','language_score']
        sdf[numeric_s]=sdf[numeric_s].astype(float)
        numeric_o=['min_overall','weight_math','weight_science','weight_language']
        odf[numeric_o]=odf[numeric_o].astype(float)
        expected_s=np.array([x['student_id'] for x in s]);expected_o=np.array([x['offer_id'] for x in o]);n_off=len(o)
        pref_map={(r['student_id'],r['offer_id']):int(r['rank']) for r in p}
        total=0;eligible_count=0
        for chunk in pd.read_csv(folder/'pairs.csv',chunksize=100000,keep_default_na=False,
                                 dtype={'student_id':str,'offer_id':str,'listed_preference_rank':str}):
            ix=np.arange(total,total+len(chunk))
            assert np.array_equal(chunk.student_id.values,expected_s[ix//n_off])
            assert np.array_equal(chunk.offer_id.values,expected_o[ix%n_off])
            assert (chunk['split']==split).all()
            assert chunk['synthetic'].astype(str).str.lower().eq('true').all()
            ss=sdf.loc[chunk.student_id].reset_index(drop=True);oo=odf.loc[chunk.offer_id].reset_index(drop=True)
            overall=ss.overall_score.to_numpy()/100
            fit=sum(ss[f'{sub}_score'].to_numpy()*oo[f'weight_{sub}'].to_numpy() for sub in ['math','science','language'])/100
            margin=np.maximum(0,ss.overall_score.to_numpy()-oo.min_overall.to_numpy())/100
            same=(ss.province.to_numpy()==oo.province.to_numpy()).astype(int)
            for col,expected in zip(FEATURES,[overall,fit,margin,same]):
                assert np.max(np.abs(chunk[col].to_numpy()-expected))<=.0000006,(split,col)
            target=.75*fit+.15*overall+.1*same
            assert np.max(np.abs(chunk.y_demo.to_numpy()-target))<=.0000006
            elig=ss.overall_score.to_numpy()>=oo.min_overall.to_numpy()
            for sub in ['math','science','language']:
                values=oo[f'subject_min_{sub}']
                minimum=pd.to_numeric(values.where(values!='',np.nan)).to_numpy()
                elig &= np.isnan(minimum)|(ss[f'{sub}_score'].to_numpy()>=minimum)
            assert np.array_equal(chunk.eligible.astype(str).str.lower().eq('true').to_numpy(),elig)
            erank=[str(pref_map.get((sid,oid),'')) for sid,oid in zip(chunk.student_id,chunk.offer_id)]
            assert np.array_equal(chunk.listed_preference_rank.to_numpy(),np.array(erank))
            eligible_count+=int(elig.sum());total+=len(chunk)
        assert total==len(s)*len(o)
        refs=load_csv(folder/'expected_rules_only_placements.csv')
        verify_plan(s,o,p,refs,False)
        report['model_splits'][split]={'students':len(s),'offers':len(o),'preferences':len(p),'pairs':total,
                                      'eligible_pairs':eligible_count,'pair_features_and_targets':'PASS'}
    assert not ids['train']&ids['validation'] and not ids['train']&ids['test'] and not ids['validation']&ids['test']
    report['checks'].append('Student IDs are disjoint across train/validation/test; no duplicate candidate pair.')
    for section in ['demo','scenarios']:
        for folder in sorted((root/section).iterdir()):
            s=load_csv(folder/'students.csv');o=load_csv(folder/'offers.csv');p=load_csv(folder/'preferences.csv')
            assert not validate_inputs(s,o,p),folder
            for fallback,name in [(False,'rules_only'),(True,'teacher_fallback')]:
                rows=load_csv(folder/f'expected_{name}_placements.csv');verify_plan(s,o,p,rows,fallback)
                expected=allocate(s,o,p,fallback)
                assert rows==[{k:str(v) for k,v in x.items()} for x in expected],(folder,name,'oracle mismatch')
            report['cohorts'][str(folder.relative_to(root))]=allocation_metrics(s,o,rows)
    for folder in sorted((root/'invalid_inputs').iterdir()):
        expected=json.loads((folder/'expected_validation_errors.json').read_text())
        errors=validate_inputs(load_csv(folder/'students.csv'),load_csv(folder/'offers.csv'),load_csv(folder/'preferences.csv'))
        assert any(x['code']==expected['expected_primary_code'] for x in errors)
        report['invalid_fixtures'][folder.name]={'status':'EXPECTED_REJECTION','primary_code':expected['expected_primary_code']}
    base=load_csv(root/'scenarios'/'six_student_base'/'expected_rules_only_placements.csv')
    assert {r['student_id']:r['offer_id'] for r in base}=={'S1':'A','S2':'A','S3':'B','S4':'C','S5':'','S6':''}
    fallback=load_csv(root/'scenarios'/'six_student_fallback_on'/'expected_teacher_fallback_placements.csv')
    assert next(x['offer_id'] for x in fallback if x['student_id']=='S3')=='C'
    report['checks']+=['All clean cohorts have valid score ranges, keys, capacities, profile weights and ordered choices.',
                       'Every reference plan passes capacity, eligibility, uniqueness and preference authorization.',
                       'Six-student SRS fixture and fallback variants match expected outcomes.',
                       'All invalid-input fixtures are rejected; they are isolated from training data.']
    save_json(root/'validation_report.json',report)
    print(json.dumps({'status':report['status'],'model_splits':report['model_splits'],
                      'clean_demo_and_scenario_cohorts':len(report['cohorts']),
                      'expected_rejection_fixtures':len(report['invalid_fixtures'])},indent=2))
    return report

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    validate_package(ap.parse_args().root)

if __name__=='__main__':main()
