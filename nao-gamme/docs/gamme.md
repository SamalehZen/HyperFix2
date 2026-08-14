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
4. La colonne `Stock` est la vraie quantité en stock (numérique).

## Requête recommandée

```sql
WITH articles AS (
  SELECT * FROM read_xlsx('/app/project/gamme_epicerie_salee.xlsx', sheet='Gamme_Commande')
  WHERE "Code" IS NOT NULL
)
SELECT ... FROM articles ...
```

Exemple : répartition par fournisseur du nombre d'articles, du stock et de la marge.

## Analyse du 13/08/2026 (référence)

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