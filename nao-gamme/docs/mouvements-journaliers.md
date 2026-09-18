# Mouvements journaliers — contexte complet + plan HyperFix2 V2

Date : 2026-09-18. Statut : PHASES A+B+C TERMINÉES ET VÉRIFIÉES EN PROD
(lots 1+3, voir §10) — D+E (lots 4-5) INTERDITS jusqu'à nouvel ordre,
backfill 90 jours en attente du fichier (annoncé pour demain).
Fichier source : `/root/Stock_DetailMouvement (93).xlsx` (ne pas déplacer : référence d'analyse).
Projet : `/opt/HyperFix2` (moteur `gamme-engine`, app `nao-gamme`). Base : `/storage/gamme/historique.db`.

## 1. Objectif

Importer chaque jour, en plus de la gamme (photo), le mouvement complet du rayon
(film) : ventes, livraisons, inventaires, retours fournisseur, cessions, périmés.
Même rythme que la gamme (quotidien + backfill des jours précédents, même jour aligné).

## 2. Fichier : radiographie (vérifiée par lecture le 2026-09-17)

- 379 mouvements + 1 ligne TOTAL à exclure, 1 jour (13/09/2026), 356 articles.
- 26 colonnes en 5 familles : identité (Code, Libellé, Classification `02-020-...`
  — piste future : filtre hiérarchique secteur/rayon/famille au dashboard) ;
  mouvement (Code/Libellé mvt, Document, Qté UC, PRMP, Valeur, Sens, Qte après,
  Date/Heure mvt/création) ; prix ×4 (PRMP doublé, Dernier PR, Dernier PAMP,
  Dernier PA) ; audit stock (Q Phys, Date/Q der. compt., Date/Q der. inv.,
  Date der. entrée/sortie).
- Types : SM 342 = VENTES (1 ligne/article/jour, batch 23:59:50, doc `0.0`) ;
  EM 16 = livraisons (vrais BL `2.6006666E7`→`...674E7`) ; EI 13 / SI 2 =
  inventaire (pièce n°`92`) ; `15` = Cession Cafet (code NUMÉRIQUE) ;
  RM 2 = retours fournisseur (sens −, docs `2.6000702/704E7`).
- Anomalies/pièges : ligne TOTAL (= somme signée, à exclure) ; code cession
  numérique ; RM sens − ; 3 natures de documents (`0.0`, `92.0`, `2.6E7`) ;
  `date_fin` = `'nan'` en texte ; heures non triées ; 1 ligne sans date ;
  comptages rares (jusqu'en 05/2024) ; EI à +28 avec stock après à 9
  (stock négatif avant inventaire).
- Match codes : 379/379 avec `article_history` frais-surgele (100 %).
- Dates promo en base au format JJ/MM/AAAA (parser `%d/%m/%Y`, `'nan'` = vide) ;
  NE JAMAIS comparer en SQL avec YYYY-MM-DD. Comparaison via `substr` :
  `substr(date_dbt,7,4)||substr(date_dbt,4,2)||substr(date_dbt,1,2)` (cf. `docs/gamme.md` § Promotions).

## 2bis. Règles d'implémentation verrouillées (2026-09-18)

- **Tri par heure** : le fichier n'est PAS trié chronologiquement (ex. ligne 14:57
  avant ligne 14:25). Toujours trier par `Heure mvt` avant de chaîner `Qte après`.
- **Stocks intermédiaires négatifs acceptés** : ex. EI +28 avec stock après à 9
  (= stock négatif avant inventaire). Ne jamais bloquer/rejeter sur un stock
  négatif intermédiaire — c'est une donnée, pas une erreur.
- **Ancienneté du dernier comptage = indicateur** : comptages parfois vieux
  (jusqu'en 05/2024). Exposer `Date der. compt.` / `Q der. compt.` pour prioriser
  les articles jamais comptés.
- **`Code mvt` toujours normalisé en TEXTE** : `"15"`, jamais `15.0` numérique
  (le parseur Excel renvoie un float — convertir `int(float(x))` puis `str` ;
  `"0.0"` → exclure comme ligne TOTAL / ligne vide).
- **Le signe vient de la colonne `Sens`, JAMAIS du type** : `quantite_signee`
  = `+quantite` si `Sens='+'`, `-quantite` si `Sens='-'` (preuve : RM sens `-`).
  Ne jamais déduire le sens depuis `Code mvt`.
- **Référence temporelle = `Date/Heure mvt`** : `Date/Heure création` peut
  différer (batchs postés en bloc, ex. SM à 23:59:50) — tri et chaînage
  toujours sur l'heure mvt.
- **Gardes rayon obligatoires** : les mouvements sont soumis aux mêmes standards
  que la gamme (`_guard_rayon`, vues pré-filtrées jour+rayon, blocage
  `main.*`) — à prévoir dans chaque endpoint/requête du lot 4.

## 2ter. Mécanisme minuit (expliqué par l'utilisateur, 2026-09-18 — grille de lecture officielle)

- **SM = batch de minuit** : ventes 8h→22h accumulées, déduites du stock à
  23:59:50. Les lignes SM datées J = les ventes de la journée J.
- **Tout le reste = temps réel** : cessions (15/35/40/45), périmé (10),
  emballages (50/55), retours, livraisons, inventaires — déduits à l'instant.
- **Gamme exportée 9h-10h le matin** : « gamme du 17 » = stock après mise à jour
  minuit 16→17 = inclut les ventes du 16. **Logique J-1 confirmée.**
- **Conséquence 1** : SM ne chevauche jamais le snapshot → réconciliation SM
  exacte par construction (preuves §3).
- **Conséquence 2** : un mouvement temps réel vers 9h-10h peut tomber avant ou
  après la photo → petits écarts ATTENDUS (ex. 18702 : RM 09:35 → +1).
  Règle affinée : écart sur code temps réel avec `Heure mvt` 09:00-10:00 =
  « chevauchement snapshot probable » (informatif) ; écart SM ou hors créneau
  = vraie anomalie.
- **Piège exports mid-journée** : un fichier « journée 15 » sorti à 11h mélange
  SM de la veille + temps réel du matin. Nos fichiers (SM 23:59:50 présents)
  sont des extraits fin de journée → sémantique propre par date.
- CA (SM daté J = ventes J) et dormants (présence/absence SM) : inchangés.

## 3. Preuves (toutes vérifiées)

- Réconciliation `gamme(13/09) + net mouvements = gamme(14/09)` :
  12982 (908−337=571) ✅, 128427 (821−28=793) ✅, 44761 (124−124=0) ✅.
- 44774 le 13/09 : livré 124 (BL `...666E7`) → tout retourné 13h00
  (doc `...704E7`) → stock 0 ; marge 10,06 le 14/09.
- 15218 (promo 10/09→15/09, vente 1850, promo 1600) le 13/09 : SM 18 pcs,
  Valeur = 18 × 1075,183 (PRMP = coût, PAS le CA) ; stock 3559−18 = 3541 ✅ ;
  CA reconstruit = 18 × 1600 = 28 800 FDJ, marge encaissée = 9 446 FDJ.
- Journée 13/09 reconstruite (vérifiée) : **CA 1 670 520 FDJ**, coût
  1 135 934, **marge encaissée 534 586** ; cessions (Cafet) 52 827 ;
  retours fournisseur 4 287. Top vente : 12982 (337 pcs).

## 4. Règles métier actées (utilisateur, 2026-09-17)

1. Quotidien comme la gamme + backfill (anciens fichiers à venir) ; date lue
   DANS le fichier ; appariement même jour gamme/mouvements.
2. RM = retour fournisseur. Pas de retour client (n'existe pas).
3. Codes mouvement : liste COMPLÈTE reçue (58 codes, voir §5ter — mapping figé).
   Inutilisés : OF, OG, OH, OX, OJ, ET, ST, 25, 26, 36 (famille `inutilise` :
   apparition = alerte, jamais de traitement silencieux). Destination des
   cessions lue dans le libellé. Inconnu hors liste → signalé, jamais inventé.
4. Doc `92` = n° d'inventaire arrêté/généré (traçabilité simple).
5. SM = ventes uniquement (pas de casse/périmés dedans).
6. CA : « tout au prix promo pendant la période » = OUI confirmé.
7. Casse/périmés : DANS le même fichier (absents le 13/09, journée propre).
8. Dormants (décisions 2026-09-18) : **réveil par vente SM UNIQUEMENT**
   (EI/SI/RM/cessions = contexte affiché, ne réveillent pas) ; **stock nul
   exclu** des dormants ; seuil **configurable `DORMANT_JOURS`, défaut 90**.

## 5. Config initiale `types_mouvements.json` (modifiable sans recoder)

SM→vente, EM→livraison, EI/SI→inventaire, RM→retour_fournisseur,
15→cession_cafet, 10→perime. Valorisation fichier = PRMP (coût) ;
CA = qté SM × prix applicable (promo si dates actives sinon vente).
Démarque connue = périmé + retours + SI ; inconnue = écarts inventaire.
Détail complet des 58 codes : voir §5ter (mapping figé 2026-09-18).

## 5ter. Mapping complet des 58 codes (liste utilisateur, figée 2026-09-18)

Patterns : paires `ANNUL.` = sens opposé du code de base (11→10, 16→15,
21→20, 26→25, 31→30, 36→35, 41→40, 46→45, 51→50, 56→55, 61→60, 66→65) ;
le signe est TOUJOURS lu dans `Sens` (garde croisée : `ANNUL.` de sens
non opposé = anomalie signalée, jamais bloquante).

| Famille (indicateur) | Codes | Traitement |
|---|---|---|
| `vente` | SM | CA reconstruit (prix applicable) |
| `livraison` | EM, EL | Entrées stock |
| `inventaire` | EI, SI | Ajustements + écarts |
| `retour_fournisseur` | RM | Sorties valorisées PRMP |
| `cession` | 15, 16, 35, 40, 41, 45, 46 (sous-types `cafet/repas/rayon/frais_gx`) | Ni vente ni perte, valorisé PRMP, sortie de stock. 15=Cafet (tout ce que la Cafet prend), **35=cession repas** (repas midi salariés, comme la Cafet), 40=cession rayon, 45=frais généraux |
| `demarque` | 10, 11 (`perime`), 30, 31 (`don`), 50, 51, 55, 56 (`emballage`), 60, 61 (`casse_rayon`), 65, 66 (`casse_reception`) | Démarque connue, détaillée par sous-type |
| `ajustement` | 70 (−), 71 (+) | Écarts directs |
| `consigne` | EC, EV, RC, SC | Circuit consigne, tracé à part |
| `gratuit` | EG, SG | Sans CA |
| `facturation_interne` | EF, SF | Interne, pas des ventes |
| `client_facture` | IF, IG, IH, IJ, IR, IT, IX, OR, OT | Circuit clients facturés : tracés à part, hors CA (défaut — aucun observé au 13/09) |
| `regul_composes` | XE, XS | Régularisations, tracées à part |
| `inutilise` | OF, OG, OH, OX, OJ, ET, ST, 25, 26, 36, 20, 21 | JAMAIS traités : apparition = alerte « code réputé inutilisé » |
| `type_inconnu` | tout code hors liste | Stocké + signalé, jamais inventé |

Notes : famille `transfert` SUPPRIMÉE (tous ses codes sont inutilisés ou
reclassés en `cession`) ; `36` inutilisé bien que `35` utilisé (enregistré tel
quel) ; `OX` libellé « ENTRÉE... » = coquille sans impact (code inutilisé,
sens lu dans le fichier de toute façon).
Màj 2026-09-18 : `20/21` (échantillons) → **`inutilise`** (n'existe pas,
confirmé) ; `60/65` casse existent (futurs fichiers) ; `70/71` rares ;
**mouvements retrouvables tout jour** (l'utilisateur peut fournir n'importe
quelle journée) vs **gammes parfois introuvables** (trous existants) → renforce
`mouvements_sans_gamme` + dormants indépendants de la gamme ancienne.

## 5bis. Schéma détaillé (décision 2026-09-18 : UNE seule table)

Retenu : **une seule table `mouvements`** (400 lignes/jour — 3 tables
(`mouvements` + `prix_achats` + `inventaires`) seraient du sur-découpage ;
~150 k lignes/an : les 3 index suffisent ; réévaluable si on dépasse
1 M lignes/an).

```sql
CREATE TABLE mouvements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jour TEXT NOT NULL,            -- date lue DANS le fichier (JJ/MM/AAAA → YYYY-MM-DD)
  rayon TEXT NOT NULL,
  code INTEGER NOT NULL,
  libelle TEXT, classification TEXT,
  code_mvt TEXT NOT NULL,        -- toujours TEXTE ("15", "SM", "RM"...)
  libelle_mvt TEXT, type_normalise TEXT,  -- vente/livraison/inventaire/retour_fournisseur/cession_cafet/perime/type_inconnu
  document TEXT,                 -- "0.0" | n° inventaire | BL fournisseur
  quantite REAL NOT NULL, sens TEXT NOT NULL, quantite_signee REAL NOT NULL,
  prmp REAL, valeur_fichier REAL, stock_apres REAL,
  heure_mvt TEXT, heure_creation TEXT,
  dernier_pr REAL, dernier_pamp REAL, dernier_pa REAL,
  stock_physique REAL,
  date_dernier_comptage TEXT, qte_dernier_comptage REAL,
  date_dernier_inv TEXT, qte_dernier_inv REAL,
  date_derniere_entree TEXT, date_derniere_sortie TEXT,
  fichier_source TEXT NOT NULL, hash_sha256 TEXT NOT NULL,
  statut TEXT NOT NULL           -- ok | mouvements_sans_gamme | type_inconnu
);
CREATE INDEX idx_mouvements_jour_code ON mouvements(jour, code);
CREATE INDEX idx_mouvements_type_jour ON mouvements(type_normalise, jour);
CREATE INDEX idx_mouvements_code_mvt ON mouvements(code_mvt, jour);
```

- `types_mouvements` : table/config versionnée (code → type_normalise → libellé),
  éditable sans recoder ; inconnu → `type_inconnu`, signalé, jamais inventé.
- **Formule de réconciliation** (par article et par jour) :
  `stock_gamme[J] + Σ(quantite_signee[J]) = stock_gamme[J+1]`.
- **Statut `mouvements_sans_gamme`** : si la gamme du jour manque, stocker quand
  même les mouvements mais ne pas calculer la réconciliation (reportée).
- **Table `mouvement_imports` SÉPARÉE** (décision 2026-09-18, zéro risque gamme) :
  ```sql
  CREATE TABLE mouvement_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rayon TEXT NOT NULL, jour TEXT NOT NULL,
    date_import TEXT NOT NULL, fichier_source TEXT NOT NULL,
    archive_path TEXT, hash_sha256 TEXT NOT NULL,
    nb_mouvements INTEGER NOT NULL, statut TEXT NOT NULL, message TEXT,
    nb_mouvements INTEGER NOT NULL, statut TEXT NOT NULL, message TEXT,
    resume_json TEXT,
    UNIQUE(rayon, jour)
  );
  CREATE INDEX idx_mouvement_imports_hash ON mouvement_imports(rayon, hash_sha256);
  ```
  Dedup par hash + unicité (rayon, jour) : un 2e fichier du même jour = refusé.
  La table `imports` (gamme) n'est JAMAIS touchée par le flux mouvements.
  Table `mouvements` : comme §5bis + colonnes `import_id` (lien import) et
  `sous_type` (détail famille) ; table `mouvement_imports` + colonne `resume_json`.

## 6. Lots d'exécution

1. **Ingestion** : ROUTEUR avant le pipeline gamme (conflit critique : le watcher
   actuel `main.py:154-164` envoie TOUT `.xlsx` à `pipeline.run_import` qui impose
   la feuille `Gamme_Commande` — `pipeline.py:52-55`. Sans routage, le fichier
   mouvements serait rejeté en erreurs). Détecter `Stock_DetailMouvement*.xlsx`
   → module `mouvements.py` dédié (feuille `sheet1`) → validation
   (26 colonnes, TOTAL exclu, 100 % codes matchés, doublons jour/hash rejetés,
   ligne sans date rejetée proprement, types inconnus signalés) → table
   `mouvements` + config + rapport honnête. Parité gamme : archive des
   originaux (`imports/<rayon>/AAAA/MM/JJ/`), alertes Telegram (refus/erreurs),
   script `import_mouvements.sh` miroir, routage transparent via
   `gamme_import_file` (même outil chat, routage par nom de fichier).
2. **Backfill** : anciens fichiers, ordre chrono, réconciliation/jour.
   Pour des dormants **prouvés** complets, viser ~90 jours d'historique
   mouvements (voir §6bis — en attendant, niveaux « estimé »/« partiel »).
3. **Réconciliation + indicateurs** : équation quotidienne, `ecart_inexplique`
   (nouvelle anomalie), CA reconstruit, marge encaissée, rotation vraie,
   démarque connue/inconnue, prix achat Δ (Dernier PR vs PRMP), efficacité
   promo (ventes/jour pendant vs hors promo), `dormant_prouve` (§6bis).
4. **Dashboard + Excel** : BACKEND d'abord — étendre `GET /story-data/{jour}` et
   `GET /stats/{jour}` (`gamme-engine/app/story_api.py`), PUIS l'UI du dashboard
   mix2 de production `/story/dashboard/mix2?jour=<jour>&rayon=<rayon>`.
   INTERDIT : coder les panneaux de production dans `dashboard-preview/`
   (service `:3001`, marqué temporaire/mock). Ambiguïté à lever au lot 4 :
   deux arbres UI existent (`dashboard-preview/.../mix2` vs
   `gamme-engine/story-ui`) — vérifier lequel génère `/story` avant de coder.
   Les 8 panneaux (nouvel onglet « Mouvements » ou mélangés — à trancher) :
   « Ventes du jour », « Marge encaissée », « Mouvements »
   (cessions/retours/livraisons/périmés), « Écarts », « Prix d'achat »,
   « Dormants prouvés », « Promos » (efficacité), « Alertes ».
   Excel : ventes par article en colonnes (`excel_intelligent.py`).
5. **Alertes** : retour fournisseur, cession massive, périmé du jour,
   écart > seuil, article devenu dormant (passage des `DORMANT_JOURS`),
   dormant à gros capital.

## 6bis. Point 6 — Dormants prouvés (règle des 3 mois, figée 2026-09-18)

Constat (vérifié 2026-09-18, import n°77 du 17/09) : **337 dormants estimés**
(`couv=999`, stock>0) → **25 668 250 FDJ** bloqués. Mais `couv=999` est une
estimation, fausse dans les 2 sens : **faux dormants** (`couv=999` mais vendu
récemment) et **dormants cachés** (`couv<999` mais 0 vente depuis 3 mois).

- **Définition** : dormant prouvé = `stock > 0` ET **0 vente (SM)** depuis
  ≥ `DORMANT_JOURS` jours calendaires. Preuve affichée : date + type du
  **dernier mouvement** + capital bloqué (`stock × PRMP`).
- **Réveil SM uniquement** : EI/SI/RM/cessions affichés en contexte, ne
  réveillent jamais (un ajustement n'est pas un client).
- **Stock nul exclu** (rien de bloqué).
- **Seuil configurable** : `DORMANT_JOURS = int(os.getenv("DORMANT_JOURS", "90"))`
  dans `config.py` (même modèle que `GAMME_CHUTE_SEUIL=200`,
  `GAMME_POLL_SECONDS=60`) ; changement par l'utilisateur = 1 ligne dans
  `nao-gamme/.env` + `docker compose restart gamme-engine`, sans toucher au code.
- **Jour sans fichier ≠ 0 vente** : réutiliser la logique `jours_manquants`
  existante — jamais de preuve inventée sur un trou.
- **3 niveaux de preuve** (toujours étiquetés au dashboard) :
  `estime` (`couv=999`, sans historique) / `partiel` (0 vente depuis N < 90 j
  de données) / `prouve` (0 vente depuis ≥ 90 j).
- **Indicateur** par article et par jour : `dormant_prouve` + `dernier_mouvement_le`
  + `dernier_mouvement_type` + `jours_sans_vente` + `niveau_preuve`.
- **Dashboard** : panneau « Dormants prouvés » trié par capital + 2 listes bonus
  (faux dormants, dormants cachés).
- **Alertes** : passage des 90 j + dormant à gros capital.

## 7. Tests d'acceptation

- Réconciliation exacte 13/09 (12982, 128427, 44761) + 15218 (CA 28 800).
- TOTAL exclu (jamais compté) ; doublon jour refusé ; type inconnu signalé.
- Dormants : `DORMANT_JOURS` défaut 90 ; niveaux `estime/partiel/prouve`
  étiquetés ; stock nul exclu ; réveil SM uniquement.
- Import réel : copie du 13/09 en prod (original `/root` intact) dès lot 1
  validé ; chiffres vérifiés contre §3 avant de continuer.
- Équation équilibrée sur fichier test ; suite pytest complète verte ;
  rebuild + moteur healthy.
- Rollback : tout est additif (nouveau module + nouvelles tables, flux gamme
  intact) → revert des commits suffit, aucune migration destructive.

## 8. En attente (non bloquant)

- Fichiers mouvements des jours précédents (backfill — ~90 jours pour des
  dormants prouvés complets ; 39 jours de gamme déjà importés au 17/09).
  Reçus : liste complète des 58 codes ✅ ; fichier exemple 13/09 ✅ (en prod) ;
  `/root/Stock_DetailMouvement  30-08-26 AU 10-09-26.xlsx` (1,86 Mo —
  **vérifié : 15 685 mouvements, 43 jours consécutifs 30/07→10/09, zéro trou**,
  16 codes observés, inutilisés 0 apparition, ANNUL. opposés ✅) ;
  `/root/Stock_DetailMouvement 11-09-26.xlsx` (60 Ko, 434 mouvements, 11/09).
  ⚠️ Écarts à clarifier : nom trompeur (pas 30/08→10/09) + utilisateur annonce
  « 07/08→11/09 » vs vérifié 30/07→10/09 + 11/09 → **périmètre backfill :
  tout (30/07→) ou depuis 07/08 ? (Q5)**.
- Rappel : `/root/GAMME COMPLET (1).zip` + 4 xlsx = anciennes gammes déjà
  importées (pas de mouvements dedans).

## 9. Questions ouvertes (mapping : tout résolu — OF/OG/OH/OX/OJ/ET/ST/25/26/36/20/21 inutilisés, 35=cession repas, 40/45=cessions, transfert supprimé, OX=coquille ; dépôt RÉSOLU ; export gamme 9h-10h RÉSOLU ; multi-dates RÉSOLU : oui, 43 dates/1 fichier + split)

1. Dépôt des mouvements : ~~même dossier `depot/<rayon>/` avec routage par nom,
   ou nouveau sous-dossier `depot/<rayon>/mouvements/` ?~~ → **RÉSOLU
   2026-09-18 : même `depot/<rayon>/` + routage par nom
   `Stock_DetailMouvement*.xlsx`.**
2. Que signifie `(93)` dans `Stock_DetailMouvement (93).xlsx` (n° pièce, jour,
   version) ?
3. Dashboard : nouvel onglet « Mouvements » dans mix2, ou 8 panneaux mélangés
   aux panneaux existants ?
4. Multi-rayons : chaque rayon a-t-il son propre fichier mouvements ? Si oui,
   comment rattacher le fichier au rayon (préfixe `Classification 02-...`,
   nom de fichier, sous-dossier de dépôt) ? Périmètre initial = frais-surgele.
5. Périmètre backfill : ~~tout le contenu vérifié (30/07→10/09 + 11/09) ou
   restreint à 07/08→11/09 (annoncé par l'utilisateur) ?~~ → **RÉSOLU
   2026-09-18 : TOUT, 30/07→11/09** (13/09 déjà en prod, sauté auto).

## 10. Exécution A+B+C (2026-09-18, 10 commits)

- **Phase A** : config (`MOUVEMENT_*`, `DORMANT_JOURS`), `types_mouvements.json`
  (58 codes), tables `mouvements`+`mouvement_imports`, module `mouvements.py`,
  routeur watcher/API/MCP, `import_mouvements.sh`, 27 tests (synthétiques +
  réel 13/09 + split + trailing + boot). Suite : **68/68** (41 baseline + 27),
  zéro régression.
- **Phase B** : `reconcile_jour` + `ecart_mouvement` + couverture
  (`mouvements_sans_gamme` / `gamme_j/gamme_j1_manquante`).
- **Phase C** : `indicateurs_jour` (CA, marge, rotation, démarque, prix Δ,
  promo, dormants + niveaux + faux/cachés).
- **Prod 13/09** (copie, original `/root` intact, via watcher) : 379/356,
  CA 1 670 520, marge 534 585,51, dormants 0/460/316, 15218 CA 28 800.
  **1 écart** : 18702 (+1 : attendu 10, constaté 11 — chaîne mouvements
  14→11 cohérente avec gamme 14/09, départ décalé d'1) → réconciliation
  99,99 %, moteur healthy après rebuild.
- **Incidents + fixes** : `main.py:116` fusionnée (SyntaxError au boot →
  réparé, rebuilé, healthy ; tests ne couvraient pas `main.py`) ; PRMP doublé
  (accès positionnel + warning d'écart) ; `continue` qui sautait le contrôle
  prix (remonté en tête de boucle) ; INSERT auto-cohérent (assert arités).
- **Décision fichier unique 90 jours** (2026-09-18) : la garde « multi-dates
  refusé » devient un **split par jour** (grouper par `Date mvt`, ordre chrono,
  même traitement par jour, jours déjà importés sautés, hash anti-redépôt,
  TOTAL exclus). À coder au backfill — aucun changement de schéma requis
  (`UNIQUE(rayon, jour)` déjà prévu).
- **Backfill planifié** : ~90 dates consécutives, table de couverture
  gamme ✓/✗ × mouvements ✓/✗, trous = restart de fenêtre, dormants pleine
  puissance sans ancienne gamme. Fichier annoncé pour demain.
- **Règle dormants trailing window IMPLÉMENTÉE** : jamais-vu +
  fenêtre 90 j complète → prouvé (« pas vu depuis le … ») ; trou = restart
  (jamais de preuve sur un trou) ; `_trailing_run` + tests (fenêtre 91 j,
  trou, jamais-vu).
- **Mécanisme minuit appliqué** : écarts temps réel 09:00-10:00 taggés
  « chevauchement snapshot probable » (informatif) ; `nouvel_article`
  informatif (assortiment) au lieu d'écart ; `20/21` → `inutilise`.
- **Split multi-dates IMPLÉMENTÉ** : grouper par `Date mvt` → chrono → même
  traitement par jour ; jours déjà importés sautés ; redépôt exact converge ;
  reprise après jour en erreur ; script `backfill_mouvements.sh`.
- **Fichiers backfill reçus et analysés** (sans modification) : 43 jours
  consécutifs 30/07→10/09 (15 685 lignes, 16 codes observés) + 11/09
  (434 lignes) → fenêtre max 44 j (trou 12/09), dormants partiels au mieux.
- **Backfill exécuté 2026-09-18** : 45 jours (30/07→11/09 + 13/09),
  16 498 lignes, 100 % `ok`, dépôt vide. CA cumulé 58,6 M FDJ.
  Dormants (fenêtre 44 j au 10/09) : 0 prouvés / 497 partiels-43 j /
  276 estimés / **50 faux dormants exposés**. 554 `ecart_mouvement` (+134
  `nouvel_article`) : concentrés en patterns (livraisons du matin à cheval
  sur le snapshot 9h-10h — ex. 13267/154289/128427 ; récurrents 154289,
  128427, 54875×3, 108225 fractionnaire) → **valide le mécanisme minuit**,
  ce sont des effets système à investiguer, pas des pertes prouvées.
  12/09 manquant (fenêtre coupée) + 57 écarts taggés chevauchement.
- **Refresh post-backfill (13/09)** : résumé recalculé avec le code final
  (fenêtre [13/09], trou 12/09) → dormants 0/460/316 **devenus 0/508/268 +
  48 faux dormants** (articles `couv=999` vendus pendant le backfill —
  ex. 18792 vendu le 06/09) ; écart 18702 taggé chevauchement 9h-10h.
  Preuve que le backfill enrichit même les jours déjà importés.
