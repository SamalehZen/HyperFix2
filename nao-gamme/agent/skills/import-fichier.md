---
name: import-fichier
description: "Importe un fichier de gamme déposé dans le chat (.xlsx, .xlsm, .csv) et présente le résumé. Se déclenche quand l'utilisateur dépose un fichier de gamme/commande dans le chat, ou demande « importe le fichier », « nouvelle commande », « traite ce fichier », « fais l'import du jour »."
---

# Import d'un fichier de gamme

Traite l'import d'un fichier de gamme déposé dans le chat, en un seul passage : `gamme_mon_rayon` puis `gamme_import_file`, puis le résumé imposé. Aucune étape d'exploration.

## Étapes (ordre strict)

1. **`gamme_mon_rayon`** → rayon autorisé de l'utilisateur connecté (seule source de vérité, jamais deviné ni demandé).
2. **`gamme_import_file`** avec :
   - `path` = le chemin du fichier **tel qu'indiqué** par l'utilisateur (commence par `/home/uploads/...` ou `/app/storage/...`)
   - `rayon` = celui de l'étape 1
3. Selon le résultat :

### Si le fichier est accepté
Présenter dans l'ordre :
```
✅ Import du <jour> — <rayon>

Nouveaux négatifs : X
Persistants : Y
Corrigés : Z
Anomalies : N
Compensateurs : M trouvés · K sans résultat

📈 Dashboard : https://lololo.hypeer.cloud/story/?jour=<jour>&rayon=<rayon>

3 actions prioritaires :
1. <réassort / compensateur>
2. <action fournisseur>
3. <autre>
```

### Si le fichier est rejeté
- Expliquer l'erreur simplement (colonne manquante, doublons de codes, format, mauvais rayon…).
- Proposer une correction concrète.
- Ne pas réessayer le même fichier tel quel sans correction.

## Règles

- **Toujours** `gamme_mon_rayon` avant `gamme_import_file` — jamais un rayon deviné, mémorisé, ou fourni par l'utilisateur pour choisir le paramètre.
- « Accès refusé » → expliquer et proposer de contacter l'administrateur ; ne jamais contourner.
- Prix en FDJ, tels quels.
- Ce skill complète RULES.md (section « Import d'un fichier de gamme ») sans le contredire.