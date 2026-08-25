---
name: excel_read
description: "Référence DuckDB : paramètres de read_xlsx/read_csv et noms de colonnes (header=false). À lire directement si besoin — ne jamais exécuter read_xlsx/read_csv (accès fichier désactivé sur ce serveur)."
---

# Référence DuckDB — read_xlsx / read_csv

> **⚠️ NON EXÉCUTABLE sur ce serveur** : `read_xlsx`, `read_csv` et `read_parquet`
> sont **bloqués** (filesystem désactivé côté nao : « file system operations are
> disabled » ; refusés aussi dans `gamme_query`). Cette page est une **référence
> DuckDB pure** pour comprendre les noms de colonnes et les paramètres — pour les
> données gamme, utiliser `gamme_query` (table `gamme_commande`).

## Paramètres valides de `read_xlsx`

- `sheet` — nom (ou numéro) de la feuille.
- `header` — `true` (défaut) / `false`.
- `all_varchar` — lire toutes les colonnes en texte (utile pour des exports avec
  colonnes mixtes).
- `range` — plage de cellules (ex. `'A1:F100'`).
- `normalize_names` — supprimer espaces/caractères spéciaux des en-têtes.
- `ignore_errors` — ignorer les lignes en erreur.
- `stop_at_empty` — arrêter à la première ligne vide.

**Il n'existe PAS de paramètre `columns` pour `read_xlsx`** : l'utiliser renvoie
`Binder Error: Invalid named parameter "columns" for function read_xlsx`
(vérifié sur DuckDB 1.5.5).

## Noms de colonnes avec `header=false`

Avec `header=false`, les colonnes sont nommées par **coordonnées de feuille de
calcul** : `A1`, `B1`, `C1`, `D1`... (et PAS `column0`/`column1`). Vérifié :
`SELECT * FROM read_xlsx(...) LIMIT 1` renvoie les colonnes `['A1', 'B1', 'C1', ...]`.

Exemple : pour un fichier sans en-tête, `SELECT "A1", "B1" FROM read_xlsx(...,
header=false)` lit les deux premières colonnes.

## Différences `read_csv`

- Mêmes paramètres que `read_xlsx` SAUF `sheet` et `range` (spécifiques xlsx).
- `read_csv` accepte en plus : `delim`, `quote`, `nullstr`, `sample_size`,
  `dateformat`, `compression`, et **`columns`** (STRUCT de types, ex.
  `columns={'a': 'INT', 'b': 'VARCHAR'}`) — ce paramètre EXISTE pour read_csv mais
  PAS pour read_xlsx. Ne pas confondre les deux fonctions.
- `header=false` sur read_csv produit des noms `column0`, `column1`, ... (différent
  de read_xlsx qui produit `A1`, `B1`, ...).