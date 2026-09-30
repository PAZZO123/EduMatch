"""Reproducible synthetic EduMatch dataset generator; no real student records."""
import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from common import *

PROVINCES = ['Southern Province', 'Northern Province', 'Eastern Province', 'Western Province', 'Kigali City']
ROOT = Path(__file__).resolve().parents[1]
RULES = {'rule_version': 'demo-policy-v1', 'synthetic': True, 'score_scale': '0-100',
         'score_direction': 'higher_better', 'priority': 'overall_desc_then_student_id_asc',
         'allow_unlisted_fallback': True, 'allocation': 'serial_priority',
         'stage_status': 'UNCONFIRMED_USE_GENERIC_DEMO_OFFER',
         'notice': 'Invented demonstration rules; not NESA-approved policy.'}

def make_offers(n, capacity_total, seed, prefix, mixed=False):
    rng = np.random.default_rng(seed)
    weights = rng.dirichlet([2, 2, 2], size=n)
    sizes = rng.dirichlet(np.full(n, 5)) * capacity_total
    caps = np.floor(sizes).astype(int)
    for i in np.argsort(-(sizes-caps))[:int(capacity_total-sum(caps))]: caps[i] += 1
    rows=[]
    for i in range(n):
        wm = round(float(weights[i,0]),6); ws=round(float(weights[i,1]),6)
        wl=round(1-wm-ws,6)
        rows.append({'offer_id': f'{prefix}-O{i+1:03}',
                     'school_name': f'Synthetic School {prefix} {i+1:03}',
                     'province': PROVINCES[i % 5] if mixed else PROVINCES[0],
                     'stage_programme': 'DEMO_GENERIC_OFFER', 'capacity': int(caps[i]),
                     'min_overall': int(rng.choice([40,45,50,55,60,65,70,75,80])),
                     'subject_min_math': 45 if i % 7 == 0 else '',
                     'subject_min_science': 45 if i % 11 == 0 else '',
                     'subject_min_language': '', 'weight_math': wm, 'weight_science': ws,
                     'weight_language': wl})
    return rows

def make_students(n, seed, prefix, mixed=False):
    rng=np.random.default_rng(seed)
    # Correlated synthetic marks with different subject strengths; NOT fitted to Rwanda statistics.
    ability=np.clip(rng.normal(61,16,n),8,94)
    strengths=rng.normal(0,10,(n,3))
    marks=np.clip(ability[:,None]+strengths+rng.normal(0,4,(n,3)),0,100)
    overall=np.clip(marks.mean(axis=1)+rng.normal(0,3,n),0,100)
    rows=[]
    for i in range(n):
        rows.append({'student_id':f'{prefix}-S{i+1:06}', 'display_name':f'Synthetic Student {prefix} {i+1:06}',
                     'cohort_id':f'SYN-{prefix}-2026','province':PROVINCES[int(rng.integers(5))] if mixed else PROVINCES[0],
                     'overall_score':round(float(overall[i]),1),'math_score':round(float(marks[i,0]),1),
                     'science_score':round(float(marks[i,1]),1),'language_score':round(float(marks[i,2]),1),
                     'allow_fallback':'true' if rng.random()<.55 else 'false'})
    return rows

def make_preferences(students, offers, seed):
    rng=np.random.default_rng(seed); rows=[]
    # Shared prestige/hotspots deliberately create competition. Students sometimes choose ineligible offers.
    popularity=rng.normal(0,.13,len(offers));popularity[:max(1,len(offers)//8)]+=.45
    for s in students:
        scores=np.array([teacher_target(pair_features(s,o)) for o in offers])
        utility=scores+popularity+rng.normal(0,.17,len(offers))
        for rank,j in enumerate(np.argsort(-utility)[:3],1):
            rows.append({'student_id':s['student_id'],'offer_id':offers[int(j)]['offer_id'],'rank':rank})
    return rows

def write_cohort(folder, students, offers, prefs, fallback_refs=True):
    folder.mkdir(parents=True,exist_ok=True)
    save_csv(folder/'students.csv',STUDENT_FIELDS,students)
    save_csv(folder/'offers.csv',OFFER_FIELDS,offers)
    save_csv(folder/'preferences.csv',PREF_FIELDS,prefs)
    save_json(folder/'rules.json',RULES)
    assert not validate_inputs(students,offers,prefs)
    base=allocate(students,offers,prefs)
    verify_plan(students,offers,prefs,base,False)
    save_csv(folder/'expected_rules_only_placements.csv',PLACEMENT_FIELDS,base)
    metrics={'rules_only':allocation_metrics(students,offers,base)}
    if fallback_refs:
        teacher=allocate(students,offers,prefs,True)
        verify_plan(students,offers,prefs,teacher,True)
        save_csv(folder/'expected_teacher_fallback_placements.csv',PLACEMENT_FIELDS,teacher)
        metrics['teacher_fallback']=allocation_metrics(students,offers,teacher)
    save_json(folder/'summary.json',metrics)
    return metrics

def write_pairs(path, students, offers, prefs, split):
    pref_map={(p['student_id'],p['offer_id']):p['rank'] for p in prefs}
    with path.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=PAIR_FIELDS,lineterminator='\n');w.writeheader()
        for s in students:
            rows=[]
            for o in offers:
                features=pair_features(s,o)
                row={'student_id':s['student_id'],'offer_id':o['offer_id'],'split':split,
                     **{k:round(float(v),6) for k,v in zip(FEATURES,features)},
                     'y_demo':teacher_target(features),'eligible':str(eligible(s,o)).lower(),
                     'listed_preference_rank':pref_map.get((s['student_id'],o['offer_id']),''),
                     'synthetic':'true'}
                rows.append(row)
            w.writerows(rows)
    return len(students)*len(offers)

def simple_fixture():
    offers=[]
    for oid,cap,threshold in [('A',2,50),('B',1,50),('C',1,70)]:
        offers.append({'offer_id':oid,'school_name':f'Synthetic School {oid}', 'province':PROVINCES[0],
                       'stage_programme':'DEMO_GENERIC_OFFER','capacity':cap,'min_overall':threshold,
                       'subject_min_math':'','subject_min_science':'','subject_min_language':'',
                       'weight_math':.4,'weight_science':.4,'weight_language':.2})
    students=[];prefs=[]
    for i,(score,choices) in enumerate([(90,['A','B']),(85,['A']),(80,['A','B']),
                                      (75,['C']),(65,['A','C']),(45,['A'])],1):
        sid=f'S{i}'
        students.append({'student_id':sid,'display_name':f'Synthetic Student {i}',
                         'cohort_id':'SYN-FIXTURE','province':PROVINCES[0], 'overall_score':score,
                         'math_score':score,'science_score':score,'language_score':score,'allow_fallback':'false'})
        prefs += [{'student_id':sid,'offer_id':o,'rank':rank} for rank,o in enumerate(choices,1)]
    return students,offers,prefs

def invalid_fixtures(root):
    mutations=[('missing_score',lambda s,o,p:s[0].update(overall_score=''), 'INVALID_SCORE'),
               ('duplicate_student',lambda s,o,p:s.append(copy.deepcopy(s[0])), 'DUPLICATE_OR_MISSING_ID'),
               ('unknown_offer',lambda s,o,p:p[0].update(offer_id='UNKNOWN'), 'UNKNOWN_OFFER'),
               ('duplicate_preference_rank',lambda s,o,p:p[1].update(rank=1), 'DUPLICATE_RANK'),
               ('negative_capacity',lambda s,o,p:o[0].update(capacity=-1), 'INVALID_CAPACITY'),
               ('out_of_range_score',lambda s,o,p:s[0].update(math_score=101), 'INVALID_SCORE'),
               ('no_choices',lambda s,o,p:p.__setitem__(slice(None),[x for x in p if x['student_id']!='S1']), 'MISSING_OR_NONCONTIGUOUS_CHOICES'),
               ('duplicate_choice',lambda s,o,p:p[1].update(offer_id='A'), 'DUPLICATE_CHOICE')]
    for name,fn,code in mutations:
        s,o,p=simple_fixture();fn(s,o,p);folder=root/'invalid_inputs'/name
        save_csv(folder/'students.csv',STUDENT_FIELDS,s);save_csv(folder/'offers.csv',OFFER_FIELDS,o)
        save_csv(folder/'preferences.csv',PREF_FIELDS,p);save_json(folder/'rules.json',RULES)
        errors=validate_inputs(s,o,p);assert any(e['code']==code for e in errors)
        save_json(folder/'expected_validation_errors.json',{'expected_primary_code':code,'errors':errors,
                    'instruction':'Reject this whole import. Never mix invalid-input fixtures into model training.'})

def make_dictionary(root):
    rows=[]
    descriptions={
        'student_id':'Synthetic key, not a national or examination ID. Exclude from model features.',
        'display_name':'Synthetic alias only. Exclude from model features.',
        'cohort_id':'Synthetic cohort key.', 'province':'Geographic label used in a simulated preference context.',
        'overall_score':'Synthetic 0-100 score; higher is better. Not a verified NESA grade scale.',
        'allow_fallback':'Opt-in to unlisted fallback recommendations under invented demo policy.',
        'offer_id':'Synthetic school-offer key; no real school identifiers.',
        'school_name':'Explicitly synthetic school label, not a real institution.',
        'stage_programme':'Generic placeholder because official admission stage is unconfirmed.',
        'capacity':'Initial seats per offer for this cohort, not remaining seats or national capacity.',
        'min_overall':'Invented eligibility threshold on 0-100 scale.',
        'rank':'1-3, unique and contiguous per student; lower means more preferred.',
        'split':'Preassigned train, validation or test. Students never overlap across splits.',
        'overall_norm':'overall_score / 100.',
        'subject_fit':'Sum of math/science/language scores times offer weights / 100.',
        'eligibility_margin':'max(0, overall_score - min_overall) / 100. Not a capacity measure.',
        'same_province':'1 if student and offer province labels match, otherwise 0.',
        'y_demo':'Synthetic teacher target: .75*subject_fit + .15*overall_norm + .10*same_province.',
        'eligible':'Hard-rule eligibility at initial inputs. Diagnostic only, not a model feature.',
        'listed_preference_rank':'1-3 if pair is a listed choice; blank otherwise. Diagnostic only.',
        'synthetic':'Always true. No real records were used.'}
    for file,fields in [('students.csv',STUDENT_FIELDS),('offers.csv',OFFER_FIELDS),
                        ('preferences.csv',PREF_FIELDS),('pairs.csv',PAIR_FIELDS)]:
        for field in fields:
            description=descriptions.get(field)
            if description is None:
                if field.endswith('_score'): description='Synthetic subject percentage in 0-100.'
                elif field.startswith('subject_min_'): description='Optional synthetic subject threshold; blank means no threshold.'
                elif field.startswith('weight_'): description='Nonnegative offer subject-profile weight; three weights sum to one.'
            rows.append({'file':file,'field':field,'description':description or field,
                         'model_feature':'true' if file=='pairs.csv' and field in FEATURES else 'false',
                         'model_target':'true' if field=='y_demo' else 'false'})
    save_csv(root/'data_dictionary.csv',['file','field','description','model_feature','model_target'],rows)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=ROOT)
    ap.add_argument('--train-students',type=int,default=20000)
    ap.add_argument('--validation-students',type=int,default=5000)
    ap.add_argument('--test-students',type=int,default=5000)
    ap.add_argument('--model-offers',type=int,default=60)
    ap.add_argument('--seed',type=int,default=20260930)
    args=ap.parse_args();root=args.output
    assert min(args.train_students,args.validation_students,args.test_students)>=1
    assert args.model_offers>=3
    # A catalog of fixed profile identities. Per-split capacities are scaled to that split only.
    catalog=make_offers(args.model_offers,20000,args.seed,'CAT',True)
    save_csv(root/'model_training'/'offer_catalog.csv',OFFER_FIELDS,catalog)
    summaries={};pair_counts={}
    for offset,(split,n,prefix) in enumerate([('train',args.train_students,'TRN'),
                     ('validation',args.validation_students,'VAL'),('test',args.test_students,'TST')]):
        students=make_students(n,args.seed+offset+10,prefix,True)
        offers=copy.deepcopy(catalog)
        cap_template=make_offers(args.model_offers,int(n*.90),args.seed+100,'unused',True)
        for o,cap in zip(offers,cap_template):o['capacity']=cap['capacity']
        prefs=make_preferences(students,offers,args.seed+offset+20)
        folder=root/'model_training'/split
        summaries[f'model_{split}']=write_cohort(folder,students,offers,prefs,False)
        pair_counts[split]=write_pairs(folder/'pairs.csv',students,offers,prefs,split)
        print(f'{split}: {n:,} students, {pair_counts[split]:,} pairs',flush=True)
    for name,n,no,seed in [('demo_200',200,12,101),('stress_500',500,20,102),('large_5000',5000,60,103)]:
        s=make_students(n,args.seed+seed,name.upper());o=make_offers(no,int(n*.92),args.seed+seed+10,name.upper())
        prefs=make_preferences(s,o,args.seed+seed+20)
        summaries[name]=write_cohort(root/'demo'/name,s,o,prefs)
    s,o,p=simple_fixture();summaries['six_student_base']=write_cohort(root/'scenarios'/'six_student_base',s,o,p)
    s3=next(x for x in s if x['student_id']=='S3');s3['allow_fallback']='true'
    o[1]['capacity']=0;o[2]['capacity']=2
    summaries['six_student_fallback_on']=write_cohort(root/'scenarios'/'six_student_fallback_on',s,o,p)
    s3['allow_fallback']='false'
    summaries['six_student_fallback_off']=write_cohort(root/'scenarios'/'six_student_fallback_off',s,o,p)
    for i,name in enumerate(['all_zero_capacity','capacity_surplus','oversubscribed_hotspot','seat_shortage',
                            'tied_scores','no_eligible_offer','eligibility_boundary','fallback_disabled']):
        s=make_students(100,args.seed+300+i,'SCN'+str(i));o=make_offers(8,90,args.seed+400+i,'SCN'+str(i))
        if name=='all_zero_capacity':
            for x in o:x['capacity']=0
        elif name=='capacity_surplus':
            for x in o:x.update(capacity=100,min_overall=0,subject_min_math='',subject_min_science='')
        elif name=='seat_shortage':
            for x in o:x['capacity']=2
        elif name=='tied_scores':
            for x in s:x['overall_score']=70.0
        elif name=='no_eligible_offer':
            for x in s:x['overall_score']=30.0
            for x in o:x['min_overall']=80
        elif name=='eligibility_boundary':
            for j,x in enumerate(s):x.update(overall_score=[49.9,50,50.1][j%3],math_score=70,science_score=70,language_score=70)
            for x in o:x.update(min_overall=50,subject_min_math='',subject_min_science='')
        elif name=='fallback_disabled':
            for x in s:x['allow_fallback']='false'
        prefs=make_preferences(s,o,args.seed+500+i)
        if name=='oversubscribed_hotspot':
            for j,x in enumerate(prefs):x['offer_id']=o[(j%3)]['offer_id']
        summaries[name]=write_cohort(root/'scenarios'/name,s,o,prefs)
    invalid_fixtures(root);make_dictionary(root)
    schema={'package_version':'1.0','synthetic':True,'csv_encoding':'UTF-8','csv_delimiter':',',
            'boolean_encoding':['true','false'],'missing_optional_value':'empty CSV field',
            'student_fields':STUDENT_FIELDS,'offer_fields':OFFER_FIELDS,'preference_fields':PREF_FIELDS,
            'pair_fields':PAIR_FIELDS,'model_feature_order':FEATURES,'model_target':'y_demo',
            'numeric_score_range':[0,100],'target_range':[0,1],'preference_rank_range':[1,3]}
    save_json(root/'schema.json',schema)
    save_json(root/'generation_metadata.json',{'package_version':'1.0','synthetic':True,'created_date':'2026-09-30',
        'master_seed':args.seed,'generator':'tools/generate_data.py','real_records_used':0,
        'distribution_source':'Invented correlated-score simulation; no population calibration.',
        'school_identity_source':'Invented labels; no real school registry.',
        'policy_source':'Invented demo-policy-v1; official NESA rules unconfirmed.',
        'model_student_counts':{'train':args.train_students,'validation':args.validation_students,'test':args.test_students},
        'model_offer_count':args.model_offers,'model_pair_counts':pair_counts,
        'pair_target_formula':'.75*subject_fit + .15*overall_norm + .10*same_province',
        'offer_split_note':'Catalog identities shared across splits. Student IDs and records disjoint. Test measures new-student, not unseen-school, behavior.',
        'reference_note':'Expected placements are deterministic demo-policy outputs, not verified historical placements.',
        'summaries':summaries})
    print('Generation complete',flush=True)

if __name__=='__main__':main()
