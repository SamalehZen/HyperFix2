#!/usr/bin/env bash
# ============================================================
# Dépôt quotidien des mouvements frais-surgelé (repli manuel)
# Le moteur gamme_engine route les Stock_DetailMouvement*.xlsx vers
# le flux dédié (table mouvement_imports, jamais le pipeline gamme).
# Usage : ./import_mouvements.sh /chemin/vers/Stock_DetailMouvement.xlsx [rayon]
#   rayon défaut : frais-surgele (dépôt /storage/gamme/depot/frais-surgele/)
# ============================================================
set -euo pipefail

DEPOT="/storage/gamme/depot"
RAYON="${2:-frais-surgele}"

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 /chemin/vers/Stock_DetailMouvement.xlsx [rayon]"
    exit 1
fi

NOUVEAU="$1"
if [ ! -f "$NOUVEAU" ]; then
    echo "ERREUR: fichier introuvable: $NOUVEAU"
    exit 1
fi
mkdir -p "$DEPOT/$RAYON"

echo "==> Copie dans le dépôt surveillé: $DEPOT/$RAYON"
cp "$NOUVEAU" "$DEPOT/$RAYON/$(basename "$NOUVEAU")"
chown root:root "$DEPOT/$RAYON/$(basename "$NOUVEAU")" 2>/dev/null || true

echo "==> Attente du traitement par le moteur (jusqu'à 3 min)..."
for i in $(seq 1 18); do
    sleep 10
    if [ ! -f "$DEPOT/$RAYON/$(basename "$NOUVEAU")" ]; then
        echo "✔ Fichier traité (retiré du dépôt)."
        break
    fi
done

echo "==> Derniers imports mouvements:"
curl -s -m 10 http://127.0.0.1:8010/api/status | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r) for r in d.get('mouvement_imports', [])]" || echo "(moteur injoignable — vérifier le conteneur gamme_engine)"
