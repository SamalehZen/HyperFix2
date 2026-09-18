#!/usr/bin/env bash
# ============================================================
# Backfill mouvements : importe un dossier de fichiers en ordre
# chronologique (ancien -> récent). Chaque fichier est copié dans le
# dépôt surveillé et attendu (disparition = traité). Les jours déjà
# importés sont sautés proprement (pas de doublons).
# Usage : ./backfill_mouvements.sh /chemin/vers/dossier [rayon]
#   rayon défaut : frais-surgele
# ============================================================
set -euo pipefail

DEPOT="/storage/gamme/depot"
RAYON="${2:-frais-surgele}"

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 /chemin/vers/dossier_mouvements [rayon]"
    exit 1
fi

SRC="$1"
if [ ! -d "$SRC" ]; then
    echo "ERREUR: dossier introuvable: $SRC"
    exit 1
fi
mkdir -p "$DEPOT/$RAYON"

OK=0
KO=0
for F in "$SRC"/*.xlsx "$SRC"/*.xlsm; do
    [ -f "$F" ] || continue
    BASE="$(basename "$F")"
    echo "==> $BASE"
    cp "$F" "$DEPOT/$RAYON/$BASE"
    for i in $(seq 1 30); do
        sleep 10
        if [ ! -f "$DEPOT/$RAYON/$BASE" ]; then
            echo "  ✔ traité"
            OK=$((OK + 1))
            break
        fi
        if [ "$i" = "30" ]; then
            echo "  ✗ TIMEOUT (fichier toujours présent — voir logs moteur)"
            KO=$((KO + 1))
        fi
    done
done

echo
echo "==> Fichiers traités: $OK, timeouts: $KO"
echo "==> Couverture mouvements ($RAYON) :"
python3 - "$RAYON" <<'EOF'
import sqlite3
import sys
c = sqlite3.connect('/storage/gamme/historique.db')
for r in c.execute("SELECT jour, nb_mouvements, statut FROM mouvement_imports WHERE rayon = ? ORDER BY jour", (sys.argv[1],)):
    print(' ', r[0], r[1], 'lignes', r[2])
EOF
