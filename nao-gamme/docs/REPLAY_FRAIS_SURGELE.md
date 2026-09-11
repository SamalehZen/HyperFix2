# Replay frais-surgele — suivi des 15 fichiers (tous frais-surgele)

> Rayon : `frais-surgele` uniquement — les 3 fichiers ci-dessous en font partie.
> Feuille attendue : `Gamme_Commande` — date extraite du nom via `YYYY-MM-DD` (`pipeline.jour_from_filename`).
> Exemple : `Gamme_Commande - 2026-08-25 MATIN.xlsx` → jour `2026-08-25` (`MATIN` ignoré).
> Ordre de rejeu obligatoire : du plus vieux au plus récent, `MATIN` avant `SOIR` le même jour.
> 1er import rejoué = `baseline` auto (pas de J-1), suivants = comparaison J/J-1.

## Confirmés présents dans /root le 2026-09-10 (3/15) — REJOUÉS EN PROD LE 2026-09-10 ✅

| # | Jour | Fichier | Taille | SHA256 | Statut rejeu |
|---|------|---------|--------|--------|--------------|
| 1 | 2026-08-19 | `Gamme_Commande - 2026-08-19 MATIN.xlsx` | 1.6M | `53f93e3f...3178e` | [x] importé (baseline, 9380 articles, 4 négatifs) |
| 2 | 2026-08-20 | `Gamme_Commande - 2026-08-20 MATIN.xlsx` | 1.6M | `036d743f...02b194` | [x] importé (9403 articles, 4 nouveaux / 2 persistants / 2 corrigés, 245 anomalies, 6 compensateurs Luna) |
| 3 | 2026-08-25 | `Gamme_Commande - 2026-08-25 MATIN.xlsx` | 1.6M | `92e51a16...956caf9` | [x] importé (9432 articles, 14 nouveaux / 6 corrigés, 269 anomalies, 14 compensateurs Luna) |

## Manquants — tous frais-surgele (12/15, noms exacts à compléter)

| # | Jour | Fichier | Statut |
|---|------|---------|--------|
| 4 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 5 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 6 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 7 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 8 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 9 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 10 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 11 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 12 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 13 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 14 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |
| 15 | ????-??-?? | `à compléter.xlsx` | [ ] manquant |

> Quand les 12 arrivent : les renommer au format `Gamme_Commande - YYYY-MM-DD MATIN.xlsx`
> (ou `SOIR`), vérifier qu'ils ne sont pas déjà dans les 3 ci-dessus (comparer SHA256),
> puis les insérer dans le tableau par date.

## Règles rejeu (moteur actuel)

1. Trier par date, `MATIN` avant `SOIR` même jour. Deux fichiers même jour = même `jour`,
   le 2e compare au 1er intra-jour — OK, garder l'ordre.
2. Déposer un par un dans `depot/frais-surgele/` (watcher 60 s) OU via MCP
   `gamme_import_file(path, rayon="frais-surgele")`. Ne jamais relancer le même fichier
   (dédoublonnage par hash SHA256 → `deja_importe`).
3. Attendre entre chaque : fichier retiré du dépôt + `GET /api/status` → `ok`,
   puis `GET /story-data/jours?rayon=frais-surgele` montre le nouveau jour.
4. Refus possibles : feuille ≠ `Gamme_Commande`, colonnes manquantes, `Code` non numérique,
   codes en doublon → déplacé vers `depot/frais-surgele/erreurs/` + alerte Telegram.
5. Plafond LLM : `GAMME_MAX_LLM_ARTICLES=40` négatifs analysés par import, lots de 8.
   Sans LLM l'import réussit quand même (fallback heuristique confiance `faible`).

## Provider LLM verrouillé le 2026-09-10

* Base unique : `https://api.experientiallabs.ai/v1`
* Défaut partout : `gpt-5.6-luna` (gratuit `cost 0.0`, testé OK à `max_tokens>=4000`,
  vide à `max_tokens=50` — le moteur appelle à `8192` + retry x2, donc OK).
* Repli gratuit : `deepseek-v4-flash` (gratuit, testé OK même à petit budget,
  accepte `thinking.disabled` sans `400`).
* `gemini-2.5-flash-lite` à éviter : `insufficient_quota, model_requires_purchase`.
* Clé `xpl_...` uniquement dans `.env` (gitignoré), jamais committée.
