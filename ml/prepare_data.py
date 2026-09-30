"""Rebuild the large training-pair files that are kept out of git (~130 MB).

The dataset generator is deterministic (seed 20260930), so regenerating reproduces the original
pairs.csv files byte-for-byte. Each file is verified against the SHA-256 in manifest.json.

Usage:  python ml/prepare_data.py            # only rebuilds missing / mismatching files
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'EduMatch_AI_Synthetic_Data'
SPLITS = ['train', 'validation', 'test']


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def main():
    manifest = {f['path']: f['sha256'] for f in json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))['files']}
    targets = {s: DATA / 'model_training' / s / 'pairs.csv' for s in SPLITS}
    expected = {s: manifest[f'model_training/{s}/pairs.csv'] for s in SPLITS}
    todo = [s for s, p in targets.items() if not p.exists() or sha256(p) != expected[s]]
    if not todo:
        print('Training pairs present and verified.'); return
    print(f'Regenerating pairs for: {", ".join(todo)} (about 30 s)...', flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(DATA / 'tools' / 'generate_data.py'), '--output', tmp], check=True,
                       stdout=subprocess.DEVNULL)
        for s in todo:
            built = Path(tmp) / 'model_training' / s / 'pairs.csv'
            if sha256(built) != expected[s]:
                sys.exit(f'{s}: regenerated file does not match manifest checksum; refusing to use it.')
            shutil.copyfile(built, targets[s])
            print(f'  {s}: verified {expected[s][:12]}...')
    print('Done.')


if __name__ == '__main__':
    main()
