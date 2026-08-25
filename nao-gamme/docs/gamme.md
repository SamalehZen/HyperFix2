# Gamme EPICERIE SALEE

Fichier d'export quotidien du logiciel de magasin, déposé dans ce projet sous le nom
`gamme_epicerie_salee.xlsx` (feuille unique `Gamme_Commande`).

## IMPORTANT : pièges de lecture

1. Le fichier contient ~19 600 lignes mais **7 239 lignes sont vides** (résiduelles).
   Filtrer sur `Code` non vide : il y a **12 355 articles réels**.
2. Les en-têtes contiennent des espaces parasites, à utiliser tels quels :
   `Couv. ` (avec espace final) et `Valeur stock   PRMP` (3 espaces internes).
3. Les colonnes `SA` et `SF` ne sont PAS des quantités : ce sont des codes lettrés
   (AC = 12 320 articles, NA, NV, NC, SU). Ne pas les utiliser comme stock.
4. La colonne `Stock` est la vraie quantité en stock.
5. **Toutes les colonnes à apparence numérique sont des VARCHAR** (texte), y compris
   `Stock`, `Marge %`, `Px vente`, `Px achat fac`, `TVA %`, `Couv. `, `Mini cde`,
   `Maxi`, `Incré`, `En cours` et `Valeur stock   PRMP`. Il est OBLIGATOIRE de les
   caster avant toute agrégation :
   `SUM(CAST("Valeur stock   PRMP" AS DOUBLE))`, `AVG(CAST("Marge %" AS DOUBLE))`.
   Sans CAST, DuckDB renvoie une erreur `Binder Error: No function matches the
   given name and argument types 'sum(VARCHAR)'`.

## Requête recommandée

La base DuckDB (`gamme.duckdb`, table `gamme_commande`) se lit via l'outil MCP
`gamme_query` du serveur gamme-engine (SQL en lecture seule, paramètre `rayon`
obligatoire). La table est **déjà filtrée sur le rayon du gestionnaire** : écris
du SQL naturel, sans ajouter `rayon` aux SELECT ni au WHERE. Jamais de chemin de
fichier dans FROM (`FROM '/gamme.duckdb'` est refusé).

```sql
SELECT "Code", "Libellé", "Fournisseur", "Px vente", "Stock"
FROM gamme_commande
WHERE "Stock" <> '0'
LIMIT 20
```

Exemple : répartition par fournisseur du nombre d'articles, du stock et de la marge.

## Articles dormants

Un article est **dormant** quand sa couverture est plafonnée à la valeur
sentinelle **`Couv. ` = 999** : le logiciel de magasin plafonne ainsi les
articles **sans aucune vente récente** (la couverture en jours explose ou est
figée à 999 faute de ventes). Définition stricte : `Couv. ` = 999 exactement,
pas un seuil d'appréciation.

Identification via `gamme_query` (rappel : `Couv. ` est un VARCHAR, CAST
obligatoire — voir piège n°5) :

```sql
SELECT "Code", "Libellé", "Fournisseur", "Stock", "Couv. ",
       CAST("Valeur stock   PRMP" AS DOUBLE) AS valeur_prmp
FROM gamme_commande
WHERE CAST("Couv. " AS INTEGER) = 999
ORDER BY valeur_prmp DESC
```

Interprétation :
- **Dormant avec `Stock` > 0** : capital immobilisé (voir `Valeur stock   PRMP`)
  → candidat au déstockage ou à la sortie d'assortiment. Prioriser par valeur
  PRMP décroissante.
- **Dormant avec `Stock` = 0** : aucun enjeu de stock, ne pas traiter en priorité.

## Analyse du 13/08/2026 (référence historique — fichier xlsx d'origine)

> Chiffres de l'ancien export xlsx (12 355 articles). La base DuckDB actuelle est
> synchronisée au **dernier import** (au 20/08/2026 : 9 403 lignes, rayon
> `frais-surgele`) — les chiffres ci-dessous ne reflètent pas l'état courant.

- 12 355 articles réels, 97 fournisseurs
- 8 659 articles à stock nul (70 %)
- 172 articles à marge négative (vendus sous le prix de revient)
- Marge moyenne : 33,8 % (sur 10 733 articles renseignés)
- Couverture moyenne renseignée : 126,8 jours
- 203 lignes en cours de commande
- Valeur de stock totale (PRMP) : ~40 705 517

## Colonnes utiles

`Code`, `EAN`, `Libellé`, `Fournisseur`, `Px achat fac`, `Px achat tv`, `Px revient`,
`TVA %`, `Quar`, `Assort.`, `Marque`, `Attribut`, `Collection`, `Px vente`, `PV promo`,
`Date Dbt`, `Date fin`, `Marge %`, `Marge Promo %`, `SA` (code), `SF` (code),
`Nb UC/PCB`, `Mini cde`, `Maxi`, `Incré`, `Mode réappr.`, `Couv. ` (jours),
`Stock` (quantité), `Valeur stock   PRMP`, `En cours` (quantité commandée en attente).

## Mapping colonnes Excel → historique (`article_history` via `gamme_history_query`)

L'historique quotidien (SQLite) reprend les mêmes données sous des noms
snake_case sans espaces :

| Excel (gamme_commande) | article_history (gamme_history_query) |
|---|---|
| `Code` | `code` |
| `EAN` | `ean` |
| `Libellé` | `libelle` |
| `Fournisseur` | `fournisseur` |
| `Marque` | `marque` |
| `Stock` | `stock` |
| `Valeur stock   PRMP` | `valeur_stock_prmp` |
| `Couv. ` | `couv` |
| `Px vente` | `px_vente` |
| `PV promo` | `pv_promo` |
| `Date Dbt` | `date_dbt` |
| `Date fin` | `date_fin` |
| `Marge %` | `marge_pct` |
| `Marge Promo %` | `marge_promo_pct` |
| `Px achat fac` | `px_achat_fac` |
| `Px achat tv` | `px_achat_tv` |
| `Px revient` | `px_revient` |
| `TVA %` | `tva` |
| `Mini cde` | `mini_cde` |
| `Maxi` | `maxi` |
| `Incré` | `incre` |
| `En cours` | `en_cours` |

## Promotions

Colonnes promo : `PV promo` (prix de vente promotionnel, FDJ), `Date Dbt` /
`Date fin` (période de promo, format JJ/MM/AAAA), `Marge Promo %` (marge
pendant la promo, peut être négative = vendu à perte). Une promo est
**active** à une date D quand `date_dbt <= D <= date_fin`.

Dans `article_history` (via `gamme_history_query`), les dates sont stockées
JJ/MM/AAAA : pour comparer, réordonner avec `substr` :

```sql
-- Articles en promo active au 20/08/2026, triés par perte de marge
SELECT code, libelle, pv_promo, px_vente, marge_pct, marge_promo_pct
FROM article_history
WHERE pv_promo <> ''
  AND substr(date_dbt,7,4)||substr(date_dbt,4,2)||substr(date_dbt,1,2) <= '20260820'
  AND substr(date_fin,7,4)||substr(date_fin,4,2)||substr(date_fin,1,2) >= '20260820'
ORDER BY CAST(marge_promo_pct AS DOUBLE) ASC
```

```sql
-- Promos qui expirent dans les 7 jours suivant le 20/08/2026
SELECT code, libelle, pv_promo, date_fin
FROM article_history
WHERE pv_promo <> ''
  AND substr(date_fin,7,4)||substr(date_fin,4,2)||substr(date_fin,1,2)
      BETWEEN '20260820' AND '20260827'
ORDER BY date_fin
```

Impact marge : comparer `marge_pct` (marge normale) et `marge_promo_pct`
(marge en promo) — un écart très négatif = brading à perte pendant la promo.