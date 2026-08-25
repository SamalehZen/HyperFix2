---
name: recap-rayon
description: "Fait le point quotidien / état des lieux / résumé du rayon de l'utilisateur connecté. Se déclenche quand l'utilisateur demande « fais le point », « état du rayon », « résumé du jour », « comment va mon rayon », « top négatifs », « ruptures », « anomalies du jour », « qu'est-ce qui ne va pas aujourd'hui », ou toute demande de synthèse de l'activité de son rayon (stock négatif, anomalies, actions prioritaires)."
---

# Récap du rayon

Réponds à la demande de point quotidien sur le rayon de l'utilisateur connecté, en un seul passage : un appel à `gamme_mon_rayon`, puis deux appels de données, puis la réponse structurée ci-dessous. Pas d'exploration, pas d'étapes inutiles.

## Étapes (ordre strict)

1. **`gamme_mon_rayon`** → récupère le rayon autorisé de l'utilisateur connecté. C'est la seule source de vérité : ne jamais deviner, mémoriser ou demander le rayon à l'utilisateur.
2. **`gamme_negatifs`** (paramètre `rayon` = celui de l'étape 1) → stocks négatifs du jour, enrichis : chaque négatif porte `libelle`, `fournisseur`, `marque`, `px_revient`, `px_vente`, `couv` et `valeur_prmp` (capital bloqué = |stock_j × px_revient|, FDJ).
3. **`gamme_anomalies`** (paramètre `rayon` = celui de l'étape 1) → anomalies du jour.
4. Rédige la réponse selon le format ci-dessous, sans autre appel d'outil.

## Format de réponse (à respecter tel quel)

```
📊 <Constat clé chiffré en 1 phrase> (ex. « 12 articles négatifs dont 3 nouveaux »)

Négatifs : X nouveaux · Y persistants · Z corrigés

🔴 Top prioritaires (max 3) :
• #<code> <libellé> — stock <n> · capital bloqué <valeur_prmp> FDJ

⚠️ Anomalies du jour (max 5) :
• <type> #<code> <libellé> — <valeur>

✅ 3 actions prioritaires :
1. <action de réassort / compensateur>
2. <action fournisseur / article à surveiller>
3. <autre>

📈 Dashboard : https://lololo.hypeer.cloud/story/?jour=<jour>&rayon=<rayon>
```

## Règles

- Prix en FDJ, tels quels (jamais diviser, convertir, ni parler d'euros).
- Si `gamme_mon_rayon` renvoie « Accès refusé » ou aucun rayon : expliquer simplement que le compte n'a pas accès et proposer de contacter l'administrateur. Ne jamais réessayer avec un autre rayon.
- Si l'utilisateur a salué sans demander de données (« salut », « merci ») : répondre chaleureusement **sans appeler d'outil**.
- Terminer par la prochaine action conseillée quand il y a un constat.