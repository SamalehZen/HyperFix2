# Étape 1 — build de la SPA story mode (React + shadcn/ui)
FROM node:22-alpine AS story-ui
WORKDIR /ui
COPY story-ui/package.json story-ui/package-lock.json ./
RUN npm ci
COPY story-ui ./
RUN npm run build

# Étape 2 — image Python du moteur
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests
COPY --from=story-ui /ui/dist ./story-ui/dist

# Utilisateur non privilégié (uid 1000 = propriétaire des volumes hôte)
RUN useradd --uid 1000 --no-create-home --shell /bin/false gamme \
    && chown -R gamme:gamme /app
USER gamme

EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8010/healthz', timeout=5).status == 200 else 1)"

CMD ["python", "-m", "app.main"]
