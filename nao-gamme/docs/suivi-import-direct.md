# Suivi d'import en direct — plan de travail (à faire plus tard)

Date de rédaction : 2026-09-17. Contexte : HyperFix prod (nao uniquement),
moteur gamme-engine, rayon frais-surgele (+ epicerie-salee).

## 1. Objectif

Pendant les 2 à 5 min d'un import, l'utilisateur peut :
- poser d'autres questions à Luna (déjà possible : watcher = thread séparé),
- **voir où en est l'import et quand il sera terminé** (à construire).

## 2. État actuel (vérifié le 2026-09-17)

- Le pipeline (`gamme-engine/app/pipeline.py`) ne trace que démarré/terminé.
  Aucune progression par étape, aucune ETA.
- Table `imports` : statuts `ok` / `erreur` / `baseline`, `resume_json` dans
  `rapports` (peut stocker les durées par étape).
- 40 imports en base = historique suffisant pour calibrer une ETA.
- `/api/status` existe (JWT) mais aucune UI ne le consomme.
- Telegram : `alerts.send_telegram()` existe MAIS `TELEGRAM_BOT_TOKEN` vide
  dans `nao-gamme/.env` → à renseigner pour toute option Telegram.

## 3. Décisions en suspens (réponses utilisateur attendues)

- [ ] Surfaces : A. Telegram live / B. Chat Luna / C. Page écran (choix multiples)
- [ ] Ordre : 1. Chat+Telegram d'abord / 2. Page live d'abord / 3. Tout ensemble

## 4. Conception — couche moteur (commune aux 3 surfaces)

1. Table `import_progress` (ou colonnes sur `imports`) :
   `import_id, etape, pct, started_at, updated_at`.
2. Le pipeline écrit son étape à chaque phase :
   `reception → validation → analyse → IA x/40 → duckdb → rapport`.
3. Durée de chaque étape stockée dans `rapports.resume_json`.
4. Endpoint `GET /api/import/progress` (décider : public vs JWT) ou SSE.
5. ETA = moyennes glissantes par étape → s'affine à chaque import.

## 5. Conception — surfaces

- **A. Luna raconte** : outil MCP/skill lisant la progression → réponse
  « ⏳ IA 25/40, terminé vers 08h42 ». Effort léger, pas de nouvelle page.
- **B. Page live** : polling 3 s (ou SSE), barre + timeline 6 étapes ✓/⏳,
  ETA, historique du jour. Effet visuel max, effort moyen.
- **C. Telegram live** : 🚀 démarré → ⏳ mi-parcours → ✅ terminé + durée.
  Léger, nécessite le token bot.

## 6. Lots de réalisation proposés

- Lot 1 (recommandé) : couche moteur + A + C.
- Lot 2 : B (page live).
- (Si « tout ensemble » : lots 1+2 d'un coup.)

## 7. Critères d'acceptation

- [ ] Déposer un fichier test → progression visible < 10 s après dépôt.
- [ ] ETA affichée, écart final < ±60 s sur 3 imports de suite.
- [ ] Import en erreur → surface affiche l'erreur + alerte (pas de faux vert).
- [ ] Import coincé > 10 min à une étape → alerte « coincé à l'étape X ».
- [ ] Questions Luna pendant l'import : réponses normales (non-régression).
- [ ] Aucun secret exposé (endpoint progress sans fuite de données).

## 8. Risques / points d'attention

- Écritures progression fréquentes → utiliser connexion courte / table dédiée
  (ne pas ralentir l'import).
- Endpoint public = fuite d'infos métier → préférer JWT ou jeton lecture seule.
- L'IA reste la part variable de l'ETA (dépend du fournisseur LLM du jour).
