---
name: export-historique
description: "Exporte l'historique multi-jours d'articles vers un fichier Excel/CSV téléchargeable dans le chat. Se déclenche quand l'utilisateur demande un export, un fichier Excel/CSV, l'évolution complète d'une sélection d'articles (ex. tous les OEUF/EGG), avec téléchargement."
---

# Export historique multi-jours

## Aiguillage (lire d'abord)

- Demande **simple** (tout l'historique vertical, sans transformation) → cet outil
  `gamme_history_export` (étapes ci-dessous).
- Demande **intelligente** (une ligne par article, dates en colonnes, baisses à
  détecter/classer, couleurs, tris, résumé, « refais-moi ça autrement ») →
  **skill `excel-intelligent`** + outil `gamme_excel_intelligent`. Ne jamais
  bricoler un tableau vertical quand un pivot est demandé.

## Étapes (ordre strict)

1. **`gamme_mon_rayon`** → rayon autorisé (seule source de vérité, jamais deviné).
2. **`gamme_history_export`** avec `rayon` + `mots_cles` (ex. `OEUF,EGG`), `date_debut`/`date_fin` seulement si l'utilisateur donne une période, `format` (`xlsx` par défaut, `csv` si demandé).
3. Annoncer les **chiffres réels** renvoyés (`nb_jours`, `nb_articles`, `nb_lignes`) + lien cliquable `url`. Si `partiel: true`, le dire + proposer l'export par périodes.
4. Ajouter un **tableau d'aperçu** (top 20 lignes via `display_chart` `table`) pour que le chat offre le téléchargement direct CSV/Excel.
5. Ne jamais dire que l'export est impossible si des imports existent. Ne jamais inventer de chiffres.

## Format de réponse

```
Export terminé : <nb_jours> jours importés, <nb_articles> articles et <nb_lignes> lignes.
Le fichier contient le stock, les prix (FDJ), la marge et la couverture par article et par jour.

[Télécharger le fichier Excel](<url>)
```
