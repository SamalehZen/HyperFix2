---
name: recap-rayon
description: "Récap complet et premium du rayon : 5 graphiques fixes dans le chat puis UNE seule Story à 5 onglets mise à jour sur place. Se déclenche quand l'utilisateur demande « récap », « récap du jour », « fais le point », « état du rayon », « résumé du jour », « story du jour » ou « version 9 story » (insensible à la casse et aux accents). Génère TOUJOURS le récap chat complet PUIS la Story automatiquement."
---

# Récap du rayon — premium (chat + UNE seule Story)

Quand un trigger est détecté, exécute **Phase A (chat, 5 graphiques) puis Phase B (UNE seule Story, mise à jour sur place)**. Jamais l'une sans l'autre. Jamais de chiffres inventés : tout vient des outils MCP.

Triggers (matcher en minuscules, sans accents) : `recap`, `recap du jour`, `fais le point`, `etat du rayon`, `resume du jour`, `story du jour`, `version 9 story`.

## 1. Sécurité et rayon

- Commence toujours par appeler `gamme_mon_rayon`.
- Utilise uniquement le ou les rayons autorisés par le compte. Ne demande jamais le rayon si le serveur peut l'identifier. Ne devine jamais un rayon.
- Utilise les outils MCP adaptés : `gamme_serie` (évolution historique), `gamme_negatifs` (stocks négatifs), `gamme_anomalies` (anomalies), `gamme_rapports` (résumés d'import). Compléments si besoin : `gamme_history_query` (promos actives, dormants valorisés), `gamme_query` (snapshot). Ne jamais itérer jour par jour : `gamme_serie` couvre tout l'historique en un appel.
- Les chiffres viennent toujours des données retournées par les outils. N'invente aucun chiffre.
- Montants en FDJ : ne jamais convertir en euros. Citer les codes articles et les chiffres précis.
- Si `gamme_mon_rayon` = « Accès refusé » ou aucun rayon : expliquer simplement + proposer de contacter l'administrateur. Ne jamais réessayer avec un autre rayon.
- Salutation sans demande (« salut », « merci ») : répondre chaleureusement **sans appeler d'outil**.
- Total négatifs du jour = nouveaux + persistants (jamais les seuls nouveaux).

## 2. Phase A — les 5 graphiques du chat (OBLIGATOIRES, AVANT la Story)

**Règle dure : aucun contournement.** Les 5 `display_chart` passent AVANT tout appel `story`. Après chaque graphique, écrire son court paragraphe d'interprétation. Interdiction de créer la Story sans les 5 charts réussis : en cas d'erreur outil, corriger les paramètres et relancer le chart, jamais le sauter. Les `table` ne comptent pas comme graphiques (invisibles en image sur Telegram) : ce sont des compléments texte.

Pont `VALUES` : recopier les chiffres MCP dans `execute_sql` (`duckdb_local`) avec des listes `VALUES` → **5 `query_id` minimum** (évolution, capital, top articles, anomalies, santé stock). Seule exception à l'interdiction `execute_sql` sur la gamme : jamais de `read_xlsx`, `ATTACH`, ni chemin de fichier.

Exemples :
- `SELECT * FROM (VALUES ('2026-09-01',12,3,9),('2026-09-02',10,1,9)) AS t(jour,negatifs,nouveaux,persistants)`
- `SELECT * FROM (VALUES ('2026-09-01',41445.0,0.0)) AS t(jour,prmp_negatif,prmp_corrige)`
- `SELECT * FROM (VALUES (116740,'Emmental rape 200g',12500.0)) AS t(code,libelle,valeur_prmp)`
- `SELECT * FROM (VALUES ('marge_negative',5),('chute_forte',1)) AS t(type,nb)`
- `SELECT * FROM (VALUES ('2026-09-01',3600,128,138)) AS t(jour,en_stock,stock_bas,dormants)`

**Les 5 graphiques FIXES (params exacts, ne pas improviser d'autres types) :**

1. `line`, titre « Négatifs — tendance » : `x_axis_type: date`, `x_axis_key: jour`, séries `negatifs` couleur `#DC2626` label « Négatifs », `nouveaux` `#F59E0B` label « Nouveaux », `persistants` `#2563EB` label « Persistants », `hide_total: true`. Interprétation : évolution, pic du jour, J/J-1.
2. `area`, titre « Capital PRMP bloqué vs récupéré (FDJ) » : `x_axis_type: date`, `x_axis_key: jour`, séries `prmp_negatif` `#DC2626` label « Bloqué (FDJ) » avec `value_format {d3_format:",.0f", suffix:" FDJ"}`, `prmp_corrige` `#16A34A` label « Récupéré (FDJ) » même format.
3. `donut`, titre « Anomalies par type » : `x_axis_type: category`, `x_axis_key: type`, **une seule série** `nb` label « Articles », `show_data_labels: true`.
4. `bar`, titre « Top capital PRMP par article (FDJ) » : `x_axis_type: category`, `x_axis_key: libelle`, série `valeur_prmp` couleur `#DC2626` label « Capital (FDJ) » avec `value_format {d3_format:",.0f", suffix:" FDJ"}`, `show_data_labels: true`, données triées par valeur PRMP décroissante (top 8). NOTE : le cahier demande `horizontal_bar`, qui **n'existe pas dans nao** (types valides : bar, line, area, mixed, pie, donut, kpi_card...) → utiliser `bar` vertical avec les mêmes règles (tri décroissant, rouge, FDJ, titre court).
5. `bar`, titre « Santé stock — en stock / bas / dormants » : `x_axis_type: date` (ou `category` si un seul jour), `x_axis_key: jour`, séries `en_stock` `#2563EB`, `stock_bas` `#F59E0B` label « Stock bas ≤7j », `dormants` `#8B5CF6`, `hide_total: true`.

Texte après chaque graphique : 2-3 phrases (chiffre clé + ce que ça veut dire) par défaut ; version longue (constat + cause possible + action) si nouveau critique, gros capital PRMP, chute forte, marge très négative, anomalie grave. Citer codes + chiffres, noter « J/J-1 : … » quand dispo. Même sur Telegram : les 5 graphiques sont envoyés (tableaux lourds en version compacte top 5, complet dans la Story).

## 3. Phase B — UNE seule Story à 5 onglets (mise à jour sur place)

**Story unique par rayon : slug fixe SANS date `recap-<rayon>`** (ex. `recap-epicerie-salee`). La date va dans `title` (`Récap Épicerie salée — <jour>`) et dans le contenu, jamais dans le slug. Premier récap : `action:create`. Récaps suivants : si erreur `already exists`, **`action:replace`** avec le contenu complet (jamais `update` par bouts, jamais de nouveau slug, jamais 2 stories pour le même rayon). L'historique des versions côté moteur est normal, mais il n'y a qu'**une Story visible**, toujours complète et fraîche.

**N'utiliser QUE des `query_id` créés dans CETTE conversation.** Toute la Story organisée uniquement avec des balises `<tab title="...">...</tab>`. Ne mettre aucun contenu en dehors des onglets. Balises `<chart ... />` et `<table ... />` self-closing. `<grid cols="2">` pour côte à côte. Titres exacts des 5 onglets : `🎯 Dashboard`, `🚨 Alertes & ruptures`, `💰 Marges & capital`, `🛠️ Plan d'action 48 h`, `📊 Lecture direction`.

### Onglet 🎯 Dashboard

```
<tab title="🎯 Dashboard">
# ⚡ Pilotage [NOM DU RAYON]
### Point opérationnel — [DATE DU DERNIER IMPORT]
[encadré de synthèse : évolution des négatifs, nombre de corrections, principal risque du jour, action prioritaire]
<grid cols="3">[kpi_card Négatifs actifs][kpi_card Articles en stock][kpi_card Articles dormants]</grid>
<grid cols="3">[kpi_card Stock bas ≤7j][kpi_card Articles corrigés][kpi_card Anomalies détectées]</grid>
<grid cols="2">[<chart line tendance négatifs / stock bas / dormants / en stock si lisible>] [<chart donut répartition anomalies>]</grid>
[courte lecture managériale : ce que les graphiques signifient]
</tab>
```

`kpi_card` : disposition alignée (grids), titres courts, formats lisibles, comparaison période précédente quand dispo (`comparison_mode: percentage`, 2+ lignes ordonnées), valeurs sans décimales pour les volumes, unités FDJ pour les montants. Tendance : autant que possible négatifs, stock bas, dormants, en stock si lisible.

### Onglet 🚨 Alertes & ruptures

```
<tab title="🚨 Alertes & ruptures">
# 🚨 Alertes opérationnelles
<table query_id="..." title="Négatifs du dernier import" /> (code, libellé, fournisseur, stock, statut, priorité, valeur PRMP, couverture, variation si dispo — triés Critique > Important > Normal)
### Séquence d'intervention
[à contrôler immédiatement / persistants ou aggravés / récemment corrigés / compensateurs disponibles (code, libellé, couverture, raison de la similarité pour chaque compensateur important) / sans compensateur]
[avertissement : les stocks négatifs peuvent provenir d'un écart d'inventaire, d'une réception non intégrée, d'une démarque non enregistrée, d'un mouvement de stock non rapproché]
</tab>
```

### Onglet 💰 Marges & capital (particulièrement esthétique, clair, agréable)

```
<tab title="💰 Marges & capital">
# 💰 Marge & capital immobilisé
[encadré : montants en FDJ, valeur PRMP = capital associé aux stocks négatifs, objectif = corriger les écarts avant de recommander ou commander]
### Où agir en premier ?
<grid cols="2">[<chart bar capital PRMP par article, tri décroissant, rouge #DC2626, FDJ, titre court>] [<table montants à sécuriser>]</grid>
[lecture : articles qui concentrent le plus de capital]
### Pression du stock
<grid cols="2">[<chart bar stock bas et dormants dans le temps>] [<chart donut répartition anomalies>]</grid>
[diagnostic : nb marges négatives, dormants, stock bas, promos actives si dispo, fortes baisses et hausses si dispo]
| Niveau | Risque | Action |
| P1 — Rouge | Stock négatif à forte valeur | Contrôle inventaire, réception et démarque |
| P2 — Orange | Marge négative | Validation prix et promotions |
| P3 — Violet | Article dormant | Transfert, promotion ou retour |
> Ne pas commander un article dormant avant d'avoir vérifié sa couverture réelle, son stock positif et sa valeur PRMP.
</tab>
```

Palette : rouge risques, orange stock sous tension, violet/bleu dormants, vert uniquement corrections/améliorations. Le graphique capital utilise `bar` (le type `horizontal_bar` n'existe pas dans nao).

### Onglet 🛠️ Plan d'action 48 h

```
<tab title="🛠️ Plan d'action 48 h">
| Priorité | Délai | Action | Critère de réussite |
[lignes : contrôle négatifs critiques, vérification réceptions, rapprochement démarque, activation compensateurs, revue marges négatives, traitement dormants, vérification au prochain import]
[3 KPI de réussite : négatifs critiques à réduire, stock bas à sécuriser, dormants à traiter]
[checklist : écarts contrôlés, réceptions rapprochées, démarque vérifiée, compensateurs activés, prix et promotions revus, dormants classés, résultat vérifié au prochain import]
[clôture : aucun négatif critique non expliqué, marges négatives avec décision, dormants prioritaires avec plan]
</tab>
```

### Onglet 📊 Lecture direction

```
<tab title="📊 Lecture direction">
### Ce qui va mieux (corrections, baisse éventuelle des négatifs, compensateurs trouvés, améliorations vs dernier import)
### Ce qui demande une décision (marges négatives, dormants, stock bas, promotions à risque, fortes baisses)
### Décision recommandée (1. immédiate, 2. sous 24 h, 3. sous 48 h)
### Périmètre et fraîcheur des données (rayon, dernier import, nb articles analysés, dates historiques dispo, limites éventuelles)
[règles : dormant = couverture exactement 999 + stock positif ; négatif actif = stock < 0 ; PRMP en FDJ ; chiffres du dernier import, pas une prévision]
> Le rayon est piloté autour de trois priorités : corriger les négatifs critiques, sécuriser les marges et libérer le capital immobilisé dans les dormants.
</tab>
```

Puis dans le chat : lien Story + `📈 Dashboard : https://gestion.hypeer.cloud/story/dashboard/mix2?jour=<jour>&rayon=<rayon>`.

## 4. Règles graphiques

- Chaque graphique : titre clair + court paragraphe d'interprétation. Grilles pour aligner, onglets pour séparer. Jamais surchargé ni incohérent avec les données.
- Séries temporelles : `line`, `area` ou `bar`. Parts d'un total : `donut` ou `pie` (1 seule série). Comparaisons par article : `bar` vertical (le type `horizontal_bar` n'existe pas dans nao). Indicateurs : `kpi_card`. Tableaux : `table`. Unités et formats corrects (FDJ via `value_format`).
- Jamais de valeurs inventées. Pas de KPI sur colonnes incompatibles. Donnée indisponible → l'écrire clairement (« ND — … »), jamais inventer.
- Chaque graphique (sauf `kpi_card`) exige `x_axis_type` + `x_axis_key` + `series`.

## 5. Style rédactionnel

Professionnel, concis mais détaillé, orienté décision, visuel, adapté au gestionnaire de rayon, compréhensible rapidement, sans explication technique inutile. Titres courts, blocs de lecture, tableaux, graphiques. Impression tableau de bord de direction, pas simple résumé texte.
