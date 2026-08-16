#!/usr/bin/env bash
# ============================================================
# Dépôt quotidien de la gamme épicerie salée (repli manuel)
# Le moteur gamme_engine surveille /storage/gamme/depot (toutes les 60 s)
# et enchaîne : archivage -> snapshot -> comparaison J/J-1 ->
#               classification -> anomalies -> compensateurs LLM
# Usage : ./import_gamme.sh /chemin/vers/nouveau_gamme.xlsx
# ============================================================
set -euo pipefail

DEPOT="/storage/gamme/depot"
PROJET="/root/nao-gamme"

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 /chemin/vers/nouveau_gamme.xlsx"
    exit 1
fi

NOUVEAU="$1"
if [ ! -f "$NOUVEAU" ]; then
    echo "ERREUR: fichier introuvable: $NOUVEAU"
    exit 1
fi

echo "==> Copie dans le dépôt surveillé: $DEPOT"
cp "$NOUVEAU" "$DEPOT/$(basename "$NOUVEAU")"
chown root:root "$DEPOT/$(basename "$NOUVEAU")"

echo "==> Attente du traitement par le moteur (jusqu'à 3 min)..."
for i in $(seq 1 18); do
    sleep 10
    if [ ! -f "$DEPOT/$(basename "$NOUVEAU")" ]; then
        echo "✔ Fichier traité (retiré du dépôt)."
        break
    fi
done

echo "==> Dernier état des imports:"
curl -s -m 10 http://127.0.0.1:8010/api/status | python3 -m json.tool || echo "(moteur injoignable — vérifier le conteneur gamme_engine)"
echo
echo "Dashboard: https://lololo.hypeer.cloud/story/ — API: https://lololo.hypeer.cloud/story-data/jours"
