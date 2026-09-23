---
name: excel-intelligent
description: "Excel GAMME prioritaire (gamme, marge, stock, prix, rayon, articles, baisses, hausses, pivot dates en colonnes, couleurs, classements, resume, refaire autrement). A preferer a excel-handling pour TOUTE demande Excel sur la gamme. Outil gamme_excel_intelligent via plan_json (objet JSON en texte, jamais d'arguments plats inventes)."
---

# Excel intelligent (langage naturel → fichier .xlsx prouvé)

## Outil unique : `gamme_excel_intelligent(plan_json, base="zero")`

- **Appel STRICT** : `plan_json` = objet JSON **en texte** (ex.
  `{"rayon":"frais-surgele","indicateur":"marge","selection":"baisses"}`),
  `base` = `"zero"` ou `"dernier"`. **Ne JAMAIS inventer d'arguments plats**
  (`type`, `format`, `pivot`, `mots_cles`...) : l'outil les ignore et le rayon
  transmis hors `plan_json` est perdu.
- `rayon` : **l'id** (`frais-surgele`), jamais le libellé (« Frais surgelé »
  est toléré mais l'id est préféré).
- `gamme_mon_rayon` d'abord (seule source de vérité du rayon, jamais deviné).
- Construire `plan_json` depuis la demande (dictionnaire ci-dessous), appeler l'outil.
- L'outil **vérifie lui-même** le fichier (relit le .xlsx) et renvoie
  `verifications` : ne jamais annoncer « terminé » si une vérification échoue —
  rapporter honnêtement ce qui manque (voir §5).
- `base="dernier"` + `plan_json` partiel = repart du **dernier plan mémorisé**
  fusionné avec les modifications (« refais-moi ça avec le stock » →
  `{"indicateur":"stock"}`, le reste est conservé). Sans `plan_json`,
  `base="dernier"` régénère à l'identique. La mémoire est un seul emplacement
  (dernier fichier), le dire si l'utilisateur parle d'un fichier plus ancien.

## Plan JSON (champs)

```json
{
  "rayon": "frais-surgele",
  "indicateur": "marge",
  "selection": "baisses",
  "seuil_baisse_pts": 5,
  "date_debut": "", "date_fin": "",
  "double_classement": true,
  "couleurs": true, "resume": true,
  "titre": ""
}
```

- Structure LIVREE (toujours) : `Code | Libellé | Fournisseur | Stock |
  Px revient | Px vente | Promo active (oui/non) | Cause | <une colonne par
  date JJ/MM> | Δ pts | Perte valeur`. Valeurs fixes = dernier jour.
  Montants **FDJ**, jamais d'euros.
- `Cause` (marges négatives) : `STRUCTURELLE` = vente < revient ;
  `INCOHERENTE` = marge du fichier < 0 alors que vente >= revient ;
  `PROMO` = promo active ; `DONNEE` = prix manquants ; vide sinon.
  (La marge vient du fichier ; les dates promo sont en JJ/MM/AAAA.)
- Onglets livrés : **« Prios argent »** (top pertes : perte = points perdus ×
  stock présent, TOUJOURS positive ; stock ≤ 0 → 0, pas de capital en jeu)
  + **« Prix à corriger »** (fantômes sans prix en tête, puis chutes)
  + **« Dormants »** (couv 999, capital bloqué) + **« A commander »**
  (stock ≤ 3 et couv < 30) + **« Résumé »** (4 réponses : pertes, dormants,
  ruptures, causes).
- PRIORITE : tri AVANT coupe — chaque onglet garde son top 2000 par son tri
  (les tops mondiaux survivent quel que soit leur code). Totaux annoncés
  (« top 2000 sur 8247 »).

- `indicateur` : `marge` (marge %) | `stock` | `px_vente` | `px_revient`
  | `couv` | `valeur_stock`. Montants **FDJ**, jamais d'euros.
- `selection` : `baisses` (Δ premier→dernier jour ≤ −seuil) | `hausses`
  | `tous` | `negatifs` (stock dernier jour < 0 — ATTENTION : stock, pas marge)
  | `changements_prix` (px_vente a bougé) | `sans_changement`
  | `{"codes":[44774,...]}` | `{"mots":"OEUF,EGG"}` (match libellé)
  | `{"marge_negative_stock_positif": true}` (articles ayant eu ≥1 jour avec
  marge < 0 ET stock > 0 le même jour ; colonnes texte converties, NULL ignorés).
- `seuil_baisse_pts` : défaut 5. « comme l'article 44774 » = baisses de marge,
  seuil 5 (44774 : 31,93 → 10,06 = −21,87 pts le 14/09).
- `date_debut`/`date_fin` : `YYYY-MM-DD`, seulement si période donnée.
  Sinon tout l'historique (en-têtes `JJ/MM` chronologiques).
- `double_classement: true` (défaut) → onglet **« Prios argent »**
  (tri perte = −Δpts × stock, l'argent qui fond d'abord) + onglet
  **« Prix à corriger »** (tri chute en points, erreurs de prix d'abord).
  `false` → un seul onglet « Analyse » trié par chute en points.
- Couleurs (si `couleurs`) : cellule date < date précédente → **rouge** ;
  > → **vert** ; marge négative ou stock négatif → **rouge foncé**.
  Filtres auto + freeze + largeurs + `%` formatés + légende dans Résumé.

## Dictionnaire langage naturel → plan

- « une ligne par article / sans doublons » → pivot dates en colonnes (toujours).
- « colonne par date » → dates en colonnes `JJ/MM` chrono.
- « comme l'article 44774 / pareils » → `selection:"baisses"`,
  `indicateur:"marge"`.
- « fais pareil avec le stock / refais avec marges, stocks et prix » →
  `base:"dernier"`, `plan_json:{"indicateur":"stock"}` (un fichier par
  indicateur ; le dire).
- « garde seulement les baisses / concernés » → `selection:"baisses"`.
- « classe par importance / du plus mauvais au meilleur » →
  `double_classement:true` (les deux tris).
- « mets les baisses en rouge » → `couleurs:true`.
- « ajoute un résumé » → `resume:true`.
- « refais / autrement / change la présentation » → `base:"dernier"` +
  seules les différences dans `plan_json`. La nouvelle instruction remplace
  l'ancienne présentation, sans revenir en arrière.
- « ajoute un onglet » → impossible sans nouvelle donnée : demander laquelle
  (ou proposer le 2e classement / un autre indicateur).
- « excel de ces <N> articles » (liste établie dans la conversation : les 213,
  les négatifs du jour…) → **toujours** `{"codes":[...]}` avec TOUS les codes
  (les recopier depuis le résultat d'outil, jamais de tête, jamais tronqués),
  jamais une chaîne inventée.
- Période nommée (« tout l'historique », « 30/07 au 22/09 »…) → toujours
  `date_debut`/`date_fin` explicites `YYYY-MM-DD` (jamais vide quand une
  période a été dite).
- **Ne JAMAIS inventer de valeur `selection`** : seules existent
  `baisses|hausses|tous|negatifs|changements_prix|sans_changement|{codes}|
  {mots}|{marge_negative_stock_positif}`. Toute autre chaîne est refusée par
  le moteur (échec honnête) — ne pas essayer de deviner, demander ou utiliser
  `{codes}`.
- Marge négative + stock positif le même jour → UNIQUEMENT
  `{"marge_negative_stock_positif": true}` (+ dates). `negatifs` seul = stock
  négatif, jamais la marge.
- `plan_json` limité aux champs du modèle ci-dessus : **jamais** de clés
  `objectif`, `filtres`, `colonnes`, `evolution`, `sortie`, `historique`,
  `livrable` — le moteur les refuse (`filtres`…) ou les ignore en le
  signalant (`cles_ignorees`), et un `{"codes":[...]}` incomplet vaut
  export incomplet.

## Format de réponse

```
Fichier prêt : <nb_articles> articles, <nb_jours> jours (<début> → <fin>).
Top perte : <code> <libellé> (<perte>).
Plus grosse chute : <code> <libellé> (<delta> pts).

[Télécharger le fichier Excel](<url>)
```

- Annoncer les **chiffres réels** renvoyés. Si `partiel:true`, le dire +
  proposer une période ou un filtre (ne jamais présenter une liste partielle
  comme complète).
- Si `success:false` : expliquer ce qui manque et proposer une alternative
  (période plus courte, autre sélection). Ne jamais bricoler un tableau dans
  le chat à la place du fichier.
