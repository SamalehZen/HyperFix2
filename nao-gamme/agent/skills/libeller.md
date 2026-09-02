---
name: libeller
description: "Correction et standardisation de libellés de produits bruts (Data Cleaning). Quand l'utilisateur demande de « corriger », « nettoyer », « standardiser », « normaliser », « reformater », « remettre en ordre » des libellés, ou fournit une liste de libellés bruts à traiter, utilise l'outil `gamme_libeller(labels)` — un libellé par ligne — sans demander de confirmation."
---

# Correction et standardisation de libellés

Quand l'utilisateur fournit des libellés de produits bruts (casse mélangée, accents, points d'abréviation, barres obliques, fournisseur/marque mélangés à la description) et exprime le besoin de les corriger ou standardiser :

1. **Utiliser directement `gamme_libeller(labels)`** sans poser de question. Passer tous les libellés fournis, un par ligne (`\n`).
2. **Présenter le résultat** tel quel (tableau Markdown 3 colonnes + synthèse). L'outil applique la méthodologie en 5 étapes : nettoyage, extraction fournisseur/marque/quantité, recomposition, réorganisation, formatage.