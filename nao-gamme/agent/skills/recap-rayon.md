---
name: recap-rayon
description: "Récap quotidien du rayon en version V2 impressionnante : story avec graphiques, généré à chaque fois. Se déclenche quand l'utilisateur demande « fais le point », « état du rayon », « résumé du jour », « récap du jour », « story du jour », « story mode », « version incroyable / détaillée / V2 », « top négatifs », « ruptures », « anomalies du jour », « qu'est-ce qui ne va pas aujourd'hui », ou toute demande de synthèse de l'activité de son rayon (stock négatif, anomalies, actions prioritaires). Génère TOUJOURS un story avec graphiques, même sans qu'on le demande explicitement."
---

# Récap du rayon — Story V2 (auto, impressionnant)

Chaque récap du jour donne un **story avec graphiques**, sans qu'on ait à le
demander : 5 appels MCP, pont `VALUES` vers `execute_sql`, story de 3 sections
minimum, plan commando 48h.

## Étapes (ordre strict)

1. **`gamme_mon_rayon`** → récupère le rayon autorisé de l'utilisateur connecté. C'est la seule source de vérité : ne jamais deviner, mémoriser ou demander le rayon à l'utilisateur.
2. **En parallèle** : **`gamme_serie`** + **`gamme_negatifs`** + **`gamme_anomalies`** + **`gamme_rapports`** (paramètre `rayon` = celui de l'étape 1). Le jour J = le dernier jour de la série.
3. **Pont `VALUES`** : recopie les chiffres renvoyés par les outils MCP dans `execute_sql` (`duckdb_local`) avec des listes `VALUES` → crée **3 `query_id` minimum** :
   - évolution : `SELECT * FROM (VALUES ('2026-09-01',12,3,9),('2026-09-02',10,1,9)) AS t(jour,negatifs,nouveaux,persistants)`
   - capital bloqué : `SELECT * FROM (VALUES ('2026-09-01',41445.0,0.0)) AS t(jour,prmp_negatif,prmp_corrige)`
   - top : `SELECT * FROM (VALUES (116740,'Emmental râpé 200g',12500.0)) AS t(code,libelle,valeur_prmp)`
   - Seule exception autorisée à l'interdiction `execute_sql` sur la gamme : jamais de `read_xlsx`, `ATTACH`, ni chemin de fichier dans ces requêtes.
4. **Toujours ≥1 graphique 📈** via `display_chart`, puis **`story`** (`action:create`, slug `recap-<rayon>-<jour>`) avec **3 sections minimum**. Chaque section = `<grid>` de 2 graphiques + **1 phrase de lecture**. Choix intelligent du graphique selon les données :
   - série temporelle → `line` (négatifs/nouveaux/persistants, x `jour` type `date`) ou `area` (capital PRMP par jour)
   - catégories → `bar` / `stacked_bar` (nouveaux vs persistants)
   - 2 métriques d'échelles différentes → `mixed`
   - part d'un tout (10 max) → `pie` / `donut` (1 seule série)
   - détail article par article → `table`
   - Chaque graphique (sauf `kpi_card`) exige `x_axis_type` + `x_axis_key` + `series`.
   - **Chaque graphique expliqué** : juste après chaque `display_chart` dans la conversation, écris son explication adaptée — paragraphe court (2-3 phrases : le chiffre clé + ce qu'il veut dire) par défaut ; version longue (constat + cause possible + action) quand les données sont importantes : nouveau négatif critique, gros capital bloqué PRMP, chute forte de stock, marge très négative, anomalie grave. On doit aimer lire la conversation, pas juste voir des graphiques à la chaîne.
5. **Plan d'action commando 48h** : commandes urgentes, compensateurs avec codes (depuis `gamme_negatifs`), marges < -100%, dormants (`couv=999`, depuis la série).
6. Terminer par : `📈 Dashboard : https://lololo.hypeer.cloud/story/dashboard/mix2?jour=<jour>&rayon=<rayon>`

## Règles

- N'utiliser dans le story QUE des `query_id` créés par `execute_sql` dans CETTE conversation.
- Prix en FDJ, tels quels (jamais diviser, convertir, ni parler d'euros).
- Total du jour = nouveaux + persistants (jamais les seuls nouveaux comme total).
- Si `gamme_mon_rayon` renvoie « Accès refusé » ou aucun rayon : expliquer simplement que le compte n'a pas accès et proposer de contacter l'administrateur. Ne jamais réessayer avec un autre rayon.
- Si l'utilisateur a salué sans demander de données (« salut », « merci ») : répondre chaleureusement **sans appeler d'outil**.
- Terminer par la prochaine action conseillée quand il y a un constat.
