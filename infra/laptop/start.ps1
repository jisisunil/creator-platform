# Starts the closed pilot on this computer (docs/runbooks/laptop-pilot.md):
#   powershell -ExecutionPolicy Bypass -File infra\laptop\start.ps1
# First run: creates pilot.env with fresh secrets and stops so you can fill it in.
# Every run: builds the app if needed, (re)starts the tunnel (your own domain when pilot.env
# has PUBLIC_URL and TUNNEL_TOKEN, else a quick tunnel with a random address), applies
# migrations and reference data, starts the app and prints its public address.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Compose { docker compose --env-file pilot.env @args; if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed" } }
# Runs a command whose stderr is just progress: in Windows PowerShell 5.1, redirecting a
# program's stderr under ErrorActionPreference=Stop would abort on harmless messages.
function Quietly([scriptblock]$command) {
  $ErrorActionPreference = 'Continue'
  & $command
}
# A setting's value from pilot.env, or '' when it's missing or empty.
function Setting([string]$name) {
  $line = Select-String -Path pilot.env -Pattern "^$name=(.*)$" | Select-Object -First 1
  if ($line) { $line.Matches[0].Groups[1].Value.Trim() } else { '' }
}
function RandomBase64([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  [Convert]::ToBase64String($buffer)
}

Quietly { docker info *> $null }
if ($LASTEXITCODE -ne 0) { throw 'Docker is not running: start Docker Desktop first.' }

if (-not (Test-Path pilot.env)) {
  $settings = Get-Content pilot.env.example -Raw
  $settings = $settings -replace '(?m)^AUTH_SECRET=$', ('AUTH_SECRET=' + ((RandomBase64 32) -replace '[+/=]', ''))
  $settings = $settings -replace '(?m)^TOKEN_ENCRYPTION_KEY=$', ('TOKEN_ENCRYPTION_KEY=' + (RandomBase64 32))
  $settings = $settings -replace '(?m)^POSTGRES_PASSWORD=$', ('POSTGRES_PASSWORD=' + ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')))
  [System.IO.File]::WriteAllText("$PSScriptRoot\pilot.env", $settings)
  Write-Host 'Created infra\laptop\pilot.env with new secrets. Fill in every REPLACE_ME, then run start.ps1 again.'
  exit 1
}
# Only settings count; the file's instructions mention REPLACE_ME too.
if (Select-String -Path pilot.env -Pattern '^[^#].*REPLACE_ME' -Quiet) {
  throw 'pilot.env still has REPLACE_ME values: fill them in first.'
}
# Compose needs the file to exist before the tunnel's real address is known.
if (-not (Test-Path tunnel.env)) { Set-Content tunnel.env 'APP_URL=http://localhost:3000' }

Write-Host 'Building the app image (several minutes the first time)...'
Compose build web

$publicUrl = (Setting 'PUBLIC_URL').TrimEnd('/')
$tunnelToken = Setting 'TUNNEL_TOKEN'
if (($publicUrl -eq '') -ne ($tunnelToken -eq '')) {
  throw 'pilot.env: set both PUBLIC_URL and TUNNEL_TOKEN for your own domain, or leave both empty.'
}
if ($publicUrl -ne '' -and $publicUrl -notmatch '^https://[a-z0-9.-]+$') {
  throw 'pilot.env: PUBLIC_URL must look like https://example.com (no path).'
}

if ($publicUrl -ne '') {
  $address = $publicUrl
  Quietly { docker compose --env-file pilot.env stop tunnel 2> $null } | Out-Null
  Write-Host "Starting the tunnel for $address..."
  Compose --profile domain up -d domain-tunnel
} else {
  # A running quick tunnel keeps its address; a new one gets a new address.
  $running = Quietly { docker compose --env-file pilot.env ps --status running --services 2> $null }
  if ($running -notcontains 'tunnel') {
    Write-Host 'Starting the tunnel...'
    Compose up -d tunnel
  }
  $address = $null
  for ($i = 0; $i -lt 30 -and -not $address; $i++) {
    Start-Sleep 2
    $logs = Quietly { docker compose --env-file pilot.env logs tunnel 2>&1 | Out-String }
    $match = [regex]::Matches($logs, 'https://[a-z0-9-]+\.trycloudflare\.com') | Select-Object -Last 1
    if ($match) { $address = $match.Value }
  }
  if (-not $address) { throw 'The tunnel did not report an address; check: docker compose logs tunnel' }
}
Set-Content tunnel.env "APP_URL=$address"

Write-Host 'Starting the database and the malware scanner...'
Compose up -d --wait postgres
Compose up -d clamav
Write-Host 'Applying database migrations and reference data...'
Compose run --rm migrate
Compose run --rm reference-data
Write-Host 'Starting the app...'
Compose up -d --force-recreate --wait web worker

Write-Host ''
Write-Host "The pilot is running at: $address"
if ($publicUrl -ne '') {
  Write-Host 'Keep this computer on and awake. After a restart it comes back by itself once Docker Desktop starts.'
} else {
  Write-Host 'Keep this computer on and awake. If it restarts, run start.ps1 again (the address will change).'
}
