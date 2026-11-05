# Backs up the pilot's database and uploaded files to infra\laptop\backups (SR-15):
#   powershell -ExecutionPolicy Bypass -File infra\laptop\backup.ps1
# Schedule it daily with Windows Task Scheduler (docs/runbooks/laptop-pilot.md). Keeps the
# newest 14 backups. Copy the backups folder (and pilot.env) somewhere off this computer
# too: a backup on the same disk doesn't survive a lost or broken laptop.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$keep = 14
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHHmmZ')
$folder = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force $folder | Out-Null

# pg_dump writes inside the container and the file is copied out, so PowerShell never
# re-encodes the binary dump.
docker compose --env-file pilot.env exec -T postgres pg_dump --username creator --dbname creator_platform --format=custom --file /tmp/backup.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed: is the pilot running?' }
docker compose --env-file pilot.env cp postgres:/tmp/backup.dump (Join-Path $folder "database-$stamp.dump")
docker compose --env-file pilot.env exec -T postgres rm -f /tmp/backup.dump

docker run --rm -v creator-pilot_files:/data:ro -v "${folder}:/backup" alpine:3.22 tar czf "/backup/files-$stamp.tgz" -C /data .
if ($LASTEXITCODE -ne 0) { throw 'Backing up uploaded files failed' }

foreach ($pattern in 'database-*.dump', 'files-*.tgz') {
  Get-ChildItem $folder -Filter $pattern | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item
}
Write-Host "Backed up to $folder (database-$stamp.dump, files-$stamp.tgz)"
