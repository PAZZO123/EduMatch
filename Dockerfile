# EduMatch AI — one container: FastAPI serves the API at /api and the built React app at /.
# Works on Hugging Face Spaces (port 7860) and Render/Koyeb/Railway (they set $PORT).

# ---- 1. Build the frontend ----
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. Backend + models + demo fixtures ----
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# Hugging Face Spaces runs containers as uid 1000.
RUN useradd -m -u 1000 user
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY --chown=user backend/app backend/app
COPY --chown=user ml/models ml/models
# Only the fixtures the app reads at runtime (seed cohorts, scenarios, acceptance-test inputs).
COPY --chown=user EduMatch_AI_Synthetic_Data/demo EduMatch_AI_Synthetic_Data/demo
COPY --chown=user EduMatch_AI_Synthetic_Data/scenarios EduMatch_AI_Synthetic_Data/scenarios
COPY --chown=user EduMatch_AI_Synthetic_Data/invalid_inputs EduMatch_AI_Synthetic_Data/invalid_inputs
COPY --from=web --chown=user /app/dist dist
RUN mkdir -p backend/data && chown user backend/data

USER user

# Secrets (EDUMATCH_SECRET_KEY, EDUMATCH_ADMIN_PASSWORD, EDUMATCH_OFFICER_PASSWORD) come from the host's
# secret settings, never from the image. The SQLite file lives in the container, so free hosts reset it on
# restart; the demo cohort is re-seeded automatically.
ENV EDUMATCH_ENVIRONMENT=production \
    EDUMATCH_COOKIE_SECURE=true \
    EDUMATCH_AUTO_SEED_FIXTURE=demo_200

EXPOSE 7860
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --app-dir backend --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers --forwarded-allow-ips='*'"]
