---
name: mouvements-jour
description: "Questions sur le film du rayon (ventes, CA encaissé, dormants prouvés, écarts, prix fournisseurs) : 1 chiffre clé + visuel adapté + interprétation. Se déclenche pour CA, top ventes, marge encaissée, dormant, écart, périmé, cession, retour, livraison, prix d'achat, efficacité promo."
---

# Mouvements-jour — le film, pas la photo

## 0. Routage stock vs film (décision obligatoire avant tout appel)

- **Stock/prix actuels** (« stock du 116740 ? », « prix de vente ? », « couv ? ») → outils **gamme** (`gamme_article`, `gamme_query`). Jamais les outils mouvements.
- **Film/ventes/preuves** (« vendu hier ? », « CA ? », « dormants ? », « écarts ? », « qui a bougé côté prix ? ») → outils **mouvements** ci-dessous. Jamais deviner depuis la gamme.

## 1. Collecte (sécurité inchangée)

1. `gamme_mon_rayon` d'abord (seule source de vérité, jamais deviné).
2. L'outil adapté, **1 seul dans 90 % des cas** :
   - Jour (CA, top ventes, marge, familles, démarque, dormants, écarts) → `gamme_mouvements` (jour YYYY-MM-DD, défaut = dernier jour avec mouvements).
   - Évolution/tendance/comparaison de périodes → `gamme_mouvements_serie` (jamais jour par jour ; lire `trous` et les citer si pertinent).
   - Tout sur UN article → `gamme_mouvements_article` (+ `gamme_article` si stock/prix actuels demandés aussi).
3. Budget : question simple = 2 appels (rayon + données) ; avec visuel = 4 appels (`+ execute_sql` pont + `display_chart`) — normal, pas une violation du mode vitesse.

## 2. Règles dures mouvements (prioritaires sur tout raccourci)

1. `Valeur` du fichier = **coût PRMP, jamais du CA**. Le CA vient de `ca` (déjà reconstruit prix promo inclus).
2. `SM` = ventes, batch minuit (ventes du jour J). Le signe vient de `Sens`, pas du type.
3. Dormants : citer le **niveau** (`prouvé` / `partiel` / `estimé`) à chaque fois. **Ne jamais présenter un partiel/estimé comme prouvé.** Faux dormants et cachés à part.
4. Jour sans fichier ≠ 0 vente : si l'outil dit « pas de mouvements », le dire (champ `couverture`/erreur) au lieu d'annoncer 0.
5. Prix en FDJ tels quels. Citer codes articles + chiffres précis du tour courant.

## 3. Format de réponse

1. Première ligne = chiffre clé + constat (ex. « CA 10/09 : 1 848 600 FDJ, marge 30,2 % — au-dessus des 9 derniers jours. »).
2. Visuel selon la grammaire `graphiques-adaptatifs` (aucun nouveau type) :

| Question | Visuel imposé |
|---|---|
| Top ventes / top dormants par capital | `bar` vertical tri décroissant + tableau |
| CA / marge sur la période | `line` (CA) + 2e série marge, `x_axis_type: date` |
| Marge vs coût / part promo | `donut`, 1 seule série |
| Écarts / dormants / prix Δ | `table` + `conditional_formats` (écart → fond `#FECACA`, chevauchement → `#FED7AA`, nouveauté → `#BBF7D0`) |
| 1 chiffre (CA ? marge ? stock vendu ?) | texte seul, sans visuel |

3. 1 phrase d'interprétation après chaque visuel (chiffre + sens + action si constat : ex. « 18792 bloque 520 114 FDJ en couv 999 alors qu'il s'est vendu le 06/09 → sortir du dormant (promo ?) »).
4. Tableaux : top 8-10 lignes dans le chat (complet sur demande). Toujours : prochaine action conseillée quand il y a un constat.
