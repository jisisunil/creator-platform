#!/bin/bash
# Updates the pilot to the latest code on main (docs/runbooks/oracle-free.md):
#   bash infra/oracle/update.sh
# Backs up first, pulls, then rebuilds and restarts through setup.sh (migrations included).
set -euo pipefail
cd "$(dirname "$0")"
bash backup.sh
git -C ../.. pull --ff-only
bash setup.sh
