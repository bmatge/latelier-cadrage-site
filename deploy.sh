#!/usr/bin/env bash
# Déploiement agnostique (plateforme VibeLab).
# Usage : ./deploy.sh [--logs]
#
# Pensé pour être invoqué par l'orchestrateur `spawn`, qui fournit déjà
# APP_NAME / DOMAIN / MAIL_HOST / MAIL_PORT dans l'environnement et peut
# exporter COMPOSE_FILE (override réseau mail). N'embarque aucun nom de
# domaine, réseau ou hébergeur. En local, `docker compose up` suffit.

set -euo pipefail
cd "$(dirname "$0")"

FOLLOW_LOGS=0
for arg in "$@"; do
  case "$arg" in
    --logs) FOLLOW_LOGS=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

echo "[deploy] docker compose build"
docker compose build

echo "[deploy] docker compose up -d"
docker compose up -d

echo
echo "[deploy] Statut :"
docker compose ps

if [ "$FOLLOW_LOGS" -eq 1 ]; then
  echo
  echo "[deploy] Suivi des logs (Ctrl+C pour quitter)"
  docker compose logs -f --tail=50
fi
