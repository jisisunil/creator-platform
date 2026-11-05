# Stops the pilot; all data stays (docs/runbooks/laptop-pilot.md). start.ps1 brings it back
# with a new public address.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
docker compose --env-file pilot.env stop
if ($LASTEXITCODE -ne 0) { throw 'docker compose stop failed' }
Write-Host 'Pilot stopped. Data is kept; run start.ps1 to start it again.'
