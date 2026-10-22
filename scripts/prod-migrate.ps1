# Applies new migrations to the LIVE (Neon) database: drizzle-kit migrate over the direct address from the git-ignored
# .env.vercel (MIGRATION_DATABASE_URL; Neon advises direct, not pooled, connections for schema changes).
# The connection string is read here and never printed. Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File scripts\prod-migrate.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$line = Get-Content ".env.vercel" | Where-Object { $_ -match '^MIGRATION_DATABASE_URL=' } | Select-Object -First 1
$url = ($line -replace '^MIGRATION_DATABASE_URL=', '').Trim().Trim('"')
if (-not $url) { Write-Output "MIGRATION_DATABASE_URL is empty in .env.vercel"; exit 1 }
$env:DATABASE_URL = $url   # drizzle.config.ts loads .env.local with dotenv, which never overrides this
# The home router refuses DNS for *.neon.tech: resolve those through public DNS in this process only.
$env:NODE_OPTIONS = "--import ./scripts/dns-public.mjs --no-warnings"
& npx.cmd drizzle-kit migrate 2>&1 | ForEach-Object { $_.ToString().Replace($url, "<neon-url>") }
exit $LASTEXITCODE
