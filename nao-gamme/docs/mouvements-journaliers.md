# Mouvements journaliers — contexte complet + plan HyperFix2 V2

Date : 2026-09-18. Statut : SPÉC ENRICHIE (conflit watcher, schéma, dashboard,
point 6 dormants prouvés) — exécution en attente (« go mouvements »).
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
3. Codes cession OUVERTS (liste à venir) : `15` = tout ce que la Cafet prend ;
   `10` = périmé invendable ; casse = numéro à venir. **Destination lue dans
   le libellé** (`Cession Cafet`, ...) — d'autres libellés possibles les autres
   jours, à classer avec la liste. Inconnu → signalé, jamais inventé.
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
- Équation équilibrée sur fichier test ; suite pytest complète verte ;
  rebuild + moteur healthy.

## 8. En attente (non bloquant)

- Liste des codes (cessions + casse) quand l'utilisateur l'aura.
- Fichiers mouvements des jours précédents (backfill — ~90 jours pour des
  dormants prouvés complets ; 39 jours de gamme déjà importés au 17/09).
- Rappel : `/root/GAMME COMPLET (1).zip` + 4 xlsx = anciennes gammes déjà
  importées (pas de mouvements dedans).

## 9. Questions ouvertes (posées 2026-09-18, réponses attendues avant/après « go »)

1. Dépôt des mouvements : même dossier `depot/<rayon>/` avec routage par nom,
   ou nouveau sous-dossier `depot/<rayon>/mouvements/` ?
2. Que signifie `(93)` dans `Stock_DetailMouvement (93).xlsx` (n° pièce, jour,
   version) ? Un fichier peut-il contenir plusieurs dates ?
3. Dashboard : nouvel onglet « Mouvements » dans mix2, ou 8 panneaux mélangés
   aux panneaux existants ?
4. Multi-rayons : chaque rayon a-t-il son propre fichier mouvements ? Si oui,
   comment rattacher le fichier au rayon (préfixe `Classification 02-...`,
   nom de fichier, sous-dossier de dépôt) ? Périmètre initial = frais-surgele.
