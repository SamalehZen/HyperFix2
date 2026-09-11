#!/usr/bin/env bash
# ============================================================
# Dépôt quotidien de la gamme épicerie salée (repli manuel)
# Le moteur gamme_engine surveille /storage/gamme/depot (toutes les 60 s)
# et enchaîne : archivage -> snapshot -> comparaison J/J-1 ->
#               classification -> anomalies -> compensateurs LLM
# Usage : ./import_gamme.sh /chemin/vers/nouveau_gamme.xlsx [rayon]
#   rayon défaut : frais-surgele (dépôt /storage/gamme/depot/frais-surgele/)
# ============================================================
set -euo pipefail

DEPOT="/storage/gamme/depot"
PROJET="/opt/HyperFix2/nao-gamme"
RAYON="${2:-frais-surgele}"

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 /chemin/vers/nouveau_gamme.xlsx [rayon]"
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

echo "==> Dernier état des imports:"
curl -s -m 10 http://127.0.0.1:8010/api/status | python3 -m json.tool || echo "(moteur injoignable — vérifier le conteneur gamme_engine)"
echo
echo "Dashboard: https://gestion.hypeer.cloud/story/ — API: https://gestion.hypeer.cloud/story-data/jours"
