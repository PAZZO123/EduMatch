#!/usr/bin/env bash
# Publish EduMatch AI to a Hugging Face Docker Space.
#
#   bash deploy/push_to_hf.sh <hf-username>/<space-name>
#
# Sends a fresh snapshot of the last commit (HEAD) with only the files the app needs at runtime.
# Binary files go through Git LFS, which Hugging Face requires. The GitHub history is not touched.
# Git asks for your Hugging Face username and an access token with "write" permission.
set -euo pipefail

SPACE="${1:?usage: bash deploy/push_to_hf.sh <hf-username>/<space-name>}"
ROOT="$(git rev-parse --show-toplevel)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT"
if [ -n "$(git status --porcelain -- backend/app src ml/models Dockerfile)" ]; then
  echo "Note: uncommitted changes are NOT deployed; only the last commit is." >&2
fi

git archive HEAD \
  Dockerfile .dockerignore package.json package-lock.json index.html vite.config.ts tsconfig.json \
  public src backend/app backend/requirements.txt ml/models \
  EduMatch_AI_Synthetic_Data/demo EduMatch_AI_Synthetic_Data/scenarios EduMatch_AI_Synthetic_Data/invalid_inputs \
  | tar -x -C "$OUT"
cp deploy/huggingface/README.md "$OUT/README.md"

NAME="$(git config user.name)"
EMAIL="$(git config user.email)"
VERSION="$(git rev-parse --short HEAD)"

cd "$OUT"
git init -q -b main
git lfs install --local >/dev/null
git lfs track '*.joblib' '*.png' '*.jpg' '*.jpeg' '*.ico' '*.webp' >/dev/null
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Deploy EduMatch AI $VERSION"
# schannel = use the Windows certificate store (plain OpenSSL fails on this network).
git -c http.sslBackend=schannel push --force "https://huggingface.co/spaces/$SPACE" main

echo
echo "Pushed $VERSION. Build log: https://huggingface.co/spaces/$SPACE?logs=build"
echo "App URL:             https://${SPACE/\//-}.hf.space"
