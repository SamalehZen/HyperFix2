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
COPY --from=story-ui /ui/dist ./story-ui/dist

EXPOSE 8010

CMD ["python", "-m", "app.main"]
