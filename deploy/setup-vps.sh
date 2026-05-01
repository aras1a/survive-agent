#!/usr/bin/env bash
# Setup script for Netcup VPS 2000 ARM G11 (Ubuntu 22.04 ARM64).
# Run as root or via sudo. Idempotent.
#
# Usage:
#   curl -fsSL .../setup-vps.sh | sudo bash
# or after cloning the repo:
#   sudo ./deploy/setup-vps.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/aras1a/survive-agent.git}"
APP_USER="${APP_USER:-survive}"
APP_HOME="/home/${APP_USER}"
APP_DIR="${APP_HOME}/survive-agent"
NODE_VERSION="${NODE_VERSION:-22.12.0}"

log() { echo "[setup] $*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

log "Apt update + base packages..."
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git build-essential pkg-config \
  python3 unzip jq ufw

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating user $APP_USER..."
  useradd -m -s /bin/bash "$APP_USER"
fi

# nvm + node, installed under the app user.
if [[ ! -d "${APP_HOME}/.nvm" ]]; then
  log "Installing nvm for $APP_USER..."
  sudo -u "$APP_USER" bash -c '
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  '
fi

log "Installing Node ${NODE_VERSION} for $APP_USER..."
sudo -u "$APP_USER" bash -lc "
  export NVM_DIR='${APP_HOME}/.nvm'
  . \$NVM_DIR/nvm.sh
  nvm install ${NODE_VERSION}
  nvm alias default ${NODE_VERSION}
"

log "Cloning repo into ${APP_DIR}..."
sudo -u "$APP_USER" bash -lc "
  if [[ ! -d '${APP_DIR}' ]]; then
    git clone '${REPO_URL}' '${APP_DIR}'
  else
    cd '${APP_DIR}' && git pull --ff-only
  fi
"

log "npm install --omit=dev..."
sudo -u "$APP_USER" bash -lc "
  export NVM_DIR='${APP_HOME}/.nvm'
  . \$NVM_DIR/nvm.sh
  cd '${APP_DIR}'
  npm install
  npm run build
"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  log "Copying .env.example -> .env (please edit secrets)"
  sudo -u "$APP_USER" cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
fi

log "Installing systemd unit..."
install -m 0644 "${APP_DIR}/deploy/survive-agent.service" /etc/systemd/system/survive-agent.service
systemctl daemon-reload

log "Enabling firewall (allow only SSH outbound)..."
ufw allow OpenSSH || true
yes | ufw enable || true

log "Setup complete."
log "Next:"
log "  1. Edit ${APP_DIR}/.env with real secrets"
log "  2. systemctl start survive-agent"
log "  3. journalctl -u survive-agent -f"
