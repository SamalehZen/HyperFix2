---
name: graphiques-adaptatifs
description: "Rend le chat intelligent sur les questions de données : ajoute un visuel seulement quand il convient (comparaison, classement, évolution, répartition), jusqu'à 3 visuels max. Se déclenche pour toute question portant sur des données chiffrées de la gamme qui s'y prête : top, classement, évolution, tendance, comparaison, répartition, marges, fournisseurs, stocks."
---

# Graphiques adaptatifs — visuel seulement si adapté (max 3)

## 0. Faut-il un visuel ? (décision obligatoire avant tout appel)

- **Texte seul, SANS visuel** : question sur 1 article, 1 chiffre, 1 prix, salutation, aide, import, étiquettes. Ex. « stock du #116740 ? », « /help ».
- **Visuel adapté** : la question compare, classe, suit une évolution ou répartit. Ex. « top 5 négatifs », « évolution des ruptures », « marges par fournisseur », « quels dormants coûtent le plus ? ».
- **Règle dure** : quand un visuel convient, la séquence `execute_sql` (pont VALUES) → `display_chart` est **obligatoire**, pas optionnelle. **Un tableau seul sans son graphique = réponse incomplète.** En particulier, toute question « top N » (top 5, top 10...) exige son graphique `bar` + son tableau.
- Maximum **1 graphique + 1 tableau** par réponse ; 2e graphique seulement pour un 2e angle vraiment utile ; **jamais plus de 3 visuels**. Le récap premium garde ses propres règles (skill `recap-rayon`).

## 1. Collecte (sécurité inchangée)

1. `gamme_mon_rayon` d'abord (seule source de vérité, jamais deviné).
2. L'outil MCP adapté : `gamme_query` (recherche/liste), `gamme_serie` (évolution), `gamme_negatifs`, `gamme_anomalies`, `gamme_article`, `gamme_history_query` (date passée, promos, dormants).
3. Compter les appels : question simple = 2 appels (rayon + données) ; **avec visuel = 4 appels** (`+ execute_sql` pont + `display_chart`) — c'est normal, pas une violation du mode vitesse.

## 2. Pont VALUES (obligatoire avant chaque graphique)

`display_chart` exige un `query_id` local : recopier les chiffres MCP **exacts** (jamais inventés, jamais arrondis autrement) dans `execute_sql` (`duckdb_local`) avec `SELECT * FROM (VALUES (...)) AS t(...)`. Jamais de `read_xlsx`, `ATTACH`, ni chemin de fichier. Un `query_id` par visuel, créé dans CETTE conversation.

## 3. Choix du visuel (figé — ne pas improviser)

| Question | Type imposé | Params exacts |
|---|---|---|
| Top / classement / par fournisseur / par article | `bar` | `x_axis_type: category`, tri décroissant, `show_data_labels: true`, couleur `#DC2626` si risque/perte, `#16A34A` si positif, `#2563EB` si neutre |
| Évolution / tendance | `line` ou `area` | `x_axis_type: date`, `x_axis_key: jour`, `#DC2626` négatifs, `#F59E0B` tension, `#16A34A` corrections, `hide_total: true` si unités mixtes |
| Répartition / part d'un tout (10 max) | `donut` | `x_axis_type: category`, **exactement 1 série**, `show_data_labels: true` |
| 1 indicateur + comparaison période | `kpi_card` | `comparison_mode: percentage` (2+ lignes ordonnées), volumes sans décimales, FDJ via `value_format {d3_format:",.0f", suffix:" FDJ"}` |
| Détail article par article | `table` | `conditional_formats` : stock<0 → fond `#FECACA`, marge<0 → `#FED7AA`, corrigé → `#BBF7D0`. **Jamais d'emoji rouge/vert dans les données** |
| 2 métriques, 2 échelles | `mixed` | `series_type` + `y_axis: right` par série, `hide_total: true` |

Titres courts et pros. Montants FDJ tels quels (jamais d'euros). Citer codes articles + chiffres précis.

## 4. Interdictions anti-erreur (strict)

- **`horizontal_bar` INTERDIT** : n'existe pas dans nao → échec garanti. Toujours `bar` vertical.
- Chaque graphique (sauf `kpi_card` et `table`) exige `x_axis_type` + `x_axis_key` + `series` + `title`.
- `pie`/`donut` = 1 seule série. `stacked_*` = 2+ séries.
- En cas d'erreur outil : **1 seul retry corrigé**, puis réponse texte avec les chiffres (jamais de boucle, jamais de graphique vide).
- Tableaux : top 8-10 lignes dans le chat (complet sur demande ou en Story).

## 5. Format de réponse

1. Première ligne = réponse clé (chiffre + constat).
2. Le visuel, avec **1 phrase d'interprétation** juste après (chiffre clé + ce que ça veut dire + action si constat important).
3. Tableau compact si détail utile (texte compact sur Telegram : les `table` ne rendent pas d'image, le formatage couleur reste web).
4. Toujours : prochaine action conseillée quand il y a un constat.
