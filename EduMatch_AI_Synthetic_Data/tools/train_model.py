"""Train a local synthetic compatibility regressor. This is not real placement accuracy."""
import argparse
import hashlib
import json
import platform
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from common import FEATURES, load_csv, save_json, allocate, verify_plan, save_csv, PLACEMENT_FIELDS, allocation_metrics

def load_pairs(path, selected_ids=None):
    blocks=[]
    for chunk in pd.read_csv(path,chunksize=100000,usecols=['student_id']+FEATURES+['y_demo']):
        if selected_ids is not None: chunk=chunk[chunk.student_id.isin(selected_ids)]
        if len(chunk): blocks.append(chunk)
    return pd.concat(blocks,ignore_index=True)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    ap.add_argument('--output',type=Path,default=None)
    ap.add_argument('--max-train-students',type=int,default=2500,help='0 uses all 20,000 training students; default is laptop-friendly.')
    ap.add_argument('--evaluate-test',action='store_true',help='Evaluate held-out test only after choices are finalized.')
    args=ap.parse_args();root=args.root;output=args.output or root/'model_artifacts';output.mkdir(parents=True,exist_ok=True)
    students=load_csv(root/'model_training'/'train'/'students.csv');all_ids=[s['student_id'] for s in students]
    count=len(all_ids) if args.max_train_students==0 else min(args.max_train_students,len(all_ids))
    if count<1:raise ValueError('max-train-students must be positive or zero for all')
    selected=set(np.random.default_rng(42).choice(all_ids,size=count,replace=False))
    train=load_pairs(root/'model_training'/'train'/'pairs.csv',selected)
    valid=load_pairs(root/'model_training'/'validation'/'pairs.csv')
    assert not set(train.student_id)&set(valid.student_id)
    model=RandomForestRegressor(n_estimators=100,max_depth=8,min_samples_leaf=5,random_state=42,n_jobs=-1)
    t=time.perf_counter();model.fit(train[FEATURES],train.y_demo);train_seconds=time.perf_counter()-t
    # Deterministic inference sums trees serially; parallel floating-point reductions
    # can differ in the final bit even when predictions are mathematically identical.
    model.set_params(n_jobs=1)
    train_mean=float(train.y_demo.mean())
    def evaluate(frame):
        predictions=np.clip(model.predict(frame[FEATURES]),0,1)
        baseline=np.full(len(frame),train_mean)
        return {'pair_rows':len(frame),'student_count':int(frame.student_id.nunique()),
                'synthetic_target_mae':float(mean_absolute_error(frame.y_demo,predictions)),
                'mean_target_baseline_mae':float(mean_absolute_error(frame.y_demo,baseline)),
                'interpretation':'Error against the invented compatibility formula. Not real-world placement accuracy.'}
    metrics={'validation':evaluate(valid)}
    assert metrics['validation']['synthetic_target_mae']<metrics['validation']['mean_target_baseline_mae']
    del valid
    if args.evaluate_test:
        test=load_pairs(root/'model_training'/'test'/'pairs.csv')
        assert not set(test.student_id)&set(train.student_id)
        metrics['test']=evaluate(test);del test
    model_path=output/'model.joblib';joblib.dump(model,model_path,compress=3)
    reloaded=joblib.load(model_path)
    sample=train[FEATURES].iloc[:100]
    assert np.array_equal(model.predict(sample),reloaded.predict(sample))
    metadata={'model_version':'rf-synthetic-demo-v1','synthetic':True,'feature_order':FEATURES,
              'training_source':'Generated synthetic pairs; no real records',
              'target_formula':'.75*subject_fit + .15*overall_norm + .10*same_province',
              'train_students_used':count,'train_pairs_used':len(train),'train_students_available':len(all_ids),
              'selected_student_ids_sha256':hashlib.sha256('\n'.join(sorted(selected)).encode()).hexdigest(),
              'fixed_seed':42,'train_seconds':round(train_seconds,3),'metrics':metrics,
              'versions':{'python':platform.python_version(),'scikit_learn':sklearn.__version__,
                          'numpy':np.__version__,'pandas':pd.__version__,'joblib':joblib.__version__},
              'model_sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),
              'artifact_reload_prediction_check':'PASS',
              'evaluation_scope':'New synthetic students with shared known offer profiles; no unseen-school or real-policy validation.'}
    save_json(output/'metadata.json',metadata)
    def predictor(features):return np.clip(reloaded.predict(pd.DataFrame(features,columns=FEATURES)),0,1)
    for name in ['demo_200','stress_500','large_5000']:
        folder=root/'demo'/name;s=load_csv(folder/'students.csv');o=load_csv(folder/'offers.csv');p=load_csv(folder/'preferences.csv')
        started=time.perf_counter();rows=allocate(s,o,p,True,predictor);runtime=time.perf_counter()-started
        verify_plan(s,o,p,rows,True)
        save_csv(output/f'{name}_model_placements.csv',PLACEMENT_FIELDS,rows)
        summary=allocation_metrics(s,o,rows);summary['allocation_runtime_seconds']=round(runtime,3)
        save_json(output/f'{name}_model_summary.json',summary)
    print(json.dumps({'training_students_used':count,'training_pairs_used':len(train),
                      'model_saved':str(model_path),'metrics':metrics,'reload_check':'PASS'},indent=2))

if __name__=='__main__':main()
