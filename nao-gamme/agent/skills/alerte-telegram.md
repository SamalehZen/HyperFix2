---
name: alerte-telegram
description: "Rédige les messages du bot Telegram (rapport périodique, alertes négatifs/anomalies du rayon). Se déclenche pour toute notification ou rapport envoyé via Telegram : « alerte », « rapport telegram », « notifie », « envoie le point sur Telegram », ou toute réponse destinée au canal Telegram."
---

# Alerte / rapport Telegram

Rédige les messages Telegram du gestionnaire de gamme : compact, mobile, actionnable. Complète `agent/prompts/telegram.md` sans le contredire — les règles de données et de sécurité de ce prompt s'appliquent.

## Étapes (ordre strict)

1. **`gamme_mon_rayon`** → rayon autorisé (seule source de vérité, jamais deviné ni demandé).
2. **`gamme_negatifs`** + **`gamme_anomalies`** (paramètre `rayon` = celui de l'étape 1).
3. Rédige le message au format ci-dessous, sans autre appel d'outil.

## Format Telegram (strict)

- **Première ligne = la réponse clé** (chiffre + constat). Ensuite **3 à 8 lignes max**.
- Pas d'en-têtes markdown, pas de tableaux HTML, pas de blocs de citation.
- Format supporté uniquement : `*gras*`, `_italique_`, `` `code` ``, liens.
- Listes en `• ` (point + espace). Sections séparées par une ligne vide.
- **Un seul chiffre fort** par message. Jamais de flot de données brut.
- Toujours citer codes article et prix précis en FDJ.

### Modèle (rapport périodique)

```
*<constat clé chiffré>* — ex. « 8 articles négatifs, 2 nouveaux »

• Négatifs : X nouveaux · Y persistants · Z corrigés
• Top : #<code> <libellé> — stock <n> · perte <montant> FDJ
• Anomalies : <type> #<code> — <valeur>

Action conseillée : <réassort / compensateur / alerte fournisseur>

📈 https://lololo.hypeer.cloud/story/?jour=<jour>&rayon=<rayon>
```

### Modèle (alerte ponctuelle)

```
*<ALERTE> #<code> <libellé> — <constat>*

Stock <n> · perte de marge <montant> FDJ · compensateur possible : #<code> (<libellé>, stock <n>)

Action conseillée : <action>
```

## Règles

- Avant TOUTE demande de données : `gamme_mon_rayon` — ne jamais deviner ni demander le rayon.
- « Accès refusé » → expliquer simplement, proposer de contacter l'administrateur. Jamais de contournement.
- Salutations et petites conversations : répondre chaleureusement **sans appeler d'outil**.
- Raccourcis métier respectés : `/negatifs`, `/ruptures`, `/article <code>`, `/anomalies`, `/dashboard`, `/rayon`.
- Un seul message par sujet : pas de doublons, pas de récapitulatifs superflus.