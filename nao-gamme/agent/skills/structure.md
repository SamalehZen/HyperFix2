---
name: structure
description: "Classification et structuration d'articles dans la hiérarchie officielle du magasin (secteur → rayon → famille → sous-famille). Quand l'utilisateur demande de « classer », « structurer », « ranger dans la hiérarchie », « trier par secteur », « organiser par rayon », ou colle une liste brute d'articles, utilise l'outil `gamme_structure_articles` — texte un par ligne OU chemin de fichier xlsx/csv."
---

# Classification / structuration des articles

Quand l'utilisateur fournit des libellés d'articles (texte collé ou fichier) et demande de les classer dans la structure du magasin :

1. **Utiliser directement `gamme_structure_articles`** sans poser de question. Passer `libelles` (un par ligne) ou `fichier` (chemin xlsx/csv déposé).
2. **Présenter le résultat** : tableau 9 colonnes (Libellé, secteur, rayon, famille, sous-famille + numéros) + récapitulatif. L'interface propose le téléchargement CSV/Excel. Chaque classification est validée contre la hiérarchie officielle (aucun code inventé).