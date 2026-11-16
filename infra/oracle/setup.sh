#!/bin/bash
# Sets up and (re)starts the pilot on an Oracle Cloud Ubuntu server (docs/runbooks/oracle-free.md):
#   bash infra/oracle/setup.sh
# First run: installs Docker, opens ports 80/443, creates server.env with fresh secrets and
# stops so you can fill it in. Every run after: builds the app, applies migrations and
# reference data and (re)starts everything. Safe to run again at any time.
set -euo pipefail
cd "$(dirname "$0")"
compose() { sudo docker compose --env-file server.env "$@"; }

# --- Docker, from Docker's own apt repository (once) ---
if ! command -v docker > /dev/null; then
  echo 'Installing Docker...'
  sudo apt-get update -q
  sudo apt-get install -yq ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  codename="$(grep '^VERSION_CODENAME=' /etc/os-release | cut -d= -f2)"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" |
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -q
  sudo apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
fi

# --- Ports 80 and 443: Oracle's Ubuntu images block them in iptables (once) ---
if ! sudo iptables -C INPUT -p tcp -m multiport --dports 80,443 -m state --state NEW -j ACCEPT 2> /dev/null; then
  echo 'Opening ports 80 and 443 in the server firewall...'
  sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -m state --state NEW -j ACCEPT
  sudo apt-get install -yq iptables-persistent > /dev/null
  sudo netfilter-persistent save
fi

# --- Settings and secrets (once) ---
if [ ! -f server.env ]; then
  umask 077
  sed -e "s|^AUTH_SECRET=\$|AUTH_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^TOKEN_ENCRYPTION_KEY=\$|TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
      -e "s|^POSTGRES_PASSWORD=\$|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" \
      server.env.example > server.env
  echo 'Created infra/oracle/server.env with new secrets.'
  echo 'Fill in every REPLACE_ME (nano infra/oracle/server.env), then run setup.sh again.'
  exit 1
fi
# Only settings count; the file's instructions mention REPLACE_ME too.
if grep -q '^[^#].*REPLACE_ME' server.env; then
  echo 'server.env still has REPLACE_ME values: fill them in first.' >&2
  exit 1
fi
domain="$(grep '^DOMAIN=' server.env | cut -d= -f2-)"

# --- The domain must point here before Let's Encrypt can issue a certificate ---
public_ip="$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]' || true)"
resolved="$(getent ahostsv4 "$domain" | awk 'NR==1 {print $1}' || true)"
if [ -z "$resolved" ]; then
  echo "Warning: $domain doesn't resolve yet. Add an A record to $public_ip at your domain registrar;" >&2
  echo 'the site starts anyway and gets its certificate once DNS works.' >&2
elif [ -n "$public_ip" ] && [ "$resolved" != "$public_ip" ]; then
  echo "Warning: $domain points to $resolved, but this server is $public_ip. Fix the A record." >&2
fi

echo 'Building the app image (10-15 minutes the first time)...'
compose build web
echo 'Starting the database and the malware scanner...'
compose up -d --wait postgres
compose up -d clamav
echo 'Applying database migrations and reference data...'
compose run --rm migrate
compose run --rm reference-data
echo 'Starting the app and the web server...'
compose up -d --wait web worker
compose up -d caddy

# --- Daily backups at 02:30 server time, 14 kept (backup.sh) ---
backup_line="30 2 * * * bash $(pwd)/backup.sh >> $(pwd)/backups/backup.log 2>&1"
mkdir -p backups
if ! crontab -l 2> /dev/null | grep -qF "$(pwd)/backup.sh"; then
  (crontab -l 2> /dev/null || true; echo "$backup_line") | crontab -
  echo 'Scheduled daily backups.'
fi

echo
echo "The pilot is running at: https://$domain"
echo 'The first visit can take a minute while the certificate is issued.'
